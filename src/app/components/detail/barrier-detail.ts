import { ChangeDetectionStrategy, Component, OnDestroy, computed, signal } from '@angular/core';

type TState = 'run' | 'wait' | 'cross';

interface Th {
  id: number;
  x: number; // 0..100 (% del tramo de la fase)
  speed: number;
  state: TState;
  phase: number;
  waited: number; // ms acumulados esperando en la barrera
}

const N = 4;
const COLORS = ['#58a6ff', '#7ee787', '#ffd54f', '#a78bfa'];
const BARRIER_X = 74;

/**
 * Barrera de sincronización: N hilos avanzan a distinto ritmo y ninguno
 * pasa a la fase siguiente hasta que llegan todos. El último en llegar
 * es el líder (is_leader). Con toggle "sin barrera" para ver la diferencia.
 */
@Component({
  selector: 'app-barrier-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="anim">
      <div class="head">
        <div class="titles">
          <div class="title">🚧 Barrera: nadie pasa hasta que llegan todos</div>
          <div class="caption">
            Click en un hilo para acelerarlo. El <strong>último</strong> en llegar es el líder.
          </div>
        </div>
        <div class="controls">
          <button class="ctl play" (click)="toggleRun()">{{ running() ? '⏸ Pausa' : '▶ Correr' }}</button>
          <div class="modes">
            <button class="mode" [class.on]="withBarrier()" (click)="setBarrier(true)">con barrera</button>
            <button class="mode danger" [class.on]="!withBarrier()" (click)="setBarrier(false)">sin barrera</button>
          </div>
          <button class="ctl" (click)="reset()">↺ Reset</button>
        </div>
      </div>

      <div class="board">
        <div class="lanes">
          @for (t of threads(); track t.id) {
            <button class="lane" [style.--tc]="colors[t.id]" (click)="poke(t.id)">
              <div class="lane-head">
                <span class="ln">🧵 H{{ t.id + 1 }}</span>
                <span class="ls">
                  @switch (t.state) {
                    @case ('run') { computando fase {{ t.phase + 1 }} }
                    @case ('wait') { ⛔ esperando en la barrera }
                    @case ('cross') { 🚀 cruzando }
                  }
                  @if (leader() === t.id && t.state !== 'run') { · 👑 líder }
                </span>
              </div>
              <div class="track">
                <!-- tramo de trabajo de la fase -->
                <div class="fill" [style.width.%]="Math.min(t.x, barrierX)"></div>
                <!-- la barrera -->
                @if (withBarrier()) {
                  <div class="wall" [style.left.%]="barrierX" [class.open]="t.state === 'cross'"></div>
                }
                <!-- el hilo -->
                <div class="dot" [style.left.%]="t.x" [class.blocked]="t.state === 'wait'">
                  @if (t.state === 'wait') { ⏸ } @else { ● }
                </div>
                <!-- marcas de fase -->
                <span class="phase-tag">fase {{ t.phase + 1 }}</span>
              </div>
            </button>
          }
        </div>

        <div class="side">
          <div class="panel">
            <div class="p-title">estado</div>
            <div class="cmp"><span>en la barrera</span><strong>{{ waitingCount() }}/{{ n }}</strong></div>
            <div class="cmp"><span>fase mínima</span><strong>{{ minPhase() + 1 }}</strong></div>
            <div class="cmp"><span>fase máxima</span><strong [class.bad-t]="spread() > 0">{{ maxPhase() + 1 }}</strong></div>
            <div class="cmp"><span>desincronización</span><strong [class.bad-t]="spread() > 0">{{ spread() }}</strong></div>
          </div>
          <div class="panel">
            <div class="p-title">tiempo esperando</div>
            @for (t of threads(); track t.id) {
              <div class="wrow">
                <span class="wn" [style.color]="colors[t.id]">H{{ t.id + 1 }}</span>
                <div class="wtrack">
                  <div class="wbar" [style.background]="colors[t.id]" [style.width.%]="waitPct(t)"></div>
                </div>
                <span class="wv">{{ (t.waited / 1000).toFixed(1) }}s</span>
              </div>
            }
            <div class="p-note">
              El precio de la barrera: <strong>todos van a la velocidad del más lento</strong>.
            </div>
          </div>
        </div>
      </div>

      <div class="status" [class.idle]="!msg()">
        @if (msg(); as m) {
          <span [innerHTML]="m"></span>
        } @else if (withBarrier()) {
          Presioná ▶. Los 4 hilos computan su parte de la fase a distinto ritmo y se frenan en la
          barrera; cuando llega el último, se destraban <strong>todos juntos</strong>.
        } @else {
          Sin barrera cada hilo arranca la fase siguiente apenas termina la suya: mirá cómo se
          <strong>desincronizan</strong> (mirá "fase máxima" vs "fase mínima").
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
    .lanes { flex: 1; display: flex; flex-direction: column; gap: 10px; background: radial-gradient(ellipse at 50% 45%, #202a40 0%, #171e2e 80%); border: 1px solid var(--border); border-radius: 10px; padding: 14px; }
    .lane { text-align: left; background: transparent; border: none; padding: 0; cursor: pointer; }
    .lane-head { display: flex; justify-content: space-between; gap: 8px; font-size: 0.76rem; margin-bottom: 4px; flex-wrap: wrap; }
    .ln { font-weight: 800; color: var(--tc); }
    .ls { color: var(--text-dim); font-size: 0.7rem; }
    .track { position: relative; height: 22px; background: #0b0f19; border: 1px solid var(--border); border-radius: 5px; overflow: hidden; }
    .fill { position: absolute; left: 0; top: 0; bottom: 0; background: color-mix(in srgb, var(--tc) 26%, transparent); }
    .wall { position: absolute; top: 0; bottom: 0; width: 3px; background: repeating-linear-gradient(0deg, #ffd54f, #ffd54f 4px, #6b5a1a 4px, #6b5a1a 8px); transform: translateX(-50%); transition: opacity 0.2s; }
    .wall.open { opacity: 0.25; }
    .dot { position: absolute; top: 50%; transform: translate(-50%, -50%); font-size: 0.8rem; color: var(--tc); transition: none; }
    .dot.blocked { color: #ef9a9a; }
    .phase-tag { position: absolute; right: 5px; top: 50%; transform: translateY(-50%); font-size: 0.6rem; color: #5c6a8e; font-family: Consolas, monospace; }

    .side { width: 232px; flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; }
    .panel { background: #10151f; border: 1px solid var(--border); border-radius: 10px; padding: 9px 12px; }
    .p-title { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 1px; color: #5c6a8e; font-weight: 700; margin-bottom: 6px; }
    .cmp { display: flex; justify-content: space-between; font-size: 0.76rem; color: var(--text-dim); padding: 2px 0; }
    .cmp strong { font-family: Consolas, monospace; color: var(--text); }
    .bad-t { color: #ef9a9a !important; }
    .wrow { display: grid; grid-template-columns: 26px 1fr 34px; gap: 6px; align-items: center; margin-bottom: 3px; }
    .wn { font-family: Consolas, monospace; font-weight: 800; font-size: 0.72rem; }
    .wtrack { height: 7px; background: #0b0f19; border: 1px solid var(--border); border-radius: 4px; overflow: hidden; }
    .wbar { height: 100%; transition: width 0.2s; }
    .wv { font-family: Consolas, monospace; font-size: 0.66rem; color: var(--text-dim); text-align: right; }
    .p-note { margin-top: 7px; font-size: 0.68rem; color: var(--text-dim); line-height: 1.5; }
    .p-note strong { color: var(--text); }

    .status { margin-top: 12px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; min-height: 46px; font-size: 0.85rem; line-height: 1.55; }
    .status.idle { color: var(--text-dim); }

    @media (max-width: 720px) {
      .board { flex-direction: column; }
      .side { width: 100%; }
    }
  `,
})
export class BarrierDetail implements OnDestroy {
  readonly n = N;
  readonly colors = COLORS;
  readonly barrierX = BARRIER_X;
  readonly Math = Math;

  readonly running = signal(false);
  readonly withBarrier = signal(true);
  readonly threads = signal<Th[]>(this.fresh());
  readonly leader = signal<number | null>(null);
  readonly msg = signal<string | null>(null);

  readonly waitingCount = computed(() => this.threads().filter((t) => t.state === 'wait').length);
  readonly minPhase = computed(() => Math.min(...this.threads().map((t) => t.phase)));
  readonly maxPhase = computed(() => Math.max(...this.threads().map((t) => t.phase)));
  readonly spread = computed(() => this.maxPhase() - this.minPhase());

  private rafId = 0;
  private lastTs = 0;
  private crossTimer = 0;

  private fresh(): Th[] {
    return Array.from({ length: N }, (_, id) => ({
      id,
      x: 0,
      speed: 6 + Math.random() * 12,
      state: 'run' as TState,
      phase: 0,
      waited: 0,
    }));
  }

  waitPct(t: Th): number {
    const max = Math.max(1000, ...this.threads().map((x) => x.waited));
    return (t.waited / max) * 100;
  }

  setBarrier(v: boolean): void {
    if (this.withBarrier() === v) return;
    this.withBarrier.set(v);
    this.reset();
    this.msg.set(
      v
        ? '🚧 Con barrera: nadie arranca la fase siguiente hasta que TODOS terminaron la actual.'
        : '🏃 Sin barrera: cada hilo sigue de largo. Van a desincronizarse — si la fase k+1 depende de resultados de la fase k, eso es un bug.',
    );
  }

  poke(id: number): void {
    const ts = this.threads().map((t) => ({ ...t }));
    ts[id].speed = Math.min(42, ts[id].speed * 1.8);
    this.threads.set(ts);
    if (!this.running()) this.toggleRun();
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

  private readonly tick = (now: number): void => {
    if (!this.running()) return;
    const dt = Math.min(now - this.lastTs, 100);
    this.lastTs = now;
    const ts = this.threads().map((t) => ({ ...t }));

    for (const t of ts) {
      if (t.state === 'run') {
        t.x += (t.speed * dt) / 1000;
        if (this.withBarrier() && t.x >= BARRIER_X) {
          t.x = BARRIER_X;
          t.state = 'wait';
        } else if (t.x >= 100) {
          // sin barrera: pasa directo a la fase siguiente
          t.x = 0;
          t.phase++;
        }
      } else if (t.state === 'cross') {
        t.x += (t.speed * 2.2 * dt) / 1000;
        if (t.x >= 100) {
          t.x = 0;
          t.phase++;
          t.state = 'run';
        }
      } else {
        t.waited += dt;
      }
    }

    // ¿llegaron todos a la barrera?
    if (this.withBarrier() && ts.every((t) => t.state === 'wait')) {
      // el líder es el último que llegó = el que menos esperó
      const lead = ts.reduce((a, b) => (a.waited <= b.waited ? a : b));
      this.leader.set(lead.id);
      for (const t of ts) t.state = 'cross';
      this.msg.set(
        `🚧 Llegaron los <strong>${N}</strong>: la barrera se abre y cruzan todos juntos. ` +
          `El último en llegar fue <strong>H${lead.id + 1}</strong> → su <code>wait()</code> devuelve ` +
          `<code>is_leader() == true</code> (los otros reciben false). Arranca la fase ${lead.phase + 2}.`,
      );
      this.crossTimer = 0;
    }

    this.threads.set(ts);
    this.rafId = requestAnimationFrame(this.tick);
  };

  reset(): void {
    this.running.set(false);
    cancelAnimationFrame(this.rafId);
    this.threads.set(this.fresh());
    this.leader.set(null);
    this.msg.set(null);
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.rafId);
  }
}
