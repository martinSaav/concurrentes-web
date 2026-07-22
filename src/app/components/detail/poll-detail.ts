import { ChangeDetectionStrategy, Component, OnDestroy, computed } from '@angular/core';
import { SteppedAnim } from './stepped';

interface PollStep {
  cl: number | null; // línea resaltada del código
  state: number; // índice del estado de la máquina
  vars: string[]; // qué guarda el future en este punto
  exec: 'poll' | 'sleep' | 'wake' | 'idle' | 'done'; // qué hace block_on
  polls: number;
  msg: string;
}

const CODE = [
  'async fn cheapo_request(host, port, path)',
  '  let mut socket =',
  '    TcpStream::connect((host, port)).await?;',
  '  socket.write_all(request).await?;',
  '  let mut response = String::new();',
  '  socket.read_to_string(&mut response).await?;',
  '  Ok(response)',
];

const STATES = ['Inicio', 'esperando connect', 'esperando write', 'esperando read', 'Ready ✔'];

const STEPS: PollStep[] = [
  {
    cl: 0, state: 0, vars: ['host', 'port', 'path'], exec: 'idle', polls: 0,
    msg: 'main llama <code>cheapo_request(…)</code> y la función retorna <strong>INMEDIATAMENTE</strong> — sin ejecutar ni una línea del cuerpo. Lo que devuelve es un <strong>Future</strong>: un struct (generado por el compilador) que guarda los argumentos y en qué estado va. Las futures son <strong>perezosas</strong>.',
  },
  {
    cl: 2, state: 1, vars: ['host', 'port', 'path', 'socket (a medias)'], exec: 'poll', polls: 1,
    msg: '<code>block_on</code> hace <strong>poll #1</strong>: recién AHORA corre el cuerpo, hasta el <strong>primer await</strong>. El connect lanza la syscall pero la red no respondió todavía → el await devuelve <strong>Pending</strong>, y toda la función devuelve Pending. El future guardó su estado: "esperando connect" + variables locales.',
  },
  {
    cl: null, state: 1, vars: ['host', 'port', 'path', 'socket (a medias)'], exec: 'sleep', polls: 1,
    msg: '<code>poll()</code> <strong>NUNCA bloquea</strong>: retorna Pending y listo. block_on se va a <strong>dormir</strong> — no hay busy-waiting: registró un <strong>waker</strong> en el Context y el SO lo despierta cuando la syscall esté lista.',
  },
  {
    cl: null, state: 1, vars: ['host', 'port', 'path', 'socket (a medias)'], exec: 'wake', polls: 1,
    msg: '🔔 La red terminó el handshake: el <strong>waker</strong> despierta a block_on. Ojo: despertar no significa "el valor ya está" — significa "vale la pena pollear de nuevo". Se pollea solo cuando puede haber progreso.',
  },
  {
    cl: 3, state: 2, vars: ['socket ✔', 'request'], exec: 'poll', polls: 2,
    msg: '<strong>Poll #2</strong>: la ejecución <strong>CONTINÚA desde el await del connect</strong> — no desde el principio. El socket está listo, sigue hasta el await de <code>write_all</code> → Pending otra vez. Cada poll <strong>avanza todo lo que puede</strong>.',
  },
  {
    cl: 5, state: 3, vars: ['socket ✔', 'response (vacía)'], exec: 'poll', polls: 3,
    msg: 'El write terminó → <strong>poll #3</strong> continúa, crea <code>response</code> y llega al await de <code>read_to_string</code> → Pending. Fijate que las variables locales viven <strong>adentro del future</strong>, no en el stack: por eso puede "pausarse" y retomarse.',
  },
  {
    cl: 6, state: 4, vars: ['response ✔'], exec: 'poll', polls: 4,
    msg: 'Llegó la respuesta → <strong>poll #4</strong> corre hasta el final y retorna <strong>Poll::Ready(Ok(response))</strong>. El modelo <strong>piñata</strong> 🪅 de la teórica: al future le pegás con poll hasta que cae el valor.',
  },
  {
    cl: null, state: 4, vars: ['response ✔'], exec: 'done', polls: 4,
    msg: '<code>block_on</code> devuelve el valor a main. Total: <strong>4 polls, cero bloqueos dentro de poll</strong>. En la versión sincrónica, el hilo se pasaba TODO ese tiempo bloqueado en syscalls sin poder hacer otra cosa.',
  },
];

/**
 * El ciclo de poll paso a paso sobre cheapo_request (el ejemplo de la teórica):
 * async fn como máquina de estados, Pending/Ready, waker, y el modelo piñata.
 */
@Component({
  selector: 'app-poll-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="anim">
      <div class="head">
        <div class="titles">
          <div class="title">🪅 poll() por adentro: la vida de cheapo_request</div>
          <div class="caption">Una async fn compila a una máquina de estados que se avanza a golpes de poll.</div>
        </div>
        <div class="controls">
          <button class="ctl" (click)="prev()" [disabled]="index() < 0">⏮</button>
          <button class="ctl play" (click)="toggle()">
            {{ playing() ? '⏸ Pausa' : finished() ? '↺ Repetir' : '▶ Play' }}
          </button>
          <button class="ctl" (click)="next()" [disabled]="finished()">⏭</button>
          <div class="speeds">
            @for (s of speedOptions; track s) {
              <button class="spd" [class.on]="speed() === s" (click)="setSpeed(s)">{{ s }}×</button>
            }
          </div>
        </div>
      </div>

      <div class="board">
        <!-- código -->
        <div class="codepanel">
          <div class="cp-head">async fn (lo que escribís)</div>
          @for (line of code; track $index; let i = $index) {
            <div class="cline" [class.hl]="cur()?.cl === i">{{ line }}</div>
          }
          <div class="mainline">main → <code>block_on(cheapo_request("example.com", 80, "/"))</code></div>
        </div>

        <!-- future + executor -->
        <div class="mid">
          <div class="fut">
            <div class="b-label">el FUTURE (struct generado al compilar)</div>
            <div class="machine">
              @for (s of states; track $index; let i = $index) {
                <div class="st" [class.now]="cur()?.state === i" [class.past]="(cur()?.state ?? -1) > i">
                  {{ s }}
                </div>
                @if (i < states.length - 1) { <span class="st-arrow">→</span> }
              }
            </div>
            <div class="vars">
              <span class="vars-label">guarda:</span>
              @for (v of cur()?.vars ?? []; track $index) {
                <span class="var">{{ v }}</span>
              }
            </div>
          </div>

          <div class="exec" [class.polling]="cur()?.exec === 'poll'" [class.sleeping]="cur()?.exec === 'sleep'">
            <div class="b-label">block_on (el executor)</div>
            <div class="ex-state">
              @switch (cur()?.exec) {
                @case ('idle') { esperando que le den un future }
                @case ('poll') { ⚡ poll() #{{ cur()?.polls }} → avanza la máquina }
                @case ('sleep') { 😴 durmiendo — esperando al waker }
                @case ('wake') { 🔔 waker: "¡puede haber progreso!" }
                @case ('done') { ✔ Ready → devuelve el valor a main }
                @default { — }
              }
            </div>
            <div class="pollcount">polls: <strong>{{ cur()?.polls ?? 0 }}</strong> · bloqueos dentro de poll: <strong>0</strong></div>
          </div>
        </div>
      </div>

      <div class="status" [class.done]="finished()" [class.idle]="index() < 0">
        @if (index() >= 0 && !finished()) {
          <span class="stepno">{{ index() + 1 }}/{{ steps.length }}</span>
        }
        @if (finished()) {
          <span class="stepno ok">✔</span>
        }
        <span [innerHTML]="statusMsg()"></span>
      </div>

      <div class="dots">
        @for (st of steps; track $index; let i = $index) {
          <button class="dot" [class.past]="i < index() || finished()" [class.now]="i === index() && !finished()" (click)="jump(i)"></button>
        }
      </div>
    </div>
  `,
  styles: `
    .anim { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin: 18px 0; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
    .title { font-weight: 700; font-size: 1.02rem; color: #fff; }
    .caption { color: var(--text-dim); font-size: 0.85rem; margin-top: 2px; }
    .controls { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .ctl { background: var(--panel-2); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 7px 12px; cursor: pointer; font-size: 0.9rem; }
    .ctl:hover:not(:disabled) { background: #2d3750; }
    .ctl:disabled { opacity: 0.35; cursor: default; }
    .ctl.play { background: #1f6feb; border-color: #1f6feb; color: #fff; font-weight: 700; min-width: 96px; }
    .speeds { display: flex; gap: 2px; margin-left: 6px; background: var(--panel-2); border-radius: 8px; padding: 2px; border: 1px solid var(--border); }
    .spd { background: transparent; color: var(--text-dim); border: none; border-radius: 6px; padding: 5px 8px; cursor: pointer; font-size: 0.78rem; }
    .spd.on { background: #1f6feb; color: #fff; font-weight: 700; }

    .board { display: grid; grid-template-columns: 1.15fr 1fr; gap: 12px; align-items: start; }
    .codepanel { background: #0b0f19; border: 1px solid var(--border); border-radius: 10px; padding: 10px; }
    .cp-head { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 1px; color: #5c6a8e; font-weight: 700; margin-bottom: 8px; }
    .cline { font-family: Consolas, monospace; font-size: 0.72rem; padding: 3px 8px; border-radius: 5px; color: #8b95b5; white-space: pre; overflow-x: auto; }
    .cline.hl { background: #2a2a1a; color: #fff; border-left: 3px solid #ffd54f; }
    .mainline { margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--border); font-size: 0.7rem; color: var(--text-dim); }

    .mid { display: flex; flex-direction: column; gap: 10px; }
    .fut { background: #10151f; border: 1.5px solid #a78bfa66; border-radius: 10px; padding: 10px 12px; }
    .b-label { font-size: 0.64rem; text-transform: uppercase; letter-spacing: 1px; color: #5c6a8e; font-weight: 700; margin-bottom: 7px; }
    .machine { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
    .st { font-size: 0.66rem; font-weight: 700; border: 1px solid #39445f; color: var(--text-dim); border-radius: 7px; padding: 3px 8px; background: #1a2132; transition: all 0.25s; }
    .st.now { border-color: #ffd54f; color: #ffd54f; background: #2a2a1a; box-shadow: 0 0 10px rgba(255, 213, 79, 0.2); }
    .st.past { border-color: #2ea04366; color: #7ee787; opacity: 0.7; }
    .st-arrow { color: #5c6a8e; font-size: 0.7rem; }
    .vars { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; margin-top: 9px; }
    .vars-label { font-size: 0.64rem; color: #5c6a8e; }
    .var { font-family: Consolas, monospace; font-size: 0.64rem; color: #d2b9ff; background: #1a2132; border: 1px solid #a78bfa44; border-radius: 5px; padding: 1px 7px; }

    .exec { background: #10151f; border: 1.5px solid var(--border); border-radius: 10px; padding: 10px 12px; transition: border-color 0.25s; }
    .exec.polling { border-color: #58a6ff; }
    .exec.sleeping { border-color: #39445f; opacity: 0.85; }
    .ex-state { font-size: 0.85rem; font-weight: 700; color: var(--text); min-height: 24px; }
    .pollcount { margin-top: 6px; font-size: 0.7rem; color: var(--text-dim); }
    .pollcount strong { color: #7ee787; font-family: Consolas, monospace; }

    .status { display: flex; align-items: center; gap: 10px; margin-top: 12px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 11px 14px; min-height: 50px; font-size: 0.95rem; line-height: 1.45; }
    .status.done { border-color: #2ea04366; background: rgba(46, 160, 67, 0.1); }
    .status.idle { color: var(--text-dim); font-style: italic; }
    .stepno { flex-shrink: 0; background: #1f6feb; color: #fff; border-radius: 6px; font-size: 0.75rem; font-weight: 700; padding: 2px 8px; }
    .stepno.ok { background: #2ea043; }
    .dots { display: flex; gap: 6px; margin-top: 10px; justify-content: center; flex-wrap: wrap; }
    .dot { width: 12px; height: 12px; border-radius: 50%; border: 1px solid var(--border); background: var(--panel-2); cursor: pointer; padding: 0; transition: transform 0.15s; }
    .dot:hover { transform: scale(1.3); }
    .dot.past { background: #1f6feb; border-color: #1f6feb; }
    .dot.now { background: #ffd54f; border-color: #ffd54f; }

    @media (max-width: 720px) {
      .board { grid-template-columns: 1fr; }
    }
  `,
})
export class PollDetail extends SteppedAnim implements OnDestroy {
  readonly steps = STEPS;
  readonly code = CODE;
  readonly states = STATES;

  protected stepCount(): number {
    return STEPS.length;
  }
  protected override stepTravel(_i: number): number {
    return 600;
  }
  protected override stepDwell(_i: number): number {
    return 4200;
  }

  readonly cur = computed(() => {
    const i = this.index();
    if (i < 0) return null;
    if (this.finished()) return STEPS[STEPS.length - 1];
    return STEPS[i];
  });

  readonly statusMsg = computed(() => {
    if (this.finished()) {
      return '<strong>Las preguntas clave:</strong> ¿qué pasa al invocar una async fn? Nada: retorna un future perezoso. ¿Quién la ejecuta? El executor, a golpes de poll. ¿Poll bloquea? JAMÁS: retorna Ready o Pending. ¿Cómo "continúa" tras un await? El future es una máquina de estados que guarda el punto y las variables. ¿Y quién avisa que hay progreso? El waker del Context.';
    }
    const i = this.index();
    if (i < 0) {
      return 'Presioná ▶ Play. Es el <code>cheapo_request</code> de la teórica: un GET HTTP con tres awaits (connect, write, read).';
    }
    return STEPS[i].msg;
  });

  ngOnDestroy(): void {
    this.destroy();
  }
}
