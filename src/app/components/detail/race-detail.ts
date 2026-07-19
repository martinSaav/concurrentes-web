import { ChangeDetectionStrategy, Component, OnDestroy, computed, signal } from '@angular/core';

interface LogEntry {
  thread: 1 | 2;
  text: string;
}

const OPS = ['LOAD r ← contador', 'ADD  r ← r + 1', 'STORE contador ← r'] as const;

/**
 * Explorador de entrelazados: dos hilos incrementan un contador compartido.
 * Cada incremento son 3 micro-ops (load/add/store). El usuario elige qué hilo
 * avanza (o usa presets/aleatorio) y ve cómo el resultado depende del orden.
 */
@Component({
  selector: 'app-race-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="anim">
      <div class="head">
        <div class="titles">
          <div class="title">🏁 Interleaving explorer: <code>contador += 1</code> × 2 hilos</div>
          <div class="caption">
            Vos sos el scheduler: elegí qué hilo ejecuta la próxima micro-operación.
          </div>
        </div>
        <div class="controls">
          <button class="ctl" (click)="preset('seq')">Secuencial</button>
          <button class="ctl bad" (click)="preset('lost')">Lost update</button>
          <button class="ctl" (click)="preset('rand')">🎲 Aleatorio</button>
          <button class="ctl" (click)="reset()">↺ Reset</button>
          <div class="speeds">
            @for (s of speedOptions; track s) {
              <button class="spd" [class.on]="speed() === s" (click)="setSpeed(s)">{{ s }}×</button>
            }
          </div>
        </div>
      </div>

      <div class="board">
        <!-- Hilo 1 -->
        <div class="thread t1" [class.done]="pc1() >= 3">
          <div class="th-head">
            <span>🧵 Hilo 1</span>
            <button class="step-btn" (click)="manualStep(1)" [disabled]="pc1() >= 3 || animRunning()">
              ejecutar paso ▶
            </button>
          </div>
          <div class="ops">
            @for (op of ops; track $index; let i = $index) {
              <div class="op" [class.now]="pc1() === i" [class.past]="pc1() > i">{{ op }}</div>
            }
          </div>
          <div class="reg">registro r₁ = <strong>{{ r1() === null ? '—' : r1() }}</strong></div>
        </div>

        <!-- Memoria compartida -->
        <div class="mem">
          <div class="mem-label">memoria compartida</div>
          <div class="mem-box" [class.flash]="memFlash()">
            <div class="mem-var">contador</div>
            <div class="mem-val">{{ counter() }}</div>
          </div>
          @if (doneAll()) {
            <div class="verdict" [class.ok]="counter() === 2" [class.bad]="counter() !== 2">
              @if (counter() === 2) {
                ✔ contador = 2 · este entrelazado zafó
              } @else {
                ✘ contador = {{ counter() }} · se perdió un incremento
              }
            </div>
          }
          <div class="timeline">
            @for (e of timeline(); track $index) {
              <span class="chip" [class.c1]="e === 1" [class.c2]="e === 2">T{{ e }}</span>
            }
          </div>
        </div>

        <!-- Hilo 2 -->
        <div class="thread t2" [class.done]="pc2() >= 3">
          <div class="th-head">
            <span>🧵 Hilo 2</span>
            <button class="step-btn" (click)="manualStep(2)" [disabled]="pc2() >= 3 || animRunning()">
              ejecutar paso ▶
            </button>
          </div>
          <div class="ops">
            @for (op of ops; track $index; let i = $index) {
              <div class="op" [class.now]="pc2() === i" [class.past]="pc2() > i">{{ op }}</div>
            }
          </div>
          <div class="reg">registro r₂ = <strong>{{ r2() === null ? '—' : r2() }}</strong></div>
        </div>
      </div>

      <div class="status" [class.idle]="log().length === 0">
        @if (log().length === 0) {
          Elegí "ejecutar paso" en algún hilo, o probá los presets. El de
          <strong>Lost update</strong> muestra el peor entrelazado.
        } @else {
          @for (e of lastLog(); track $index) {
            <div class="logline">
              <span class="logtag" [class.c1]="e.thread === 1" [class.c2]="e.thread === 2">T{{ e.thread }}</span>
              <span [innerHTML]="e.text"></span>
            </div>
          }
        }
      </div>

      <!-- corrida masiva -->
      <div class="mass">
        <div class="mass-head">
          <div>
            <strong>🎲 Corrida masiva:</strong> ejecutar
            <strong>{{ massN }}</strong> entrelazados al azar y contar resultados
          </div>
          <button class="ctl play" (click)="massRun()">Correr {{ massN }}</button>
        </div>
        @if (mass(); as m) {
          <div class="bars">
            <div class="barrow">
              <span class="barlabel ok-t">contador = 2 (correcto)</span>
              <div class="bartrack">
                <div class="bar okbar" [style.width.%]="(m.ok / massN) * 100"></div>
              </div>
              <span class="barval">{{ m.ok }} · {{ ((m.ok / massN) * 100).toFixed(1) }}%</span>
            </div>
            <div class="barrow">
              <span class="barlabel bad-t">contador = 1 (lost update)</span>
              <div class="bartrack">
                <div class="bar badbar" [style.width.%]="(m.bad / massN) * 100"></div>
              </div>
              <span class="barval">{{ m.bad }} · {{ ((m.bad / massN) * 100).toFixed(1) }}%</span>
            </div>
          </div>
          <div class="mass-note">
            El bug aparece en una fracción de las corridas — por eso "lo probé y anduvo" no
            demuestra nada. Correcto = correcto para <strong>todos</strong> los entrelazados.
          </div>
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
    .ctl { background: var(--panel-2); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 7px 12px; cursor: pointer; font-size: 0.86rem; }
    .ctl:hover:not(:disabled) { background: #2d3750; }
    .ctl.bad { border-color: #ef535088; color: #ef9a9a; }
    .ctl.play { background: #1f6feb; border-color: #1f6feb; color: #fff; font-weight: 700; }
    .speeds { display: flex; gap: 2px; margin-left: 6px; background: var(--panel-2); border-radius: 8px; padding: 2px; border: 1px solid var(--border); }
    .spd { background: transparent; color: var(--text-dim); border: none; border-radius: 6px; padding: 5px 8px; cursor: pointer; font-size: 0.78rem; }
    .spd.on { background: #1f6feb; color: #fff; font-weight: 700; }

    .board { display: grid; grid-template-columns: 1fr 0.9fr 1fr; gap: 12px; align-items: stretch; }
    .thread { background: #10151f; border: 1px solid var(--border); border-radius: 10px; padding: 12px; transition: opacity 0.3s; }
    .thread.t1 { border-top: 3px solid #58a6ff; }
    .thread.t2 { border-top: 3px solid #ef5350; }
    .thread.done { opacity: 0.65; }
    .th-head { display: flex; justify-content: space-between; align-items: center; font-weight: 700; margin-bottom: 10px; font-size: 0.92rem; }
    .step-btn { background: #1f6feb; color: #fff; border: none; border-radius: 7px; padding: 5px 10px; cursor: pointer; font-size: 0.75rem; font-weight: 700; }
    .step-btn:disabled { opacity: 0.3; cursor: default; }
    .ops { display: flex; flex-direction: column; gap: 5px; }
    .op { font-family: Consolas, monospace; font-size: 0.78rem; padding: 6px 10px; border-radius: 6px; background: #1a2132; border: 1px solid #2d3750; color: var(--text-dim); transition: all 0.2s; }
    .op.now { border-color: #ffd54f; color: #fff; background: #2a2a1a; box-shadow: 0 0 10px rgba(255, 213, 79, 0.25); }
    .op.past { color: #4a5570; text-decoration: line-through; }
    .reg { margin-top: 10px; font-family: Consolas, monospace; font-size: 0.82rem; color: var(--text-dim); }
    .reg strong { color: #ffd54f; font-size: 1.05rem; }

    .mem { display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 10px; padding: 12px; background: radial-gradient(ellipse at 50% 40%, #202a40 0%, #171e2e 80%); border: 1px solid var(--border); border-radius: 10px; }
    .mem-label { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 1px; color: #5c6a8e; font-weight: 700; }
    .mem-box { background: #0b0f19; border: 2px solid #7ee787; border-radius: 10px; padding: 10px 22px; text-align: center; transition: box-shadow 0.2s; }
    .mem-box.flash { box-shadow: 0 0 18px rgba(126, 231, 135, 0.5); }
    .mem-var { font-family: Consolas, monospace; font-size: 0.75rem; color: var(--text-dim); }
    .mem-val { font-family: Consolas, monospace; font-size: 2rem; font-weight: 800; color: #7ee787; line-height: 1.2; }
    .verdict { font-size: 0.82rem; font-weight: 700; padding: 6px 12px; border-radius: 8px; text-align: center; }
    .verdict.ok { background: rgba(46, 160, 67, 0.15); color: #7ee787; border: 1px solid #2ea04366; }
    .verdict.bad { background: rgba(239, 83, 80, 0.15); color: #ef9a9a; border: 1px solid #ef535066; }
    .timeline { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; min-height: 22px; }
    .chip { font-family: Consolas, monospace; font-size: 0.68rem; font-weight: 800; border-radius: 5px; padding: 1px 7px; color: #fff; }
    .chip.c1 { background: #1f6feb; }
    .chip.c2 { background: #c73e3a; }

    .status { margin-top: 12px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 11px 14px; min-height: 50px; font-size: 0.88rem; line-height: 1.5; }
    .status.idle { color: var(--text-dim); font-style: italic; }
    .logline { display: flex; gap: 8px; align-items: baseline; }
    .logtag { flex-shrink: 0; font-family: Consolas, monospace; font-size: 0.7rem; font-weight: 800; border-radius: 5px; padding: 0 6px; color: #fff; }
    .logtag.c1 { background: #1f6feb; }
    .logtag.c2 { background: #c73e3a; }

    .mass { margin-top: 12px; background: #10151f; border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; }
    .mass-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 0.9rem; }
    .bars { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
    .barrow { display: grid; grid-template-columns: 210px 1fr 110px; gap: 10px; align-items: center; font-size: 0.8rem; }
    .barlabel { text-align: right; font-family: Consolas, monospace; font-size: 0.74rem; }
    .ok-t { color: #7ee787; }
    .bad-t { color: #ef9a9a; }
    .bartrack { background: #0b0f19; border: 1px solid var(--border); border-radius: 6px; height: 20px; overflow: hidden; }
    .bar { height: 100%; transition: width 0.5s ease; }
    .okbar { background: linear-gradient(90deg, #2ea043, #7ee787); }
    .badbar { background: linear-gradient(90deg, #c73e3a, #ef9a9a); }
    .barval { font-family: Consolas, monospace; font-size: 0.74rem; color: var(--text-dim); }
    .mass-note { margin-top: 10px; color: var(--text-dim); font-size: 0.8rem; }
    .mass-note strong { color: var(--text); }

    @media (max-width: 720px) {
      .board { grid-template-columns: 1fr; }
      .barrow { grid-template-columns: 1fr; gap: 2px; }
      .barlabel { text-align: left; }
    }
  `,
})
export class RaceDetail implements OnDestroy {
  readonly ops = OPS;
  readonly massN = 500;
  readonly speedOptions = [0.5, 1, 1.5, 2];

  readonly pc1 = signal(0);
  readonly pc2 = signal(0);
  readonly r1 = signal<number | null>(null);
  readonly r2 = signal<number | null>(null);
  readonly counter = signal(0);
  readonly log = signal<LogEntry[]>([]);
  readonly timeline = signal<(1 | 2)[]>([]);
  readonly memFlash = signal(false);
  readonly speed = signal(1);
  readonly animRunning = signal(false);
  readonly mass = signal<{ ok: number; bad: number } | null>(null);

  readonly doneAll = computed(() => this.pc1() >= 3 && this.pc2() >= 3);
  readonly lastLog = computed(() => this.log().slice(-2));

  private queue: (1 | 2)[] = [];
  private rafId = 0;
  private lastTs = 0;
  private acc = 0;

  setSpeed(s: number): void {
    this.speed.set(s);
  }

  /** ejecuta la próxima micro-op del hilo t */
  step(t: 1 | 2): void {
    const pc = t === 1 ? this.pc1 : this.pc2;
    const reg = t === 1 ? this.r1 : this.r2;
    const i = pc();
    if (i >= 3) return;
    let text = '';
    if (i === 0) {
      reg.set(this.counter());
      text = `<code>LOAD</code> — lee contador = <strong>${reg()}</strong> a su registro`;
    } else if (i === 1) {
      reg.update((v) => (v ?? 0) + 1);
      text = `<code>ADD</code> — su registro pasa a <strong>${reg()}</strong> (el contador sigue en ${this.counter()})`;
    } else {
      this.counter.set(reg() ?? 0);
      this.memFlash.set(true);
      setTimeout(() => this.memFlash.set(false), 300);
      text = `<code>STORE</code> — escribe <strong>${reg()}</strong> al contador`;
      const other = t === 1 ? this.r2() : this.r1();
      const otherPc = t === 1 ? this.pc2() : this.pc1();
      if (otherPc > 0 && otherPc < 3 && other !== null && other <= (reg() ?? 0)) {
        text += ` — ⚠️ el otro hilo leyó ANTES de esta escritura: su store va a pisar este valor`;
      }
    }
    pc.set(i + 1);
    this.log.update((l) => [...l, { thread: t, text }]);
    this.timeline.update((tl) => [...tl, t]);
    if (this.doneAll() && this.counter() !== 2) {
      this.log.update((l) => [
        ...l,
        { thread: t, text: `<strong>Resultado final: ${this.counter()}</strong> — un incremento se perdió (lost update). Dos hilos leyeron el mismo valor viejo.` },
      ]);
    }
  }

  manualStep(t: 1 | 2): void {
    this.stopAnim();
    this.step(t);
  }

  preset(kind: 'seq' | 'lost' | 'rand'): void {
    this.reset();
    if (kind === 'seq') {
      this.queue = [1, 1, 1, 2, 2, 2];
    } else if (kind === 'lost') {
      this.queue = [1, 2, 1, 2, 1, 2];
    } else {
      const remaining = { 1: 3, 2: 3 };
      const q: (1 | 2)[] = [];
      while (remaining[1] + remaining[2] > 0) {
        const pick: 1 | 2 =
          remaining[1] === 0 ? 2 : remaining[2] === 0 ? 1 : Math.random() < 0.5 ? 1 : 2;
        q.push(pick);
        remaining[pick]--;
      }
      this.queue = q;
    }
    this.animRunning.set(true);
    this.lastTs = performance.now();
    this.acc = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number): void => {
    const dt = Math.min(now - this.lastTs, 100) * this.speed();
    this.lastTs = now;
    this.acc += dt;
    if (this.acc >= 650) {
      this.acc = 0;
      const t = this.queue.shift();
      if (t !== undefined) this.step(t);
      if (this.queue.length === 0) {
        this.stopAnim();
        return;
      }
    }
    this.rafId = requestAnimationFrame(this.tick);
  };

  private stopAnim(): void {
    this.animRunning.set(false);
    cancelAnimationFrame(this.rafId);
    this.queue = [];
  }

  reset(): void {
    this.stopAnim();
    this.pc1.set(0);
    this.pc2.set(0);
    this.r1.set(null);
    this.r2.set(null);
    this.counter.set(0);
    this.log.set([]);
    this.timeline.set([]);
  }

  /** simula massN entrelazados al azar (sin animar) y cuenta resultados */
  massRun(): void {
    let ok = 0;
    let bad = 0;
    for (let k = 0; k < this.massN; k++) {
      let c = 0;
      const regs: [number, number] = [0, 0];
      const pcs: [number, number] = [0, 0];
      while (pcs[0] < 3 || pcs[1] < 3) {
        const t = pcs[0] >= 3 ? 1 : pcs[1] >= 3 ? 0 : Math.random() < 0.5 ? 0 : 1;
        const pc = pcs[t];
        if (pc === 0) regs[t] = c;
        else if (pc === 1) regs[t]++;
        else c = regs[t];
        pcs[t]++;
      }
      if (c === 2) ok++;
      else bad++;
    }
    this.mass.set({ ok, bad });
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.rafId);
  }
}
