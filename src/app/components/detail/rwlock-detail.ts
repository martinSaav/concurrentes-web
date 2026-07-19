import { ChangeDetectionStrategy, Component, OnDestroy, computed, signal } from '@angular/core';

type RState = 'idle' | 'waitR' | 'waitW' | 'read' | 'write';

interface Th {
  id: number;
  state: RState;
  t: number;
  dur: number;
  wait: number; // ms esperando (para detectar starvation)
}

const NT = 6;
const COLORS = ['#58a6ff', '#ef5350', '#7ee787', '#ffd54f', '#a78bfa', '#4dd0e1'];

/**
 * RwLock lectores-escritores: N lectores simultáneos XOR un escritor.
 * Slider de % de lecturas y política de prioridad para provocar (o evitar)
 * el starvation del escritor.
 */
@Component({
  selector: 'app-rwlock-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="anim">
      <div class="head">
        <div class="titles">
          <div class="title">📖 RwLock: muchos lectores O un escritor</div>
          <div class="caption">
            Subí el % de lecturas con prioridad a lectores y mirá lo que le pasa al escritor.
          </div>
        </div>
        <div class="controls">
          <button class="ctl play" (click)="toggleRun()">{{ running() ? '⏸ Pausa' : '▶ Correr' }}</button>
          <div class="modes">
            <button class="mode" [class.on]="policy() === 'readers'" (click)="setPolicy('readers')">
              prioridad lectores
            </button>
            <button class="mode" [class.on]="policy() === 'writers'" (click)="setPolicy('writers')">
              prioridad escritores
            </button>
          </div>
          <button class="ctl" (click)="reset()">↺ Reset</button>
        </div>
      </div>

      <div class="sliders">
        <label>
          📖 % de accesos que son lecturas: <strong>{{ pctReaders() }}%</strong>
          <input type="range" min="10" max="95" step="5" [value]="pctReaders()" (input)="setPct($event)" />
        </label>
      </div>

      <div class="board">
        <!-- hilos -->
        <div class="threads">
          @for (th of threads(); track th.id) {
            <div class="thr" [style.--tc]="colors[th.id]"
                 [class.reading]="th.state === 'read'" [class.writing]="th.state === 'write'"
                 [class.waiting]="th.state === 'waitR' || th.state === 'waitW'">
              <span class="thr-name">H{{ th.id + 1 }}</span>
              <span class="thr-state">
                @switch (th.state) {
                  @case ('idle') { 💭 }
                  @case ('waitR') { ⛔📖 }
                  @case ('waitW') { ⛔✍ }
                  @case ('read') { 📖 leyendo }
                  @case ('write') { ✍ escribiendo }
                }
              </span>
              @if (th.state === 'waitR' || th.state === 'waitW') {
                <span class="wait-ms">{{ (th.wait / 1000).toFixed(1) }}s</span>
              }
            </div>
          }
        </div>

        <!-- recurso -->
        <div class="res" [class.reading]="readers().length > 0" [class.writing]="writer() !== null">
          <div class="res-label">RwLock&lt;T&gt;</div>
          <div class="res-body">
            @if (writer(); as w) {
              <span class="occ" [style.background]="colors[w]">✍ H{{ w + 1 }} (exclusivo)</span>
            } @else if (readers().length > 0) {
              @for (r of readers(); track r) {
                <span class="occ" [style.background]="colors[r]">📖 H{{ r + 1 }}</span>
              }
            } @else {
              <span class="free">— libre —</span>
            }
          </div>
          <div class="queues">
            <div class="q">
              <span class="q-label">📖 esperan leer:</span>
              @for (id of waitRIds(); track id) {
                <span class="mini" [style.background]="colors[id]">H{{ id + 1 }}</span>
              }
              @if (waitRIds().length === 0) { <span class="q-empty">—</span> }
            </div>
            <div class="q">
              <span class="q-label">✍ esperan escribir:</span>
              @for (id of waitWIds(); track id) {
                <span class="mini" [style.background]="colors[id]">H{{ id + 1 }}</span>
              }
              @if (waitWIds().length === 0) { <span class="q-empty">—</span> }
            </div>
          </div>
        </div>

        <!-- métricas -->
        <div class="side">
          <div class="metric"><span class="m-label">lecturas completadas</span><span class="m-val">{{ reads() }}</span></div>
          <div class="metric"><span class="m-label">escrituras completadas</span><span class="m-val">{{ writes() }}</span></div>
          <div class="metric"><span class="m-label">máx lectores a la vez</span><span class="m-val">{{ maxReaders() }}</span></div>
          <div class="metric" [class.alert]="starving()">
            <span class="m-label">peor espera de escritor</span>
            <span class="m-val">{{ (worstWait() / 1000).toFixed(1) }}s</span>
          </div>
        </div>
      </div>

      @if (starving()) {
        <div class="starve">
          ⚠️ <strong>Writer starvation</strong>: con prioridad a lectores y lecturas constantes, siempre
          hay ALGÚN lector adentro → el escritor nunca consigue exclusividad. El sistema progresa
          (safety y progreso globales OK) pero ese hilo espera sin cota: se viola la espera acotada.
          Probá cambiar a "prioridad escritores".
        </div>
      }

      <div class="status" [class.idle]="events().length === 0">
        @if (events().length === 0) {
          Presioná ▶. Regla: los lectores comparten (varios 📖 a la vez); el escritor exige el recurso vacío.
        }
        @for (e of lastEvents(); track $index) {
          <div [innerHTML]="e"></div>
        }
      </div>
    </div>
  `,
  styles: `
    .anim { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin: 18px 0; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
    .title { font-weight: 700; font-size: 1.02rem; color: #fff; }
    .caption { color: var(--text-dim); font-size: 0.85rem; margin-top: 2px; }
    .controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .ctl { background: var(--panel-2); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 7px 12px; cursor: pointer; font-size: 0.86rem; }
    .ctl:hover { background: #2d3750; }
    .ctl.play { background: #1f6feb; border-color: #1f6feb; color: #fff; font-weight: 700; min-width: 96px; }
    .modes { display: flex; background: var(--panel-2); border: 1px solid var(--border); border-radius: 8px; padding: 2px; gap: 2px; }
    .mode { background: transparent; border: none; color: var(--text-dim); border-radius: 6px; padding: 6px 10px; cursor: pointer; font-size: 0.78rem; font-weight: 600; }
    .mode.on { background: #1f6feb; color: #fff; }

    .sliders { margin-bottom: 12px; }
    .sliders label { display: flex; align-items: center; gap: 10px; font-size: 0.82rem; color: var(--text-dim); flex-wrap: wrap; }
    .sliders strong { color: var(--text); font-family: Consolas, monospace; }
    .sliders input { accent-color: var(--accent); width: 200px; }

    .board { display: grid; grid-template-columns: 150px 1fr 210px; gap: 12px; align-items: stretch; }
    .threads { display: flex; flex-direction: column; gap: 6px; }
    .thr { display: flex; align-items: center; gap: 6px; background: #10151f; border: 1px solid var(--border); border-left: 4px solid var(--tc); border-radius: 8px; padding: 6px 9px; font-size: 0.76rem; }
    .thr.waiting { opacity: 0.75; border-color: #ef535066; }
    .thr.reading { border-color: #58a6ff88; }
    .thr.writing { border-color: #ffd54f; box-shadow: 0 0 10px rgba(255, 213, 79, 0.2); }
    .thr-name { font-weight: 800; color: var(--tc); }
    .thr-state { color: var(--text-dim); font-size: 0.72rem; }
    .wait-ms { margin-left: auto; font-family: Consolas, monospace; font-size: 0.68rem; color: #ef9a9a; }

    .res { display: flex; flex-direction: column; gap: 10px; background: radial-gradient(ellipse at 50% 40%, #202a40 0%, #171e2e 80%); border: 2px dashed #39445f; border-radius: 10px; padding: 14px; transition: border-color 0.25s; }
    .res.reading { border-color: #58a6ff; }
    .res.writing { border-color: #ffd54f; }
    .res-label { font-family: Consolas, monospace; font-size: 0.72rem; color: #5c6a8e; font-weight: 700; text-align: center; }
    .res-body { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; min-height: 34px; align-items: center; }
    .free { color: #5c6a8e; font-style: italic; font-size: 0.85rem; }
    .occ { color: #0d1117; font-weight: 800; font-size: 0.78rem; border-radius: 7px; padding: 4px 10px; }
    .queues { display: flex; flex-direction: column; gap: 5px; margin-top: auto; }
    .q { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; background: #10151f; border: 1px solid var(--border); border-radius: 8px; padding: 5px 9px; min-height: 30px; }
    .q-label { font-size: 0.68rem; color: #5c6a8e; }
    .q-empty { color: #5c6a8e; font-size: 0.7rem; font-style: italic; }
    .mini { color: #0d1117; font-weight: 800; font-size: 0.66rem; border-radius: 5px; padding: 1px 6px; }

    .side { display: flex; flex-direction: column; gap: 8px; }
    .metric { background: #10151f; border: 1px solid var(--border); border-radius: 9px; padding: 8px 12px; display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
    .metric.alert { border-color: #ef535088; }
    .metric.alert .m-val { color: #ef9a9a; }
    .m-label { font-size: 0.7rem; color: var(--text-dim); }
    .m-val { font-family: Consolas, monospace; font-weight: 800; font-size: 1rem; color: var(--text); }

    .starve { margin-top: 12px; background: rgba(239, 83, 80, 0.12); border: 1px solid #ef5350; border-radius: 10px; padding: 12px 14px; font-size: 0.88rem; line-height: 1.55; }

    .status { margin-top: 12px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; min-height: 46px; font-size: 0.85rem; line-height: 1.55; }
    .status.idle { color: var(--text-dim); font-style: italic; }

    @media (max-width: 720px) {
      .board { grid-template-columns: 1fr; }
      .threads { flex-direction: row; flex-wrap: wrap; }
      .side { flex-direction: row; flex-wrap: wrap; }
      .metric { flex: 1; min-width: 140px; }
    }
  `,
})
export class RwlockDetail implements OnDestroy {
  readonly colors = COLORS;

  readonly running = signal(false);
  readonly policy = signal<'readers' | 'writers'>('readers');
  readonly pctReaders = signal(80);
  readonly threads = signal<Th[]>(this.fresh());
  readonly reads = signal(0);
  readonly writes = signal(0);
  readonly maxReaders = signal(0);
  readonly worstWait = signal(0);
  readonly events = signal<string[]>([]);

  readonly readers = computed(() =>
    this.threads().filter((t) => t.state === 'read').map((t) => t.id),
  );
  readonly writer = computed(() => this.threads().find((t) => t.state === 'write')?.id ?? null);
  readonly lastEvents = computed(() => this.events().slice(-3));
  readonly starving = computed(
    () => this.threads().some((t) => t.state === 'waitW' && t.wait > 8000),
  );
  readonly waitRIds = computed(() => {
    const set = new Set(this.threads().filter((t) => t.state === 'waitR').map((t) => t.id));
    return this.waitR.filter((id) => set.has(id));
  });
  readonly waitWIds = computed(() => {
    const set = new Set(this.threads().filter((t) => t.state === 'waitW').map((t) => t.id));
    return this.waitW.filter((id) => set.has(id));
  });

  // colas FIFO (orden de llegada)
  private waitR: number[] = [];
  private waitW: number[] = [];
  private rafId = 0;
  private lastTs = 0;

  private fresh(): Th[] {
    return Array.from({ length: NT }, (_, id) => ({
      id,
      state: 'idle' as RState,
      t: 0,
      dur: 300 + Math.random() * 1400,
      wait: 0,
    }));
  }

  setPct(ev: Event): void {
    this.pctReaders.set(+(ev.target as HTMLInputElement).value);
  }

  setPolicy(p: 'readers' | 'writers'): void {
    if (this.policy() === p) return;
    this.policy.set(p);
    this.logEv(
      p === 'readers'
        ? '📖 Prioridad lectores: un lector nuevo entra siempre que no haya escritor ADENTRO (aunque haya escritores esperando).'
        : '✍ Prioridad escritores: apenas un escritor se encola, los lectores nuevos esperan. Se drena a los lectores y el escritor pasa.',
    );
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

    const ths = this.threads().map((t) => ({ ...t }));

    for (const th of ths) {
      switch (th.state) {
        case 'idle':
          th.t += dt;
          if (th.t >= th.dur) {
            const wantsRead = Math.random() * 100 < this.pctReaders();
            th.state = wantsRead ? 'waitR' : 'waitW';
            th.wait = 0;
            (wantsRead ? this.waitR : this.waitW).push(th.id);
          }
          break;
        case 'waitR':
        case 'waitW':
          th.wait += dt;
          if (th.state === 'waitW') this.worstWait.update((w) => Math.max(w, th.wait));
          break;
        case 'read':
        case 'write':
          th.t += dt;
          if (th.t >= th.dur) {
            if (th.state === 'read') this.reads.update((r) => r + 1);
            else {
              this.writes.update((w) => w + 1);
              this.logEv(`H${th.id + 1} termina de <strong>escribir</strong> y libera el lock exclusivo.`);
            }
            th.state = 'idle';
            th.t = 0;
            th.dur = 300 + Math.random() * 1400;
          }
          break;
      }
    }

    // admisión
    const writerActive = ths.some((t) => t.state === 'write');
    const readersActive = ths.filter((t) => t.state === 'read').length;
    if (!writerActive) {
      const writerWaiting = this.waitW.length > 0;
      // escritor: solo con el recurso totalmente vacío
      if (writerWaiting && readersActive === 0) {
        const id = this.waitW.shift()!;
        const th = ths.find((t) => t.id === id)!;
        th.state = 'write';
        th.t = 0;
        th.dur = 1000 + Math.random() * 900;
        this.logEv(
          `H${id + 1} entra a <strong>escribir</strong> (esperó ${(th.wait / 1000).toFixed(1)}s): recurso exclusivo.`,
        );
      } else if (!writerWaiting || this.policy() === 'readers') {
        // lectores: entran todos los que esperan (si la política lo permite)
        while (this.waitR.length > 0) {
          const id = this.waitR.shift()!;
          const th = ths.find((t) => t.id === id)!;
          th.state = 'read';
          th.t = 0;
          th.dur = 700 + Math.random() * 900;
        }
      }
    }
    const nowReaders = ths.filter((t) => t.state === 'read').length;
    this.maxReaders.update((m) => Math.max(m, nowReaders));

    this.threads.set(ths);
    this.rafId = requestAnimationFrame(this.tick);
  };

  private logEv(html: string): void {
    this.events.update((e) => [...e.slice(-30), html]);
  }

  reset(): void {
    this.running.set(false);
    cancelAnimationFrame(this.rafId);
    this.threads.set(this.fresh());
    this.reads.set(0);
    this.writes.set(0);
    this.maxReaders.set(0);
    this.worstWait.set(0);
    this.events.set([]);
    this.waitR = [];
    this.waitW = [];
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.rafId);
  }
}
