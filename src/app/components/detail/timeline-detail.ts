import { ChangeDetectionStrategy, Component, OnDestroy, computed, signal } from '@angular/core';

interface Seg {
  kind: 'cpu' | 'io';
  start: number;
  dur: number;
  label: string;
}

/** una request HTTP como la cheapo_request de la teórica */
const RECIPE: { kind: 'cpu' | 'io'; dur: number; label: string }[] = [
  { kind: 'cpu', dur: 0.3, label: 'armar' },
  { kind: 'io', dur: 1.6, label: 'connect' },
  { kind: 'cpu', dur: 0.2, label: 'write' },
  { kind: 'io', dur: 1.2, label: 'esperar write' },
  { kind: 'cpu', dur: 0.2, label: 'read' },
  { kind: 'io', dur: 1.4, label: 'esperar read' },
  { kind: 'cpu', dur: 0.4, label: 'parsear' },
];

const CPU_TOTAL = RECIPE.filter((s) => s.kind === 'cpu').reduce((a, s) => a + s.dur, 0);
const REQ_TOTAL = RECIPE.reduce((a, s) => a + s.dur, 0);
const COLORS = ['#58a6ff', '#7ee787', '#ffd54f', '#f0883e'];

/**
 * El timeline de la teórica: el hilo sincrónico pasa la mayor parte del
 * tiempo BLOQUEADO en system calls; el asincrónico usa esos huecos para
 * avanzar otras tareas. Misma carga de trabajo, un solo hilo en ambos.
 */
@Component({
  selector: 'app-timeline-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="anim">
      <div class="head">
        <div class="titles">
          <div class="title">⏱ Sincrónico vs asincrónico: el mismo trabajo, un solo hilo</div>
          <div class="caption">
            Azul = el hilo <strong>ejecuta</strong>. Rayado = el hilo <strong>espera</strong> una syscall.
          </div>
        </div>
        <div class="controls">
          <button class="ctl play" (click)="toggleRun()">
            {{ running() ? '⏸ Pausa' : cursor() >= total() ? '↺ Repetir' : '▶ Play' }}
          </button>
          <label class="slider">
            requests: <strong>{{ n() }}</strong>
            <input type="range" min="1" max="4" [value]="n()" (input)="setN($event)" />
          </label>
        </div>
      </div>

      <!-- SINCRÓNICO -->
      <div class="panel">
        <div class="p-head">
          <span class="p-title">🐌 SINCRÓNICO · 1 hilo por vez</span>
          <span class="p-time">termina en <strong>{{ syncTotal().toFixed(1) }}s</strong></span>
        </div>
        @for (row of syncRows(); track $index; let i = $index) {
          <div class="row">
            <span class="rl" [style.color]="colors[i]">req {{ i + 1 }}</span>
            <div class="track">
              @for (s of row; track $index) {
                <div
                  class="seg"
                  [class.cpu]="s.kind === 'cpu'"
                  [class.io]="s.kind === 'io'"
                  [style.left.%]="pct(s.start)"
                  [style.width.%]="pct(visibleDur(s))"
                  [style.background]="s.kind === 'cpu' ? colors[i] : null"
                  [title]="s.label"
                ></div>
              }
            </div>
          </div>
        }
        <div class="row cpurow">
          <span class="rl">CPU</span>
          <div class="track">
            @for (s of syncCpu(); track $index) {
              <div class="seg cpu busy" [style.left.%]="pct(s.start)" [style.width.%]="pct(visibleDur(s))"
                   [style.background]="colors[s.owner]"></div>
            }
          </div>
        </div>
        <div class="p-foot">
          El hilo está <strong>bloqueado en syscalls</strong> el
          <strong class="bad-t">{{ syncIdlePct() }}%</strong> del tiempo. Cada request espera a que
          termine la anterior.
        </div>
      </div>

      <!-- ASINCRÓNICO -->
      <div class="panel async">
        <div class="p-head">
          <span class="p-title">⚡ ASINCRÓNICO · 1 hilo, tareas intercaladas</span>
          <span class="p-time">termina en <strong class="ok-t">{{ asyncTotal().toFixed(1) }}s</strong></span>
        </div>
        @for (row of asyncRows(); track $index; let i = $index) {
          <div class="row">
            <span class="rl" [style.color]="colors[i]">tarea {{ i + 1 }}</span>
            <div class="track">
              @for (s of row; track $index) {
                <div
                  class="seg"
                  [class.cpu]="s.kind === 'cpu'"
                  [class.io]="s.kind === 'io'"
                  [style.left.%]="pct(s.start)"
                  [style.width.%]="pct(visibleDur(s))"
                  [style.background]="s.kind === 'cpu' ? colors[i] : null"
                  [title]="s.label"
                ></div>
              }
            </div>
          </div>
        }
        <div class="row cpurow">
          <span class="rl">CPU</span>
          <div class="track">
            @for (s of asyncCpu(); track $index) {
              <div class="seg cpu busy" [style.left.%]="pct(s.start)" [style.width.%]="pct(visibleDur(s))"
                   [style.background]="colors[s.owner]"></div>
            }
          </div>
        </div>
        <div class="p-foot">
          El hilo salta de tarea en tarea: mientras una espera la red, otra usa la CPU.
          El <strong>tiempo de espera es el mismo</strong> — lo que cambia es que ya no se desperdicia.
        </div>
      </div>

      <!-- eje + cursor -->
      <div class="axis">
        <div class="axis-track">
          @for (t of ticks(); track t) {
            <span class="tick" [style.left.%]="pct(t)">{{ t }}s</span>
          }
          @if (cursor() > 0) {
            <div class="cursor" [style.left.%]="pct(cursor())"></div>
          }
        </div>
      </div>

      <div class="mets">
        <div class="met">
          <span class="m-label">speedup</span>
          <span class="m-val ok-t">{{ speedup() }}×</span>
        </div>
        <div class="met">
          <span class="m-label">CPU realmente usada</span>
          <span class="m-val">{{ cpuBusy().toFixed(1) }}s</span>
        </div>
        <div class="met">
          <span class="m-label">tiempo ahorrado</span>
          <span class="m-val ok-t">{{ (syncTotal() - asyncTotal()).toFixed(1) }}s</span>
        </div>
        <div class="met-note">
          Async <strong>no acelera</strong> ninguna request: cada una tarda lo mismo. Lo que hace es
          no desperdiciar el hilo mientras espera — por eso el speedup crece con la cantidad de
          requests concurrentes, y desaparece si el trabajo es CPU-bound.
        </div>
      </div>
    </div>
  `,
  styles: `
    .anim { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin: 18px 0; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
    .title { font-weight: 700; font-size: 1.02rem; color: #fff; }
    .caption { color: var(--text-dim); font-size: 0.85rem; margin-top: 2px; }
    .controls { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .ctl { background: var(--panel-2); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 7px 12px; cursor: pointer; font-size: 0.86rem; }
    .ctl.play { background: #1f6feb; border-color: #1f6feb; color: #fff; font-weight: 700; min-width: 106px; }
    .slider { display: flex; align-items: center; gap: 8px; font-size: 0.8rem; color: var(--text-dim); }
    .slider strong { color: var(--text); font-family: Consolas, monospace; }
    .slider input { accent-color: var(--accent); width: 90px; }

    .panel { background: #10151f; border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; margin-bottom: 10px; }
    .panel.async { border-color: #2ea04366; }
    .p-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
    .p-title { font-size: 0.82rem; font-weight: 800; color: #fff; }
    .p-time { font-size: 0.76rem; color: var(--text-dim); }
    .p-time strong { font-family: Consolas, monospace; color: #ef9a9a; }
    .p-time strong.ok-t { color: #7ee787; }

    .row { display: grid; grid-template-columns: 52px 1fr; gap: 8px; align-items: center; margin-bottom: 4px; }
    .rl { font-size: 0.68rem; font-family: Consolas, monospace; text-align: right; color: var(--text-dim); }
    .track { position: relative; height: 16px; background: #0b0f19; border: 1px solid var(--border); border-radius: 4px; overflow: hidden; }
    .seg { position: absolute; top: 0; bottom: 0; border-radius: 2px; }
    .seg.io { background: repeating-linear-gradient(45deg, #2b3350, #2b3350 4px, #363f61 4px, #363f61 8px); }
    .cpurow { margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--border); }
    .cpurow .rl { color: #8b95b5; font-weight: 700; }
    .cpurow .track { height: 12px; }

    .p-foot { margin-top: 8px; font-size: 0.75rem; color: var(--text-dim); line-height: 1.5; }
    .p-foot strong { color: var(--text); }
    .bad-t { color: #ef9a9a; }
    .ok-t { color: #7ee787; }

    .axis { display: grid; grid-template-columns: 52px 1fr; gap: 8px; margin-bottom: 12px; }
    .axis-track { position: relative; height: 18px; grid-column: 2; }
    .tick { position: absolute; top: 0; transform: translateX(-50%); font-size: 0.6rem; color: #5c6a8e; font-family: Consolas, monospace; }
    .cursor { position: absolute; top: -160px; bottom: 0; width: 2px; background: #ffd54f; box-shadow: 0 0 8px rgba(255, 213, 79, 0.5); pointer-events: none; }

    .mets { display: flex; gap: 10px; flex-wrap: wrap; align-items: stretch; }
    .met { background: #10151f; border: 1px solid var(--border); border-radius: 9px; padding: 8px 14px; display: flex; flex-direction: column; }
    .m-label { font-size: 0.66rem; color: var(--text-dim); }
    .m-val { font-family: Consolas, monospace; font-weight: 800; font-size: 1.1rem; color: var(--text); }
    .met-note { flex: 1; min-width: 220px; font-size: 0.76rem; color: var(--text-dim); line-height: 1.5; align-self: center; }
    .met-note strong { color: var(--text); }

    @media (max-width: 720px) {
      .row, .axis { grid-template-columns: 40px 1fr; }
    }
  `,
})
export class TimelineDetail implements OnDestroy {
  readonly colors = COLORS;

  readonly n = signal(3);
  readonly running = signal(false);
  readonly cursor = signal(0); // segundos revelados

  /** timeline sincrónico: una request tras otra en el mismo hilo */
  readonly syncRows = computed<Seg[][]>(() => {
    const rows: Seg[][] = [];
    let t = 0;
    for (let i = 0; i < this.n(); i++) {
      const segs: Seg[] = [];
      for (const r of RECIPE) {
        segs.push({ kind: r.kind, start: t, dur: r.dur, label: r.label });
        t += r.dur;
      }
      rows.push(segs);
    }
    return rows;
  });

  /**
   * timeline asincrónico: un solo hilo ejecuta los tramos de CPU de la tarea
   * que esté lista; los tramos de I/O avanzan en paralelo (los hace el SO).
   */
  readonly asyncRows = computed<Seg[][]>(() => {
    const count = this.n();
    const rows: Seg[][] = Array.from({ length: count }, () => []);
    const idx = new Array(count).fill(0); // en qué paso de la receta va cada tarea
    const ready = new Array(count).fill(0); // desde cuándo puede correr su próximo tramo
    let cpuFree = 0; // cuándo se libera el hilo
    let pending = count;

    while (pending > 0) {
      // elegimos la tarea lista más temprano (desempate: la de menor índice)
      let best = -1;
      let bestTime = Infinity;
      for (let i = 0; i < count; i++) {
        if (idx[i] >= RECIPE.length) continue;
        const t = Math.max(ready[i], cpuFree);
        if (t < bestTime) {
          bestTime = t;
          best = i;
        }
      }
      if (best < 0) break;

      const step = RECIPE[idx[best]];
      if (step.kind === 'cpu') {
        const start = Math.max(ready[best], cpuFree);
        rows[best].push({ kind: 'cpu', start, dur: step.dur, label: step.label });
        cpuFree = start + step.dur;
        ready[best] = cpuFree;
      } else {
        // el I/O no ocupa el hilo: corre en paralelo desde que la tarea quedó lista
        const start = ready[best];
        rows[best].push({ kind: 'io', start, dur: step.dur, label: step.label });
        ready[best] = start + step.dur;
      }
      idx[best]++;
      if (idx[best] >= RECIPE.length) pending--;
    }
    return rows;
  });

  private lastEnd(rows: Seg[][]): number {
    let max = 0;
    for (const r of rows) for (const s of r) max = Math.max(max, s.start + s.dur);
    return max;
  }

  readonly syncTotal = computed(() => this.lastEnd(this.syncRows()));
  readonly asyncTotal = computed(() => this.lastEnd(this.asyncRows()));
  readonly total = computed(() => Math.max(this.syncTotal(), this.asyncTotal()));

  readonly syncCpu = computed(() =>
    this.syncRows().flatMap((r, i) => r.filter((s) => s.kind === 'cpu').map((s) => ({ ...s, owner: i }))),
  );
  readonly asyncCpu = computed(() =>
    this.asyncRows().flatMap((r, i) => r.filter((s) => s.kind === 'cpu').map((s) => ({ ...s, owner: i }))),
  );

  readonly cpuBusy = computed(() => CPU_TOTAL * this.n());
  readonly syncIdlePct = computed(() =>
    Math.round(((this.syncTotal() - this.cpuBusy()) / this.syncTotal()) * 100),
  );
  readonly speedup = computed(() => (this.syncTotal() / this.asyncTotal()).toFixed(2));

  readonly ticks = computed(() => {
    const out: number[] = [];
    for (let t = 0; t <= Math.floor(this.total()); t += 2) out.push(t);
    return out;
  });

  private rafId = 0;
  private lastTs = 0;

  pct(v: number): number {
    return (v / this.total()) * 100;
  }

  /** ancho visible del segmento según el cursor (para el efecto de "dibujado") */
  visibleDur(s: Seg): number {
    if (this.cursor() <= 0) return s.dur; // sin animar: todo visible
    const end = Math.min(s.start + s.dur, this.cursor());
    return Math.max(0, end - s.start);
  }

  setN(ev: Event): void {
    this.n.set(+(ev.target as HTMLInputElement).value);
    this.reset();
  }

  toggleRun(): void {
    if (this.running()) {
      this.running.set(false);
      cancelAnimationFrame(this.rafId);
      return;
    }
    if (this.cursor() >= this.total()) this.cursor.set(0);
    this.running.set(true);
    this.lastTs = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number): void => {
    if (!this.running()) return;
    const dt = Math.min(now - this.lastTs, 100) / 1000; // segundos reales
    this.lastTs = now;
    const next = this.cursor() + dt * 2.5; // 2.5× para no aburrir
    if (next >= this.total()) {
      this.cursor.set(this.total());
      this.running.set(false);
      return;
    }
    this.cursor.set(next);
    this.rafId = requestAnimationFrame(this.tick);
  };

  reset(): void {
    this.running.set(false);
    cancelAnimationFrame(this.rafId);
    this.cursor.set(0);
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.rafId);
  }
}
