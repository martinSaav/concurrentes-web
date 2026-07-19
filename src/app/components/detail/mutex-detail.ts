import { ChangeDetectionStrategy, Component, OnDestroy, computed, signal } from '@angular/core';

type TState = 'think' | 'wait' | 'cs';

interface Th {
  id: number;
  state: TState;
  t: number; // ms en el estado actual
  dur: number; // duración del estado actual
  snapshot: number | null; // valor leído al entrar a la CS
  waited: number; // ms acumulados esperando (para métricas)
}

const COLORS = ['#58a6ff', '#ef5350', '#7ee787', '#ffd54f'];

/**
 * Simulación de exclusión mutua: 4 hilos compiten por una sección crítica
 * que incrementa un contador. Con mutex: cola FIFO, uno adentro. Sin mutex:
 * entran todos juntos y los incrementos se pisan (lost updates reales).
 */
@Component({
  selector: 'app-mutex-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="anim">
      <div class="head">
        <div class="titles">
          <div class="title">🔒 Mutex en acción: 4 hilos, una sección crítica</div>
          <div class="caption">
            Click en un hilo pensando para mandarlo YA a pedir el lock. Cambiá a "sin mutex" y mirá el contador.
          </div>
        </div>
        <div class="controls">
          <button class="ctl play" (click)="toggleRun()">{{ running() ? '⏸ Pausa' : '▶ Correr' }}</button>
          <div class="modes">
            <button class="mode" [class.on]="withMutex()" (click)="setMutex(true)">con Mutex</button>
            <button class="mode danger" [class.on]="!withMutex()" (click)="setMutex(false)">sin Mutex</button>
          </div>
          <button class="ctl" (click)="reset()">↺ Reset</button>
        </div>
      </div>

      <div class="board">
        <div class="arena">
          <!-- hilos -->
          <div class="threads">
            @for (th of threads(); track th.id) {
              <button
                class="thr"
                [style.--tc]="colors[th.id]"
                [class.waiting]="th.state === 'wait'"
                [class.incs]="th.state === 'cs'"
                (click)="poke(th.id)"
              >
                <div class="thr-top">
                  <span class="thr-name">🧵 H{{ th.id + 1 }}</span>
                  <span class="thr-state">
                    @switch (th.state) {
                      @case ('think') { 💭 pensando }
                      @case ('wait') { ⛔ bloqueado }
                      @case ('cs') { 🔓 en la CS }
                    }
                  </span>
                </div>
                <div class="bar-track">
                  <div
                    class="bar"
                    [class.waitbar]="th.state === 'wait'"
                    [style.width.%]="th.state === 'wait' ? 100 : (th.t / th.dur) * 100"
                  ></div>
                </div>
              </button>
            }
          </div>

          <!-- sección crítica -->
          <div class="cs" [class.violated]="inCs().length > 1" [class.busy]="inCs().length === 1">
            <div class="cs-label">SECCIÓN CRÍTICA</div>
            <div class="cs-code">let v = contador; … ; contador = v + 1;</div>
            <div class="cs-occupants">
              @if (inCs().length === 0) {
                <span class="cs-free">— libre —</span>
              }
              @for (th of inCs(); track th.id) {
                <span class="occ" [style.background]="colors[th.id]">H{{ th.id + 1 }}</span>
              }
            </div>
            @if (inCs().length > 1) {
              <div class="cs-alert">⚠️ {{ inCs().length }} hilos adentro: exclusión mutua VIOLADA</div>
            }
            @if (withMutex()) {
              <div class="queue">
                <span class="q-label">cola del lock:</span>
                @if (queue().length === 0) {
                  <span class="q-empty">vacía</span>
                }
                @for (id of queue(); track id) {
                  <span class="occ small" [style.background]="colors[id]">H{{ id + 1 }}</span>
                }
              </div>
            }
          </div>
        </div>

        <!-- métricas -->
        <div class="side">
          <div class="metric big">
            <span class="m-label">contador</span>
            <span class="m-val" [class.bad-v]="lost() > 0">{{ counter() }}</span>
          </div>
          <div class="metric">
            <span class="m-label">incrementos ejecutados</span>
            <span class="m-val">{{ expected() }}</span>
          </div>
          <div class="metric" [class.alert]="lost() > 0">
            <span class="m-label">updates perdidos</span>
            <span class="m-val">{{ lost() }}</span>
          </div>
          <div class="metric">
            <span class="m-label">violaciones de exclusión</span>
            <span class="m-val">{{ violations() }}</span>
          </div>
          <div class="side-note">
            @if (withMutex()) {
              Con mutex: contador <strong>=</strong> incrementos, siempre. El costo: los hilos
              esperan (serialización).
            } @else {
              Sin mutex: cada hilo lee, "labura" un rato y escribe lectura+1. Los que
              se superponen se pisan.
            }
          </div>
        </div>
      </div>

      <div class="status" [class.idle]="events().length === 0">
        @if (events().length === 0) {
          Presioná ▶ Correr. Los hilos piensan un rato aleatorio y después quieren entrar a la sección crítica.
        }
        @for (e of lastEvents(); track $index) {
          <div class="ev" [innerHTML]="e"></div>
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
    .ctl.play { background: #1f6feb; border-color: #1f6feb; color: #fff; font-weight: 700; min-width: 96px; }
    .modes { display: flex; background: var(--panel-2); border: 1px solid var(--border); border-radius: 8px; padding: 2px; gap: 2px; }
    .mode { background: transparent; border: none; color: var(--text-dim); border-radius: 6px; padding: 6px 10px; cursor: pointer; font-size: 0.8rem; font-weight: 600; }
    .mode.on { background: #2ea043; color: #fff; }
    .mode.danger.on { background: #c73e3a; }

    .board { display: flex; gap: 12px; align-items: stretch; }
    .arena { flex: 1; display: flex; gap: 12px; background: radial-gradient(ellipse at 50% 40%, #202a40 0%, #171e2e 80%); border: 1px solid var(--border); border-radius: 10px; padding: 14px; }
    .threads { display: flex; flex-direction: column; gap: 8px; width: 46%; }
    .thr { text-align: left; background: #10151f; border: 1px solid var(--border); border-left: 4px solid var(--tc); border-radius: 9px; padding: 8px 10px; cursor: pointer; color: var(--text); transition: border-color 0.2s, opacity 0.2s; }
    .thr:hover { border-color: var(--tc); }
    .thr.waiting { opacity: 0.75; }
    .thr.incs { box-shadow: 0 0 12px color-mix(in srgb, var(--tc) 45%, transparent); border-color: var(--tc); }
    .thr-top { display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 5px; }
    .thr-name { font-weight: 800; color: var(--tc); }
    .thr-state { color: var(--text-dim); font-size: 0.72rem; }
    .bar-track { height: 6px; background: #0b0f19; border-radius: 4px; overflow: hidden; }
    .bar { height: 100%; background: var(--tc); transition: none; }
    .bar.waitbar { background: repeating-linear-gradient(45deg, #3a2224, #3a2224 6px, #55282b 6px, #55282b 12px); }

    .cs { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; border: 2px dashed #39445f; border-radius: 10px; padding: 12px; transition: border-color 0.2s, background 0.2s; }
    .cs.busy { border-color: #2ea043; background: rgba(46, 160, 67, 0.05); }
    .cs.violated { border-color: #ef5350; background: rgba(239, 83, 80, 0.09); }
    .cs-label { font-size: 0.66rem; letter-spacing: 2px; color: #5c6a8e; font-weight: 800; }
    .cs-code { font-family: Consolas, monospace; font-size: 0.68rem; color: var(--text-dim); }
    .cs-occupants { display: flex; gap: 6px; min-height: 30px; align-items: center; flex-wrap: wrap; justify-content: center; }
    .cs-free { color: #5c6a8e; font-style: italic; font-size: 0.82rem; }
    .occ { color: #0d1117; font-weight: 800; font-size: 0.8rem; border-radius: 7px; padding: 3px 10px; }
    .occ.small { font-size: 0.68rem; padding: 1px 7px; }
    .cs-alert { color: #ef9a9a; font-size: 0.78rem; font-weight: 700; text-align: center; }
    .queue { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; margin-top: 4px; }
    .q-label { font-size: 0.68rem; color: #5c6a8e; }
    .q-empty { font-size: 0.7rem; color: #5c6a8e; font-style: italic; }

    .side { width: 210px; flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; }
    .metric { background: #10151f; border: 1px solid var(--border); border-radius: 9px; padding: 8px 12px; display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
    .metric.big .m-val { font-size: 1.5rem; color: #7ee787; }
    .metric.alert { border-color: #ef535088; }
    .metric.alert .m-val { color: #ef9a9a; }
    .m-label { font-size: 0.7rem; color: var(--text-dim); }
    .m-val { font-family: Consolas, monospace; font-weight: 800; font-size: 1.05rem; color: var(--text); }
    .m-val.bad-v { color: #ef9a9a; }
    .side-note { font-size: 0.74rem; color: var(--text-dim); line-height: 1.5; padding: 4px 2px; }
    .side-note strong { color: var(--text); }

    .status { margin-top: 12px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; min-height: 46px; font-size: 0.85rem; line-height: 1.55; }
    .status.idle { color: var(--text-dim); font-style: italic; }
    .ev { color: var(--text); }

    @media (max-width: 720px) {
      .board { flex-direction: column; }
      .side { width: 100%; flex-direction: row; flex-wrap: wrap; }
      .metric { flex: 1; min-width: 140px; }
      .arena { flex-direction: column; }
      .threads { width: 100%; }
    }
  `,
})
export class MutexDetail implements OnDestroy {
  readonly colors = COLORS;

  readonly running = signal(false);
  readonly withMutex = signal(true);
  readonly threads = signal<Th[]>(this.freshThreads());
  readonly queue = signal<number[]>([]);
  readonly counter = signal(0);
  readonly expected = signal(0);
  readonly violations = signal(0);
  readonly events = signal<string[]>([]);

  readonly lost = computed(() => this.expected() - this.counter());
  readonly inCs = computed(() => this.threads().filter((t) => t.state === 'cs'));
  readonly lastEvents = computed(() => this.events().slice(-3));

  private lockHolder: number | null = null;
  private rafId = 0;
  private lastTs = 0;
  private violatedNow = false;

  private freshThreads(): Th[] {
    return [0, 1, 2, 3].map((id) => ({
      id,
      state: 'think' as TState,
      t: 0,
      dur: 900 + Math.random() * 2200,
      snapshot: null,
      waited: 0,
    }));
  }

  toggleRun(): void {
    if (this.running()) {
      this.running.set(false);
      cancelAnimationFrame(this.rafId);
    } else {
      this.running.set(true);
      this.lastTs = performance.now();
      this.rafId = requestAnimationFrame(this.tick);
    }
  }

  setMutex(v: boolean): void {
    if (this.withMutex() === v) return;
    this.withMutex.set(v);
    this.logEv(
      v
        ? '🔒 Modo <strong>con mutex</strong>: para entrar a la CS hay que adquirir el lock; el resto espera en la cola.'
        : '🔓 Modo <strong>sin mutex</strong>: los hilos entran directo. Observá qué pasa cuando se superponen.',
    );
    // los que esperaban entran directo si sacamos el mutex
    if (!v) {
      const ths = this.threads().map((t) =>
        t.state === 'wait' ? { ...t, state: 'cs' as TState, t: 0, dur: this.csDur(), snapshot: this.counter() } : t,
      );
      this.threads.set(ths);
      this.queue.set([]);
      this.lockHolder = null;
    }
  }

  /** click: si está pensando, quiere el lock ya */
  poke(id: number): void {
    const ths = [...this.threads()];
    const th = ths[id];
    if (th.state !== 'think') return;
    th.t = th.dur; // fuerza fin del pensar en el próximo frame
    this.threads.set(ths);
    if (!this.running()) this.toggleRun();
  }

  private csDur(): number {
    return 1200 + Math.random() * 700;
  }

  private readonly tick = (now: number): void => {
    if (!this.running()) return;
    const dt = Math.min(now - this.lastTs, 100);
    this.lastTs = now;

    const ths = this.threads().map((t) => ({ ...t }));

    for (const th of ths) {
      th.t += dt;
      if (th.state === 'wait') th.waited += dt;

      if (th.state === 'think' && th.t >= th.dur) {
        // quiere entrar a la CS
        if (!this.withMutex()) {
          th.state = 'cs';
          th.t = 0;
          th.dur = this.csDur();
          th.snapshot = this.counter();
          this.logEv(`H${th.id + 1} entra a la CS y lee contador = <strong>${th.snapshot}</strong> (sin lock).`);
        } else if (this.lockHolder === null) {
          this.lockHolder = th.id;
          th.state = 'cs';
          th.t = 0;
          th.dur = this.csDur();
          th.snapshot = this.counter();
          this.logEv(`H${th.id + 1} adquiere el lock y entra a la CS (lee ${th.snapshot}).`);
        } else {
          th.state = 'wait';
          th.t = 0;
          this.queue.update((q) => [...q, th.id]);
          this.logEv(`H${th.id + 1} pide el lock: lo tiene H${this.lockHolder + 1} → se <strong>bloquea</strong> en la cola.`);
        }
      } else if (th.state === 'cs' && th.t >= th.dur) {
        // sale de la CS: escribe snapshot + 1
        const write = (th.snapshot ?? 0) + 1;
        const before = this.counter();
        this.counter.set(write);
        this.expected.update((e) => e + 1);
        th.snapshot = null;
        th.state = 'think';
        th.t = 0;
        th.dur = 900 + Math.random() * 2200;
        if (write <= before) {
          this.logEv(
            `H${th.id + 1} escribe <strong>${write}</strong>… pero el contador ya valía ${before}: ` +
              `<strong>update perdido</strong> 💥`,
          );
        } else {
          this.logEv(`H${th.id + 1} escribe contador = <strong>${write}</strong> y sale.`);
        }
        if (this.withMutex() && this.lockHolder === th.id) {
          // pasa el lock al primero de la cola
          const q = [...this.queue()];
          const nextId = q.shift();
          this.queue.set(q);
          if (nextId !== undefined) {
            this.lockHolder = nextId;
            const nx = ths.find((x) => x.id === nextId)!;
            nx.state = 'cs';
            nx.t = 0;
            nx.dur = this.csDur();
            nx.snapshot = write;
            this.logEv(`el lock pasa a H${nextId + 1} (FIFO): entra a la CS.`);
          } else {
            this.lockHolder = null;
          }
        }
      }
    }

    // detección de violación (borde: recién cuando pasa de ≤1 a >1)
    const inside = ths.filter((t) => t.state === 'cs').length;
    if (inside > 1 && !this.violatedNow) {
      this.violatedNow = true;
      this.violations.update((v) => v + 1);
    } else if (inside <= 1) {
      this.violatedNow = false;
    }

    this.threads.set(ths);
    this.rafId = requestAnimationFrame(this.tick);
  };

  private logEv(html: string): void {
    this.events.update((e) => [...e.slice(-30), html]);
  }

  reset(): void {
    this.running.set(false);
    cancelAnimationFrame(this.rafId);
    this.threads.set(this.freshThreads());
    this.queue.set([]);
    this.counter.set(0);
    this.expected.set(0);
    this.violations.set(0);
    this.events.set([]);
    this.lockHolder = null;
    this.violatedNow = false;
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.rafId);
  }
}
