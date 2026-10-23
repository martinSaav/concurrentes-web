import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

type Kind = 'rc' | 'arc';

interface Ref {
  id: number;
  owner: 0 | 1; // 0 = hilo principal, 1 = hilo secundario
}

/**
 * Arc vs Rc: el contador de referencias y por qué Rc no es Send.
 * Incluye la simulación del incremento NO atómico del contador de Rc,
 * que es exactamente la razón por la que el compilador lo prohíbe.
 */
@Component({
  selector: 'app-arc-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="anim">
      <div class="head">
        <div class="titles">
          <div class="title">🔗 Arc vs Rc: el contador de referencias</div>
          <div class="caption">Clonar sube el contador; dropear lo baja. En 0, el dato se libera.</div>
        </div>
        <div class="controls">
          <div class="modes">
            <button class="mode rc" [class.on]="kind() === 'rc'" (click)="setKind('rc')">Rc&lt;T&gt;</button>
            <button class="mode arc" [class.on]="kind() === 'arc'" (click)="setKind('arc')">Arc&lt;T&gt;</button>
          </div>
          <button class="ctl" (click)="reset()">↺ Reset</button>
        </div>
      </div>

      <div class="board">
        <!-- hilo principal -->
        <div class="thread">
          <div class="th-head">🧵 hilo principal</div>
          <div class="refs">
            @for (r of refsOf(0); track r.id) {
              <span class="ref">{{ kind() === 'rc' ? 'Rc' : 'Arc' }} #{{ r.id }}</span>
            }
            @if (refsOf(0).length === 0) { <span class="none">— sin referencias —</span> }
          </div>
          <div class="acts">
            <button class="act" (click)="clone(0)" [disabled]="freed() || refsOf(0).length === 0">
              + clone()
            </button>
            <button class="act" (click)="drop(0)" [disabled]="refsOf(0).length === 0">
              − drop()
            </button>
          </div>
        </div>

        <!-- heap -->
        <div class="heap" [class.freed]="freed()">
          <div class="heap-label">HEAP</div>
          <div class="cell">
            <div class="c-label">contador</div>
            <div class="c-val" [class.zero]="count() === 0">{{ displayCount() }}</div>
            <div class="c-kind" [class.at]="kind() === 'arc'">
              {{ kind() === 'arc' ? 'atómico ✔' : 'NO atómico ⚠' }}
            </div>
          </div>
          <div class="cell data" [class.gone]="freed()">
            <div class="c-label">dato</div>
            <div class="d-val">{{ freed() ? '💀 liberado' : 'vec![1, 2, 3]' }}</div>
          </div>
        </div>

        <!-- hilo secundario -->
        <div class="thread" [class.off]="!spawned()">
          <div class="th-head">🧵 hilo 2 {{ spawned() ? '' : '(no lanzado)' }}</div>
          <div class="refs">
            @for (r of refsOf(1); track r.id) {
              <span class="ref">{{ kind() === 'rc' ? 'Rc' : 'Arc' }} #{{ r.id }}</span>
            }
            @if (refsOf(1).length === 0) { <span class="none">— sin referencias —</span> }
          </div>
          <div class="acts">
            <button class="act send" (click)="sendToThread()" [disabled]="freed() || refsOf(0).length === 0">
              📤 mover a otro hilo
            </button>
            <button class="act" (click)="drop(1)" [disabled]="refsOf(1).length === 0">− drop()</button>
          </div>
        </div>
      </div>

      @if (compileError()) {
        <div class="cerror">
          <div class="ce-head">❌ error[E0277]: <code>Rc&lt;Vec&lt;i32&gt;&gt;</code> cannot be sent between threads safely</div>
          <div class="ce-body">
            <code>the trait \`Send\` is not implemented for \`Rc&lt;Vec&lt;i32&gt;&gt;\`</code><br />
            <strong>No compila.</strong> El compilador lo frena <em>antes</em> de que exista el bug.
            La razón está abajo 👇
          </div>
          <button class="ctl demo" (click)="raceDemo()">🔬 ver POR QUÉ es peligroso</button>
        </div>
      }

      @if (race(); as r) {
        <div class="race">
          <div class="r-head">🔬 Qué pasaría si Rc cruzara hilos: <code>contador += 1</code> desde dos hilos</div>
          <div class="r-steps">
            @for (s of r.steps; track $index) {
              <div class="r-step" [class.bad]="s.bad">
                <span class="r-th" [class.t2]="s.th === 2">T{{ s.th }}</span>
                <span [innerHTML]="s.text"></span>
              </div>
            }
          </div>
          <div class="r-out">
            Contador real: <strong class="bad-t">{{ r.final }}</strong> · debería ser
            <strong class="ok-t">3</strong> → cuando cada hilo dropee su referencia, el contador
            llega a 0 <strong>antes de tiempo</strong> y el dato se libera mientras alguien lo sigue
            usando: <strong class="bad-t">use after free</strong> 💥
          </div>
        </div>
      }

      <div class="status" [class.idle]="!msg()">
        @if (msg(); as m) {
          <span [innerHTML]="m"></span>
        } @else {
          <strong>Rc</strong> y <strong>Arc</strong> hacen lo mismo — compartir ownership contando
          referencias — pero <strong>Arc usa un contador atómico</strong>. Probá mover cada uno a otro hilo.
        }
      </div>
    </div>
  `,
  styles: `
    .anim { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin: 18px 0; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
    .title { font-weight: 700; font-size: 1.02rem; color: #fff; }
    .caption { color: var(--text-dim); font-size: 0.85rem; margin-top: 2px; }
    .controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .ctl { background: var(--panel-2); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 7px 12px; cursor: pointer; font-size: 0.86rem; }
    .ctl:hover { background: #2d3750; }
    .modes { display: flex; background: var(--panel-2); border: 1px solid var(--border); border-radius: 8px; padding: 2px; gap: 2px; }
    .mode { background: transparent; border: none; color: var(--text-dim); border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 0.8rem; font-weight: 700; font-family: Consolas, monospace; }
    .mode.rc.on { background: #c73e3a; color: #fff; }
    .mode.arc.on { background: #2ea043; color: #fff; }

    .board { display: grid; grid-template-columns: 1fr 0.9fr 1fr; gap: 12px; align-items: stretch; }
    .thread { background: #10151f; border: 1px solid var(--border); border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 8px; transition: opacity 0.2s; }
    .thread.off { opacity: 0.55; }
    .th-head { font-weight: 800; font-size: 0.82rem; color: #fff; }
    .refs { display: flex; flex-wrap: wrap; gap: 4px; min-height: 30px; align-content: flex-start; }
    .ref { background: #1a2132; border: 1px solid #58a6ff88; color: #79c0ff; border-radius: 5px; padding: 2px 8px; font-size: 0.68rem; font-family: Consolas, monospace; }
    .none { font-size: 0.7rem; color: #5c6a8e; font-style: italic; }
    .acts { display: flex; gap: 5px; flex-wrap: wrap; margin-top: auto; }
    .act { flex: 1; min-width: 84px; background: var(--panel-2); color: var(--text); border: 1px solid var(--border); border-radius: 7px; padding: 6px 8px; cursor: pointer; font-size: 0.72rem; font-weight: 600; }
    .act:hover:not(:disabled) { background: #2d3750; }
    .act:disabled { opacity: 0.35; cursor: default; }
    .act.send { border-color: #f0883e88; color: #ffab70; }

    .heap { background: radial-gradient(ellipse at 50% 40%, #202a40 0%, #171e2e 80%); border: 2px solid #39445f; border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 8px; align-items: center; justify-content: center; transition: border-color 0.3s; }
    .heap.freed { border-color: #ef5350; }
    .heap-label { font-size: 0.62rem; letter-spacing: 2px; color: #5c6a8e; font-weight: 800; }
    .cell { background: #0b0f19; border: 1px solid var(--border); border-radius: 8px; padding: 6px 16px; text-align: center; width: 100%; }
    .c-label { font-size: 0.6rem; color: #5c6a8e; text-transform: uppercase; letter-spacing: 1px; }
    .c-val { font-family: Consolas, monospace; font-size: 1.8rem; font-weight: 800; color: #7ee787; line-height: 1.15; }
    .c-val.zero { color: #ef9a9a; }
    .c-kind { font-size: 0.6rem; color: #ef9a9a; font-weight: 700; }
    .c-kind.at { color: #7ee787; }
    .d-val { font-family: Consolas, monospace; font-size: 0.78rem; color: var(--text); }
    .cell.data.gone .d-val { color: #ef9a9a; }

    .cerror { margin-top: 12px; background: rgba(239, 83, 80, 0.1); border: 1px solid #ef5350; border-radius: 10px; padding: 11px 14px; }
    .ce-head { font-family: Consolas, monospace; font-size: 0.8rem; color: #ef9a9a; font-weight: 700; margin-bottom: 6px; }
    .ce-body { font-size: 0.82rem; color: var(--text); line-height: 1.6; }
    .ce-body code { font-size: 0.76rem; }
    .ctl.demo { margin-top: 9px; background: #c73e3a; border-color: #c73e3a; color: #fff; font-weight: 700; }

    .race { margin-top: 12px; background: #10151f; border: 1px solid #ffd54f66; border-radius: 10px; padding: 11px 14px; }
    .r-head { font-size: 0.82rem; font-weight: 700; color: #ffd54f; margin-bottom: 8px; }
    .r-steps { display: flex; flex-direction: column; gap: 3px; }
    .r-step { display: flex; gap: 8px; align-items: baseline; font-size: 0.78rem; color: var(--text); }
    .r-step.bad { color: #ef9a9a; }
    .r-th { flex-shrink: 0; background: #1f6feb; color: #fff; border-radius: 4px; font-size: 0.64rem; font-weight: 800; padding: 0 6px; font-family: Consolas, monospace; }
    .r-th.t2 { background: #c73e3a; }
    .r-out { margin-top: 9px; padding-top: 8px; border-top: 1px dashed var(--border); font-size: 0.82rem; line-height: 1.6; }
    .bad-t { color: #ef9a9a; }
    .ok-t { color: #7ee787; }

    .status { margin-top: 12px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; min-height: 46px; font-size: 0.85rem; line-height: 1.55; }
    .status.idle { color: var(--text-dim); }

    @media (max-width: 720px) {
      .board { grid-template-columns: 1fr; }
    }
  `,
})
export class ArcDetail {
  readonly kind = signal<Kind>('rc');
  readonly refs = signal<Ref[]>([{ id: 1, owner: 0 }]);
  readonly freed = signal(false);
  readonly compileError = signal(false);
  readonly msg = signal<string | null>(null);
  readonly race = signal<{ steps: { th: number; text: string; bad?: boolean }[]; final: number } | null>(null);

  private seq = 1;

  readonly count = computed(() => this.refs().length);
  readonly spawned = computed(() => this.refs().some((r) => r.owner === 1));
  displayCount(): number {
    return this.freed() ? 0 : this.count();
  }

  refsOf(owner: 0 | 1): Ref[] {
    return this.refs().filter((r) => r.owner === owner);
  }

  setKind(k: Kind): void {
    if (this.kind() === k) return;
    this.kind.set(k);
    this.reset();
    this.msg.set(
      k === 'arc'
        ? '✅ <strong>Arc</strong>: el contador se actualiza con <strong>operaciones atómicas</strong>. Por eso implementa <code>Send</code> y <code>Sync</code>, y sí se puede compartir entre hilos (a costa de ser un poco más lento).'
        : '⚠️ <strong>Rc</strong>: contador NO atómico — más rápido, pero solo sirve <strong>dentro de un mismo hilo</strong>. Probá moverlo a otro hilo.',
    );
  }

  clone(owner: 0 | 1): void {
    if (this.freed()) return;
    this.seq++;
    this.refs.update((rs) => [...rs, { id: this.seq, owner }]);
    this.msg.set(
      `<code>${this.kind() === 'rc' ? 'Rc' : 'Arc'}::clone(&amp;dato)</code> → el contador sube a <strong>${this.count()}</strong>. ` +
        `Ojo: <strong>no se copia el dato</strong>, solo se crea otro puntero al mismo lugar del heap.`,
    );
  }

  drop(owner: 0 | 1): void {
    const mine = this.refsOf(owner);
    if (mine.length === 0) return;
    const victim = mine[mine.length - 1];
    this.refs.update((rs) => rs.filter((r) => r.id !== victim.id));
    if (this.count() === 0) {
      this.freed.set(true);
      this.msg.set(
        '💀 El contador llegó a <strong>0</strong> → se ejecuta el <code>Drop</code> y <strong>se libera la memoria</strong>. Ese es todo el mecanismo: el último en irse apaga la luz.',
      );
    } else {
      this.msg.set(`<code>drop()</code> → el contador baja a <strong>${this.count()}</strong>. El dato sigue vivo.`);
    }
  }

  sendToThread(): void {
    if (this.kind() === 'rc') {
      this.compileError.set(true);
      this.msg.set(
        '❌ <strong>No compila.</strong> <code>Rc&lt;T&gt;</code> no implementa <code>Send</code>, así que el borrow checker <strong>impide</strong> moverlo a otro hilo.',
      );
      return;
    }
    this.seq++;
    this.refs.update((rs) => [...rs, { id: this.seq, owner: 1 }]);
    this.msg.set(
      `✅ <code>Arc::clone(&amp;dato)</code> movido al hilo 2 con una closure <code>move</code>. Contador: <strong>${this.count()}</strong>. ` +
        `Ahora <strong>dos hilos</strong> son dueños del mismo dato, y el contador atómico banca los clones/drops concurrentes.`,
    );
  }

  /** el lost update sobre el contador no atómico: la razón real de que Rc no sea Send */
  raceDemo(): void {
    this.race.set({
      steps: [
        { th: 1, text: '<code>LOAD</code> — lee el contador: <strong>1</strong>' },
        { th: 2, text: '<code>LOAD</code> — lee el contador: <strong>1</strong> (¡el mismo valor!)', bad: true },
        { th: 1, text: '<code>ADD</code> — calcula 1 + 1 = <strong>2</strong>' },
        { th: 2, text: '<code>ADD</code> — calcula 1 + 1 = <strong>2</strong>' },
        { th: 1, text: '<code>STORE</code> — escribe <strong>2</strong>' },
        { th: 2, text: '<code>STORE</code> — escribe <strong>2</strong> y pisa al otro: se perdió un incremento', bad: true },
      ],
      final: 2,
    });
    this.msg.set(
      'Este es el motivo de fondo: el <code>+= 1</code> del contador de <strong>Rc</strong> son tres instrucciones (load/add/store). Con dos hilos se entrelazan y el conteo queda mal. <strong>Arc</strong> usa <code>fetch_add</code> atómico y por eso es seguro.',
    );
  }

  reset(): void {
    this.refs.set([{ id: 1, owner: 0 }]);
    this.freed.set(false);
    this.compileError.set(false);
    this.race.set(null);
    this.msg.set(null);
    this.seq = 1;
  }
}
