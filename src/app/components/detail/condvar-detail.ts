import { ChangeDetectionStrategy, Component, OnDestroy, computed } from '@angular/core';
import { SteppedAnim } from './stepped';

interface CvStep {
  cl: number | null; // línea resaltada en el código del consumidor
  pl: number | null; // línea resaltada en el código del productor
  lock: 'C' | 'P' | null;
  sleeping: boolean; // C está en la cola de la condvar
  ready: boolean; // C fue notificado pero aún no re-adquirió el lock
  dato: boolean;
  cpuC: number; // % de CPU del consumidor en este paso
  msg: string;
}

const C_CODE = [
  'let mut listo = lock.lock().unwrap();',
  'while !*listo {',
  '    listo = cvar.wait(listo).unwrap();',
  '}',
  'consumir(); // (drop suelta el lock)',
];

const P_CODE = [
  'let mut listo = lock.lock().unwrap();',
  '*listo = true;',
  'cvar.notify_one();',
  'drop(listo); // suelta el lock',
];

const STEPS: CvStep[] = [
  {
    cl: 0, pl: null, lock: 'C', sleeping: false, ready: false, dato: false, cpuC: 12,
    msg: 'El <strong>consumidor</strong> toma el lock. Necesita el lock para leer la condición: la condición vive en estado compartido.',
  },
  {
    cl: 1, pl: null, lock: 'C', sleeping: false, ready: false, dato: false, cpuC: 12,
    msg: 'Chequea la condición: <code>listo == false</code>. Todavía no hay nada para consumir. ¿Y ahora? Si suelta el lock y re-chequea en un loop, eso es <strong>busy-waiting</strong>: 100% de CPU en preguntar.',
  },
  {
    cl: 2, pl: null, lock: null, sleeping: true, ready: false, dato: false, cpuC: 0,
    msg: '<code>wait()</code> hace DOS cosas <strong>atómicamente</strong>: <strong>suelta el lock</strong> y <strong>duerme</strong> al hilo en la cola de la condvar. Si no fuera atómico, el notify podría colarse entre medio y perderse (lost wakeup). CPU del consumidor: 0%.',
  },
  {
    cl: 2, pl: 0, lock: 'P', sleeping: true, ready: false, dato: false, cpuC: 0,
    msg: 'El <strong>productor</strong> puede tomar el lock — justamente porque wait() lo soltó. Si wait() se durmiera CON el lock, el productor jamás podría producir: deadlock.',
  },
  {
    cl: 2, pl: 1, lock: 'P', sleeping: true, ready: false, dato: true, cpuC: 0,
    msg: 'El productor hace verdadera la condición: <code>*listo = true</code>. Nota: la muta con el lock tomado.',
  },
  {
    cl: 2, pl: 2, lock: 'P', sleeping: false, ready: true, dato: true, cpuC: 0,
    msg: '<code>notify_one()</code>: despierta a UN hilo de la cola. El consumidor pasa a "listo para despertar"… pero <strong>no puede correr todavía</strong>: wait() debe re-adquirir el lock, y lo tiene el productor.',
  },
  {
    cl: 2, pl: 3, lock: null, sleeping: false, ready: true, dato: true, cpuC: 0,
    msg: 'El productor suelta el lock. Ahora sí el consumidor puede completar su despertar.',
  },
  {
    cl: 2, pl: null, lock: 'C', sleeping: false, ready: false, dato: true, cpuC: 12,
    msg: 'El consumidor <strong>re-adquiere el lock</strong> y wait() retorna. Volvió exactamente a donde estaba, con el lock en la mano.',
  },
  {
    cl: 1, pl: null, lock: 'C', sleeping: false, ready: false, dato: true, cpuC: 12,
    msg: 'Vuelve al <code>while</code> y <strong>re-chequea la condición</strong>. ¿Por qué while y no if? (1) <strong>spurious wakeups</strong>: el SO puede despertarte sin notify; (2) otro hilo pudo ganarte el lock y consumir el dato antes que vos. La condición se re-verifica SIEMPRE con el lock tomado.',
  },
  {
    cl: 4, pl: null, lock: 'C', sleeping: false, ready: false, dato: true, cpuC: 55,
    msg: 'Condición verdadera → sale del loop y consume, con el lock. Total de CPU gastada esperando: <strong>~0%</strong>. El busy-waiting hubiera quemado un core entero todo ese tiempo.',
  },
];

/**
 * Condvar wait/notify paso a paso: dos paneles de código con línea resaltada,
 * el lock, la cola de la condvar y el medidor de CPU vs busy-waiting.
 */
@Component({
  selector: 'app-condvar-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="anim">
      <div class="head">
        <div class="titles">
          <div class="title">💤 Condvar: wait() y notify_one() paso a paso</div>
          <div class="caption">Seguí quién tiene el lock y cuándo duerme el consumidor.</div>
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
        <!-- consumidor -->
        <div class="codepanel" [class.holds]="cur()?.lock === 'C'">
          <div class="cp-head">
            <span class="cp-name c-t">🧵 Consumidor</span>
            <span class="cp-state">
              @if (cur()?.sleeping) { 😴 dormido en la condvar }
              @else if (cur()?.ready) { ⏳ notificado, espera el lock }
              @else if (cur()?.lock === 'C') { 🔒 tiene el lock }
              @else { — }
            </span>
          </div>
          @for (line of cCode; track $index; let i = $index) {
            <div class="cline" [class.hl]="cur()?.cl === i">{{ line }}</div>
          }
          <div class="cpu">
            <span class="cpu-label">CPU consumidor</span>
            <div class="cpu-track"><div class="cpu-bar" [style.width.%]="cur()?.cpuC ?? 0"></div></div>
            <span class="cpu-val">{{ cur()?.cpuC ?? 0 }}%</span>
          </div>
          <div class="cpu ghost">
            <span class="cpu-label">si fuera busy-wait</span>
            <div class="cpu-track"><div class="cpu-bar bad" [style.width.%]="busyCpu()"></div></div>
            <span class="cpu-val">{{ busyCpu() }}%</span>
          </div>
        </div>

        <!-- centro: lock / condvar / dato -->
        <div class="mid">
          <div class="box lockbox" [class.taken]="cur()?.lock !== null">
            <div class="b-label">Mutex</div>
            <div class="b-val">
              @if (cur()?.lock === 'C') { 🔒 Consumidor }
              @else if (cur()?.lock === 'P') { 🔒 Productor }
              @else { 🔓 libre }
            </div>
          </div>
          <div class="box cvbox">
            <div class="b-label">cola de la Condvar</div>
            <div class="b-val">
              @if (cur()?.sleeping) { 😴 [ Consumidor ] }
              @else { <span class="empty">[ vacía ]</span> }
            </div>
          </div>
          <div class="box databox" [class.true]="cur()?.dato">
            <div class="b-label">listo (estado compartido)</div>
            <div class="b-val mono">{{ cur()?.dato ? 'true' : 'false' }}</div>
          </div>
        </div>

        <!-- productor -->
        <div class="codepanel" [class.holds]="cur()?.lock === 'P'">
          <div class="cp-head">
            <span class="cp-name p-t">🧵 Productor</span>
            <span class="cp-state">
              @if (cur()?.lock === 'P') { 🔒 tiene el lock } @else { — }
            </span>
          </div>
          @for (line of pCode; track $index; let i = $index) {
            <div class="cline" [class.hl]="cur()?.pl === i">{{ line }}</div>
          }
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

    .board { display: grid; grid-template-columns: 1.2fr 0.8fr 1.2fr; gap: 12px; align-items: start; }
    .codepanel { background: #0b0f19; border: 1px solid var(--border); border-radius: 10px; padding: 10px; transition: border-color 0.25s, box-shadow 0.25s; }
    .codepanel.holds { border-color: #ffd54f; box-shadow: 0 0 12px rgba(255, 213, 79, 0.18); }
    .cp-head { display: flex; justify-content: space-between; align-items: center; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
    .cp-name { font-weight: 800; font-size: 0.85rem; }
    .c-t { color: #58a6ff; }
    .p-t { color: #7ee787; }
    .cp-state { font-size: 0.68rem; color: var(--text-dim); }
    .cline { font-family: Consolas, monospace; font-size: 0.72rem; padding: 3px 8px; border-radius: 5px; color: #8b95b5; white-space: pre; overflow-x: auto; }
    .cline.hl { background: #2a2a1a; color: #fff; border-left: 3px solid #ffd54f; }

    .cpu { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
    .cpu.ghost { opacity: 0.75; margin-top: 4px; }
    .cpu-label { font-size: 0.62rem; color: var(--text-dim); width: 90px; flex-shrink: 0; }
    .cpu-track { flex: 1; height: 8px; background: #10151f; border: 1px solid var(--border); border-radius: 5px; overflow: hidden; }
    .cpu-bar { height: 100%; background: #58a6ff; transition: width 0.4s; }
    .cpu-bar.bad { background: #ef5350; }
    .cpu-val { font-family: Consolas, monospace; font-size: 0.66rem; color: var(--text-dim); width: 36px; text-align: right; }

    .mid { display: flex; flex-direction: column; gap: 8px; }
    .box { background: #10151f; border: 1px solid var(--border); border-radius: 10px; padding: 8px 12px; text-align: center; transition: border-color 0.25s; }
    .box.lockbox.taken { border-color: #ffd54f; }
    .box.databox.true { border-color: #7ee787; }
    .b-label { font-size: 0.64rem; text-transform: uppercase; letter-spacing: 1px; color: #5c6a8e; font-weight: 700; }
    .b-val { font-size: 0.88rem; font-weight: 700; color: var(--text); margin-top: 3px; }
    .b-val.mono { font-family: Consolas, monospace; }
    .box.databox.true .b-val { color: #7ee787; }
    .empty { color: #5c6a8e; font-style: italic; font-weight: 400; }

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
      .mid { flex-direction: row; flex-wrap: wrap; }
      .box { flex: 1; min-width: 140px; }
    }
  `,
})
export class CondvarDetail extends SteppedAnim implements OnDestroy {
  readonly steps = STEPS;
  readonly cCode = C_CODE;
  readonly pCode = P_CODE;

  protected stepCount(): number {
    return STEPS.length;
  }
  protected override stepTravel(_i: number): number {
    return 600;
  }
  protected override stepDwell(_i: number): number {
    return 3600;
  }

  readonly cur = computed(() => {
    const i = this.index();
    if (i < 0 || this.finished()) return i < 0 ? null : STEPS[STEPS.length - 1];
    return STEPS[i];
  });

  /** el "fantasma" busy-wait quema 100% mientras la condición sea falsa */
  readonly busyCpu = computed(() => {
    const c = this.cur();
    if (!c) return 0;
    return c.dato ? 55 : 100;
  });

  readonly statusMsg = computed(() => {
    if (this.finished()) {
      return '<strong>Resumen:</strong> wait() = soltar el lock + dormirse, atómico; al despertar re-adquiere el lock; la condición se re-chequea con <code>while</code> por los spurious wakeups y por los hilos que se cuelan. notify_one() despierta uno; notify_all() despierta a todos (y todos re-compiten por el lock).';
    }
    const i = this.index();
    if (i < 0) {
      return 'Presioná ▶ Play. Escenario: el consumidor necesita esperar a que <code>listo == true</code> sin quemar CPU.';
    }
    return STEPS[i].msg;
  });

  ngOnDestroy(): void {
    this.destroy();
  }
}
