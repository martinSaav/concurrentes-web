import { ChangeDetectionStrategy, Component, OnDestroy, computed, signal } from '@angular/core';

interface Seg {
  kind: 'cpu' | 'io';
  ms: number;
  label: string;
}

type TaskState = 'ready' | 'running' | 'pending' | 'done';

interface Task {
  id: number;
  name: string;
  segs: Seg[];
  segIdx: number;
  segT: number;
  state: TaskState;
  waitT: number; // tiempo en la ready queue sin ser polleada
}

const COLORS = ['#58a6ff', '#7ee787', '#ffd54f'];

function mkTasks(): Task[] {
  const specs: { name: string; segs: Seg[] }[] = [
    {
      name: 'fetch_url',
      segs: [
        { kind: 'cpu', ms: 450, label: 'armar request' },
        { kind: 'io', ms: 1700, label: 'esperar la red' },
        { kind: 'cpu', ms: 550, label: 'parsear respuesta' },
      ],
    },
    {
      name: 'query_db',
      segs: [
        { kind: 'cpu', ms: 350, label: 'preparar query' },
        { kind: 'io', ms: 1300, label: 'esperar la DB' },
        { kind: 'cpu', ms: 450, label: 'mapear filas' },
      ],
    },
    {
      name: 'timer',
      segs: [
        { kind: 'cpu', ms: 300, label: 'setup' },
        { kind: 'io', ms: 2100, label: 'sleep(2s).await' },
        { kind: 'cpu', ms: 300, label: 'callback' },
      ],
    },
  ];
  return specs.map((s, id) => ({
    id,
    name: s.name,
    segs: s.segs,
    segIdx: 0,
    segT: 0,
    state: 'ready' as TaskState,
    waitT: 0,
  }));
}

/**
 * El executor async: UN hilo polleando 3 tareas. Cada .await con Pending
 * devuelve el control; el waker re-encola cuando el I/O está listo.
 * Toggle: una tarea usa sleep BLOQUEANTE y congela a todas las demás.
 */
@Component({
  selector: 'app-async-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="anim">
      <div class="head">
        <div class="titles">
          <div class="title">⚡ El executor: 3 tareas, 1 solo hilo</div>
          <div class="caption">
            Azul = CPU (la tarea corre). Violeta = esperando I/O (la tarea NO ocupa el hilo).
          </div>
        </div>
        <div class="controls">
          <button class="ctl play" (click)="toggleRun()">{{ running() ? '⏸ Pausa' : '▶ Correr' }}</button>
          <button class="ctl" [class.badon]="blocking()" (click)="toggleBlocking()">
            {{ blocking() ? '💀 sleep bloqueante ON' : 'probar sleep bloqueante' }}
          </button>
          <button class="ctl" (click)="reset()">↺ Reset</button>
        </div>
      </div>

      <div class="board">
        <div class="left">
          <!-- executor -->
          <div class="exec" [class.busy]="current() !== null" [class.stuck]="stuck()">
            <div class="ex-label">EXECUTOR (1 hilo)</div>
            <div class="ex-body">
              @if (current(); as c) {
                <span class="ex-task" [style.background]="colors[c.id]">poll({{ c.name }})</span>
              } @else if (allDone()) {
                <span class="ex-free">✔ todas las tareas completadas</span>
              } @else {
                <span class="ex-free">ocioso — espera que el waker encole algo</span>
              }
            </div>
            @if (stuck()) {
              <div class="ex-alert">
                ⚠️ <code>thread::sleep</code> NO devuelve Pending: el executor queda preso.
                Nadie más corre.
              </div>
            }
          </div>

          <!-- ready queue -->
          <div class="rq">
            <span class="rq-label">ready queue:</span>
            @for (id of readyIds(); track id) {
              <span class="rq-item" [style.background]="colors[id]">{{ taskName(id) }}</span>
            }
            @if (readyIds().length === 0) { <span class="rq-empty">vacía</span> }
          </div>

          <!-- métricas -->
          <div class="mets">
            <span class="met">completadas <strong>{{ doneCount() }}/3</strong></span>
            <span class="met">tiempo <strong>{{ (simT() / 1000).toFixed(1) }}s</strong></span>
            <span class="met">hilo ocupado <strong>{{ utilization() }}%</strong></span>
          </div>
        </div>

        <!-- tareas -->
        <div class="tasks">
          @for (t of tasks(); track t.id) {
            <div class="task" [style.--tc]="colors[t.id]" [class.tdone]="t.state === 'done'">
              <div class="t-head">
                <span class="t-name">{{ t.name }}</span>
                <span class="t-state">
                  @switch (t.state) {
                    @case ('ready') { 🟡 ready }
                    @case ('running') { ▶ corriendo }
                    @case ('pending') { 💤 Pending (espera I/O) }
                    @case ('done') { ✔ Ready(valor) }
                  }
                </span>
              </div>
              <div class="strip">
                @for (s of t.segs; track $index; let i = $index) {
                  <div
                    class="seg"
                    [class.cpu]="s.kind === 'cpu'"
                    [class.io]="s.kind === 'io'"
                    [style.flex]="s.ms"
                    [title]="s.label"
                  >
                    <div class="seg-fill" [style.width.%]="segFill(t, i)"></div>
                    <span class="seg-label">{{ s.kind === 'io' ? '⏳' : '⚙' }} {{ s.label }}</span>
                  </div>
                }
              </div>
            </div>
          }
        </div>
      </div>

      <div class="status" [class.idle]="events().length === 0">
        @if (events().length === 0) {
          Presioná ▶. Fijate cómo el hilo salta de tarea en tarea: cada <code>.await</code> que da
          <code>Pending</code> le devuelve el control al executor.
        }
        @for (e of lastEvents(); track $index) {
          <div [innerHTML]="e"></div>
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
    .ctl:hover { background: #2d3750; }
    .ctl.play { background: #1f6feb; border-color: #1f6feb; color: #fff; font-weight: 700; min-width: 96px; }
    .ctl.badon { background: #c73e3a; border-color: #c73e3a; color: #fff; font-weight: 700; }

    .board { display: grid; grid-template-columns: 250px 1fr; gap: 12px; align-items: start; }
    .left { display: flex; flex-direction: column; gap: 8px; }
    .exec { background: radial-gradient(ellipse at 50% 40%, #202a40 0%, #171e2e 80%); border: 2px solid #39445f; border-radius: 10px; padding: 10px 12px; transition: border-color 0.2s; }
    .exec.busy { border-color: #58a6ff; }
    .exec.stuck { border-color: #ef5350; box-shadow: 0 0 14px rgba(239, 83, 80, 0.25); }
    .ex-label { font-size: 0.64rem; letter-spacing: 2px; color: #5c6a8e; font-weight: 800; margin-bottom: 6px; }
    .ex-body { min-height: 30px; display: flex; align-items: center; }
    .ex-task { color: #0d1117; font-weight: 800; font-family: Consolas, monospace; font-size: 0.78rem; border-radius: 7px; padding: 4px 10px; }
    .ex-free { color: #5c6a8e; font-style: italic; font-size: 0.78rem; }
    .ex-alert { margin-top: 8px; color: #ef9a9a; font-size: 0.72rem; line-height: 1.45; }

    .rq { background: #10151f; border: 1px solid var(--border); border-radius: 9px; padding: 7px 10px; display: flex; gap: 5px; align-items: center; flex-wrap: wrap; min-height: 36px; }
    .rq-label { font-size: 0.68rem; color: #5c6a8e; }
    .rq-item { color: #0d1117; font-weight: 800; font-size: 0.66rem; font-family: Consolas, monospace; border-radius: 5px; padding: 2px 7px; }
    .rq-empty { font-size: 0.7rem; color: #5c6a8e; font-style: italic; }

    .mets { display: flex; flex-direction: column; gap: 5px; }
    .met { background: #10151f; border: 1px solid var(--border); border-radius: 8px; padding: 5px 10px; font-size: 0.74rem; color: var(--text-dim); }
    .met strong { color: var(--text); font-family: Consolas, monospace; margin-left: 6px; }

    .tasks { display: flex; flex-direction: column; gap: 10px; }
    .task { background: #10151f; border: 1px solid var(--border); border-left: 4px solid var(--tc); border-radius: 10px; padding: 9px 11px; transition: opacity 0.3s; }
    .task.tdone { opacity: 0.6; }
    .t-head { display: flex; justify-content: space-between; gap: 8px; font-size: 0.8rem; margin-bottom: 7px; flex-wrap: wrap; }
    .t-name { font-weight: 800; font-family: Consolas, monospace; color: var(--tc); }
    .t-state { color: var(--text-dim); font-size: 0.72rem; }
    .strip { display: flex; gap: 3px; height: 26px; }
    .seg { position: relative; border-radius: 5px; overflow: hidden; border: 1px solid var(--border); min-width: 40px; }
    .seg.cpu { background: rgba(88, 166, 255, 0.1); }
    .seg.io { background: rgba(167, 139, 250, 0.1); }
    .seg-fill { position: absolute; inset: 0 auto 0 0; }
    .seg.cpu .seg-fill { background: rgba(88, 166, 255, 0.45); }
    .seg.io .seg-fill { background: rgba(167, 139, 250, 0.45); }
    .seg-label { position: absolute; inset: 0; display: flex; align-items: center; padding-left: 6px; font-size: 0.6rem; color: var(--text); white-space: nowrap; overflow: hidden; }

    .status { margin-top: 12px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; min-height: 46px; font-size: 0.85rem; line-height: 1.55; }
    .status.idle { color: var(--text-dim); font-style: italic; }

    @media (max-width: 720px) {
      .board { grid-template-columns: 1fr; }
    }
  `,
})
export class AsyncDetail implements OnDestroy {
  readonly colors = COLORS;

  readonly running = signal(false);
  readonly blocking = signal(false);
  readonly tasks = signal<Task[]>(mkTasks());
  readonly currentId = signal<number | null>(null);
  readonly events = signal<string[]>([]);
  readonly simT = signal(0);
  readonly busyT = signal(0);

  readonly current = computed(() => {
    const id = this.currentId();
    return id === null ? null : this.tasks()[id];
  });
  readonly doneCount = computed(() => this.tasks().filter((t) => t.state === 'done').length);
  readonly allDone = computed(() => this.doneCount() === 3);
  readonly lastEvents = computed(() => this.events().slice(-3));
  readonly utilization = computed(() =>
    this.simT() === 0 ? 0 : Math.round((this.busyT() / this.simT()) * 100),
  );
  /** el executor está preso en un sleep bloqueante */
  readonly stuck = computed(() => {
    const c = this.current();
    return !!c && c.segs[c.segIdx]?.kind === 'io' && this.blocking() && c.id === 2 && c.state === 'running';
  });
  readonly readyIds = computed(() => {
    // refleja this.readyQueue (se recalcula porque tasks() cambia cada frame)
    this.tasks();
    return [...this.readyQueue];
  });

  private readyQueue: number[] = [];
  private rafId = 0;
  private lastTs = 0;

  constructor() {
    this.readyQueue = [0, 1, 2];
  }

  taskName(id: number): string {
    return this.tasks()[id].name;
  }

  segFill(t: Task, i: number): number {
    if (i < t.segIdx || t.state === 'done') return 100;
    if (i > t.segIdx) return 0;
    return Math.min(100, (t.segT / t.segs[i].ms) * 100);
  }

  toggleBlocking(): void {
    this.blocking.update((v) => !v);
    this.logEv(
      this.blocking()
        ? '💀 Ahora <code>timer</code> usa <code>std::thread::sleep</code> (bloqueante) en vez de <code>tokio::time::sleep(...).await</code>. Reset y mirá el desastre.'
        : '✅ <code>timer</code> vuelve a usar el sleep async (devuelve Pending y libera el hilo).',
    );
  }

  toggleRun(): void {
    if (this.running()) {
      this.running.set(false);
      cancelAnimationFrame(this.rafId);
    } else {
      if (this.allDone()) this.reset();
      this.running.set(true);
      this.lastTs = performance.now();
      this.rafId = requestAnimationFrame(this.tick);
    }
  }

  private readonly tick = (now: number): void => {
    if (!this.running()) return;
    const dt = Math.min(now - this.lastTs, 100);
    this.lastTs = now;

    const ts = this.tasks().map((t) => ({ ...t }));
    if (!ts.every((t) => t.state === 'done')) {
      this.simT.update((v) => v + dt);
    }

    // el executor toma trabajo si está libre
    if (this.currentId() === null && this.readyQueue.length > 0) {
      const id = this.readyQueue.shift()!;
      this.currentId.set(id);
      ts[id].state = 'running';
      this.logEv(`executor hace <code>poll(${ts[id].name})</code> — la tarea avanza hasta su próximo <code>.await</code>.`);
    }

    // avanzar la tarea que tiene el hilo
    const curId = this.currentId();
    if (curId !== null) {
      this.busyT.update((v) => v + dt);
      const t = ts[curId];
      const seg = t.segs[t.segIdx];
      const isBlockingIo = seg.kind === 'io' && this.blocking() && t.id === 2;
      if (seg.kind === 'cpu' || isBlockingIo) {
        t.segT += dt;
        if (t.segT >= seg.ms) {
          t.segIdx++;
          t.segT = 0;
          if (t.segIdx >= t.segs.length) {
            t.state = 'done';
            this.currentId.set(null);
            this.logEv(`✔ <code>${t.name}</code> devolvió <code>Ready</code>: tarea completada.`);
          } else if (t.segs[t.segIdx].kind === 'io' && !(this.blocking() && t.id === 2)) {
            t.state = 'pending';
            this.currentId.set(null);
            this.logEv(
              `<code>${t.name}</code> llegó a "${t.segs[t.segIdx].label}" → devuelve <code>Pending</code>, registra su <strong>waker</strong> y suelta el hilo.`,
            );
          }
          // si el próximo seg es cpu (o io bloqueante), sigue corriendo
        }
      }
    }

    // el I/O de las tareas Pending avanza en paralelo (kernel/timer, no el executor)
    for (const t of ts) {
      if (t.state !== 'pending') continue;
      t.segT += dt;
      const seg = t.segs[t.segIdx];
      if (t.segT >= seg.ms) {
        t.segIdx++;
        t.segT = 0;
        t.state = 'ready';
        this.readyQueue.push(t.id);
        this.logEv(`🔔 el I/O de <code>${t.name}</code> terminó: el <strong>waker</strong> la re-encola en la ready queue.`);
      }
    }

    const done = ts.every((t) => t.state === 'done');
    this.tasks.set(ts);
    if (done) {
      this.running.set(false);
      this.logEv(
        `🏁 Las 3 tareas terminaron en <strong>${(this.simT() / 1000).toFixed(1)}s</strong> con UN hilo (ocupado el ${this.utilization()}% del tiempo). Secuencial hubieran sido ~${this.seqTotal()}s.`,
      );
      return;
    }
    this.rafId = requestAnimationFrame(this.tick);
  };

  private seqTotal(): string {
    const total = mkTasks().reduce((acc, t) => acc + t.segs.reduce((a, s) => a + s.ms, 0), 0);
    return (total / 1000).toFixed(1);
  }

  private logEv(html: string): void {
    this.events.update((e) => [...e.slice(-30), html]);
  }

  reset(): void {
    this.running.set(false);
    cancelAnimationFrame(this.rafId);
    this.tasks.set(mkTasks());
    this.currentId.set(null);
    this.readyQueue = [0, 1, 2];
    this.events.set([]);
    this.simT.set(0);
    this.busyT.set(0);
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.rafId);
  }
}
