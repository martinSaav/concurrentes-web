import { ChangeDetectionStrategy, Component, OnDestroy, computed, signal } from '@angular/core';

interface Task {
  id: number;
  size: number; // >1 se subdivide; 1 se ejecuta y termina
}

interface Worker {
  id: number;
  deque: Task[];
  current: Task | null;
  t: number;
  dur: number;
  done: number;
  steals: number;
  blocked: number; // ms esperando el lock de la cola compartida
}

interface Flying {
  task: Task;
  from: number;
  to: number;
  t: number;
}

const NW = 4;
const COLORS = ['#58a6ff', '#7ee787', '#ffd54f', '#a78bfa'];

/**
 * Work stealing: cada worker tiene su deque; saca del FONDO y roba del
 * TOPE de otro (por eso no hay conflicto con el dueño). Toggle a "cola
 * compartida única" para ver la contención que justifica el diseño.
 */
@Component({
  selector: 'app-workstealing-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="anim">
      <div class="head">
        <div class="titles">
          <div class="title">🥷 Work stealing: cómo se reparten las tareas</div>
          <div class="caption">
            El dueño saca del <strong>fondo</strong>; el ladrón roba del <strong>tope</strong>. Nunca se pisan.
          </div>
        </div>
        <div class="controls">
          <button class="ctl play" (click)="toggleRun()">{{ running() ? '⏸ Pausa' : '▶ Correr' }}</button>
          <div class="modes">
            <button class="mode" [class.on]="perWorker()" (click)="setMode(true)">deque por worker</button>
            <button class="mode danger" [class.on]="!perWorker()" (click)="setMode(false)">cola compartida</button>
          </div>
          <button class="ctl" (click)="reset()">↺ Reset</button>
        </div>
      </div>

      <div class="board">
        <!-- cola compartida (modo alternativo) -->
        @if (!perWorker()) {
          <div class="shared">
            <div class="sh-head">
              🔒 cola compartida ({{ shared().length }})
              @if (lockOwner() !== null) {
                <span class="lockby" [style.color]="colors[lockOwner()!]">lock: W{{ lockOwner()! + 1 }}</span>
              } @else {
                <span class="lockfree">lock libre</span>
              }
            </div>
            <div class="sh-body">
              @for (t of shared().slice(0, 14); track t.id) {
                <span class="task sm">{{ t.size }}</span>
              }
              @if (shared().length > 14) { <span class="more">+{{ shared().length - 14 }}</span> }
              @if (shared().length === 0) { <span class="empty">vacía</span> }
            </div>
          </div>
        }

        <div class="workers">
          @for (w of workers(); track w.id) {
            <div class="worker" [style.--wc]="colors[w.id]" [class.idle]="!w.current" [class.blocked]="isBlocked(w)">
              <div class="w-head">
                <span class="wn">W{{ w.id + 1 }}</span>
                <span class="ws">
                  @if (isBlocked(w)) { ⛔ espera el lock }
                  @else if (w.current) { ⚙ ejecuta }
                  @else { 💤 sin trabajo }
                </span>
              </div>

              @if (perWorker()) {
                <div class="deque">
                  <div class="dq-label top">↑ roban de acá</div>
                  <div class="dq-body">
                    @for (t of w.deque; track t.id; let i = $index) {
                      <span class="task" [class.tp]="i === 0" [class.bt]="i === w.deque.length - 1">{{ t.size }}</span>
                    }
                    @if (w.deque.length === 0) { <span class="empty">deque vacío</span> }
                  </div>
                  <div class="dq-label bot">↓ el dueño saca de acá</div>
                </div>
              }

              <div class="exec">
                @if (w.current) {
                  <div class="ex-task">tarea size {{ w.current.size }}</div>
                  <div class="bar-track"><div class="bar" [style.width.%]="(w.t / w.dur) * 100"></div></div>
                } @else {
                  <div class="ex-idle">—</div>
                }
              </div>

              <div class="w-stats">
                <span>✔ {{ w.done }}</span>
                @if (perWorker()) { <span>🥷 {{ w.steals }}</span> }
                @if (!perWorker() && w.blocked > 0) { <span class="bad-t">⏳ {{ (w.blocked / 1000).toFixed(1) }}s</span> }
              </div>
            </div>
          }
        </div>

        <!-- tarea robada en vuelo -->
        @if (flying(); as f) {
          <div class="fly" [style.left.%]="flyX(f)" [style.top.%]="flyY(f)">🥷 {{ f.task.size }}</div>
        }
      </div>

      <div class="mets">
        <div class="met"><span class="m-label">tareas completadas</span><span class="m-val">{{ totalDone() }}</span></div>
        <div class="met"><span class="m-label">robos</span><span class="m-val">{{ totalSteals() }}</span></div>
        <div class="met" [class.alert]="totalBlocked() > 0">
          <span class="m-label">tiempo perdido en contención</span>
          <span class="m-val">{{ (totalBlocked() / 1000).toFixed(1) }}s</span>
        </div>
        <div class="met-note" [innerHTML]="note()"></div>
      </div>

      <div class="status" [class.idle]="!msg()">
        @if (msg(); as m) {
          <span [innerHTML]="m"></span>
        } @else {
          Arranca con <strong>todo el trabajo en W1</strong> (como un fork-join recién lanzado). Los
          demás están ociosos: mirá cómo se lo reparten solos.
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
    .mode { background: transparent; border: none; color: var(--text-dim); border-radius: 6px; padding: 6px 10px; cursor: pointer; font-size: 0.78rem; font-weight: 600; }
    .mode.on { background: #2ea043; color: #fff; }
    .mode.danger.on { background: #c73e3a; }

    .board { position: relative; background: radial-gradient(ellipse at 50% 40%, #202a40 0%, #171e2e 80%); border: 1px solid var(--border); border-radius: 10px; padding: 12px; }
    .shared { background: #10151f; border: 1px solid #c73e3a55; border-radius: 9px; padding: 8px 10px; margin-bottom: 10px; }
    .sh-head { display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--text-dim); font-weight: 700; margin-bottom: 6px; }
    .lockby { font-family: Consolas, monospace; }
    .lockfree { color: #5c6a8e; font-weight: 400; }
    .sh-body { display: flex; gap: 3px; flex-wrap: wrap; align-items: center; min-height: 22px; }

    .workers { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .worker { background: #10151f; border: 1px solid var(--border); border-top: 3px solid var(--wc); border-radius: 9px; padding: 8px; display: flex; flex-direction: column; gap: 6px; transition: opacity 0.2s, border-color 0.2s; }
    .worker.idle { opacity: 0.72; }
    .worker.blocked { border-color: #ef535066; }
    .w-head { display: flex; justify-content: space-between; align-items: baseline; gap: 4px; flex-wrap: wrap; }
    .wn { font-weight: 800; font-size: 0.8rem; color: var(--wc); }
    .ws { font-size: 0.62rem; color: var(--text-dim); }

    .deque { background: #0b0f19; border: 1px solid var(--border); border-radius: 6px; padding: 4px; }
    .dq-label { font-size: 0.54rem; color: #5c6a8e; text-align: center; }
    .dq-label.top { color: #ffab70; }
    .dq-label.bot { color: #7ee787; }
    .dq-body { display: flex; flex-direction: column; gap: 2px; align-items: center; padding: 3px 0; min-height: 42px; justify-content: center; }
    .task { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 15px; padding: 0 4px; background: #232b3e; border: 1px solid #3d4a6b; border-radius: 3px; font-size: 0.6rem; font-family: Consolas, monospace; color: var(--text); }
    .task.sm { height: 14px; }
    .task.tp { border-color: #ffab70; }
    .task.bt { border-color: #7ee787; }
    .empty { font-size: 0.6rem; color: #5c6a8e; font-style: italic; }
    .more { font-size: 0.6rem; color: var(--text-dim); font-family: Consolas, monospace; }

    .exec { min-height: 26px; }
    .ex-task { font-size: 0.62rem; color: var(--text); margin-bottom: 3px; }
    .ex-idle { font-size: 0.62rem; color: #5c6a8e; }
    .bar-track { height: 5px; background: #0b0f19; border-radius: 3px; overflow: hidden; }
    .bar { height: 100%; background: var(--wc); }
    .w-stats { display: flex; gap: 8px; font-size: 0.62rem; color: var(--text-dim); font-family: Consolas, monospace; flex-wrap: wrap; }

    .fly { position: absolute; transform: translate(-50%, -50%); background: rgba(8, 12, 22, 0.95); border: 1.5px solid #ffab70; color: #ffab70; border-radius: 6px; padding: 2px 8px; font-size: 0.66rem; font-weight: 700; font-family: Consolas, monospace; z-index: 3; }

    .mets { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; align-items: stretch; }
    .met { background: #10151f; border: 1px solid var(--border); border-radius: 9px; padding: 7px 13px; display: flex; flex-direction: column; }
    .met.alert { border-color: #ef535088; }
    .met.alert .m-val { color: #ef9a9a; }
    .m-label { font-size: 0.64rem; color: var(--text-dim); }
    .m-val { font-family: Consolas, monospace; font-weight: 800; font-size: 1.05rem; color: var(--text); }
    .met-note { flex: 1; min-width: 220px; font-size: 0.74rem; color: var(--text-dim); line-height: 1.5; align-self: center; }
    .met-note strong { color: var(--text); }
    .bad-t { color: #ef9a9a; }

    .status { margin-top: 12px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; min-height: 46px; font-size: 0.85rem; line-height: 1.55; }
    .status.idle { color: var(--text-dim); }

    @media (max-width: 720px) {
      .workers { grid-template-columns: repeat(2, 1fr); }
    }
  `,
})
export class WorkstealingDetail implements OnDestroy {
  readonly colors = COLORS;

  readonly running = signal(false);
  readonly perWorker = signal(true);
  readonly workers = signal<Worker[]>(this.fresh());
  readonly shared = signal<Task[]>([]);
  readonly lockOwner = signal<number | null>(null);
  readonly flying = signal<Flying | null>(null);
  readonly msg = signal<string | null>(null);

  readonly totalDone = computed(() => this.workers().reduce((a, w) => a + w.done, 0));
  readonly totalSteals = computed(() => this.workers().reduce((a, w) => a + w.steals, 0));
  readonly totalBlocked = computed(() => this.workers().reduce((a, w) => a + w.blocked, 0));

  private seq = 100;
  private rafId = 0;
  private lastTs = 0;
  private lockTimer = 0;

  private fresh(): Worker[] {
    const ws: Worker[] = Array.from({ length: NW }, (_, id) => ({
      id,
      deque: [],
      current: null,
      t: 0,
      dur: 1,
      done: 0,
      steals: 0,
      blocked: 0,
    }));
    // con deques, todo el trabajo arranca en W1 (fork-join recién lanzado);
    // con cola compartida, la tarea inicial vive en la cola global
    if (this.perWorker()) ws[0].deque.push({ id: 1, size: 5 });
    return ws;
  }

  isBlocked(w: Worker): boolean {
    return !this.perWorker() && !w.current && this.lockOwner() !== null && this.lockOwner() !== w.id;
  }

  note(): string {
    return this.perWorker()
      ? 'Cada worker usa <strong>su propio deque</strong>: saca del fondo, y los ladrones roban del tope. Como uno saca por delante y otro por atrás, <strong>no compiten</strong> → casi no hace falta sincronizar.'
      : 'Con una <strong>única cola compartida</strong>, cada worker que quiere agregar o tomar una tarea <strong>debe lockearla</strong>: los demás esperan su turno. Mirá crecer el tiempo de contención.';
  }

  setMode(v: boolean): void {
    if (this.perWorker() === v) return;
    this.perWorker.set(v);
    this.reset();
    this.msg.set(
      v
        ? '🥷 Deque por worker: cada uno trabaja en el suyo y roba solo cuando se queda sin nada.'
        : '🔒 Cola compartida: una sola cola para los 4, protegida por un lock. Funciona… pero todos hacen fila.',
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

  /* posición aproximada de cada worker para animar el robo (en % del board) */
  private wx(id: number): number {
    return 12.5 + id * 25;
  }
  flyX(f: Flying): number {
    return this.wx(f.from) + (this.wx(f.to) - this.wx(f.from)) * f.t;
  }
  flyY(f: Flying): number {
    return this.perWorker() ? 45 : 60;
  }

  private readonly tick = (now: number): void => {
    if (!this.running()) return;
    const dt = Math.min(now - this.lastTs, 100);
    this.lastTs = now;
    const ws = this.workers().map((w) => ({ ...w, deque: [...w.deque] }));

    // tarea en vuelo (robo)
    const f = this.flying();
    if (f) {
      const nt = f.t + dt / 450;
      if (nt >= 1) {
        ws[f.to].deque.push(f.task);
        this.flying.set(null);
      } else {
        this.flying.set({ ...f, t: nt });
      }
    }

    // el lock de la cola compartida se libera solo
    if (!this.perWorker() && this.lockOwner() !== null) {
      this.lockTimer -= dt;
      if (this.lockTimer <= 0) this.lockOwner.set(null);
    }

    for (const w of ws) {
      // ejecutar la tarea actual
      if (w.current) {
        w.t += dt;
        if (w.t >= w.dur) {
          const task = w.current;
          w.current = null;
          if (task.size > 1) {
            // fork: dos subtareas al fondo de su propio deque (o a la cola compartida)
            const a = { id: this.seq++, size: task.size - 1 };
            const b = { id: this.seq++, size: task.size - 1 };
            if (this.perWorker()) {
              w.deque.push(a, b);
            } else {
              this.shared.update((s) => [...s, a, b]);
            }
          } else {
            w.done++;
          }
        }
        continue;
      }

      // buscar trabajo
      if (this.perWorker()) {
        if (w.deque.length > 0) {
          // el dueño saca del FONDO
          const task = w.deque.pop()!;
          w.current = task;
          w.t = 0;
          w.dur = 420 + Math.random() * 260;
        } else if (!this.flying()) {
          // robar del TOPE del deque más cargado
          const victim = ws
            .filter((v) => v.id !== w.id && v.deque.length > 0)
            .sort((a, b) => b.deque.length - a.deque.length)[0];
          if (victim) {
            const task = victim.deque.shift()!;
            w.steals++;
            this.flying.set({ task, from: victim.id, to: w.id, t: 0 });
            this.msg.set(
              `🥷 <strong>W${w.id + 1}</strong> se quedó sin trabajo y le roba una tarea del <strong>tope</strong> del deque de W${victim.id + 1}. ` +
                `El dueño sigue sacando del fondo, así que <strong>no se pisan</strong>.`,
            );
          }
        }
      } else {
        // cola compartida: hay que tomar el lock
        if (this.shared().length > 0) {
          if (this.lockOwner() === null) {
            this.lockOwner.set(w.id);
            this.lockTimer = 180;
            const task = this.shared()[0];
            this.shared.update((s) => s.slice(1));
            w.current = task;
            w.t = 0;
            w.dur = 420 + Math.random() * 260;
          } else if (this.lockOwner() !== w.id) {
            w.blocked += dt;
          }
        }
      }
    }

    this.workers.set(ws);

    // ¿terminó todo?
    const idle =
      ws.every((w) => !w.current && (this.perWorker() ? w.deque.length === 0 : true)) &&
      (this.perWorker() ? true : this.shared().length === 0) &&
      !this.flying();
    if (idle && this.totalDone() > 0) {
      this.running.set(false);
      this.msg.set(
        `🏁 Terminaron las <strong>${this.totalDone()}</strong> tareas hoja. ` +
          (this.perWorker()
            ? `Se hicieron <strong>${this.totalSteals()} robos</strong> para balancear la carga, y la sincronización fue mínima.`
            : `Se perdieron <strong>${(this.totalBlocked() / 1000).toFixed(1)}s</strong> esperando el lock de la cola compartida.`),
      );
      return;
    }
    this.rafId = requestAnimationFrame(this.tick);
  };

  reset(): void {
    this.running.set(false);
    cancelAnimationFrame(this.rafId);
    this.workers.set(this.fresh());
    this.shared.set(this.perWorker() ? [] : [{ id: 1, size: 5 }]);
    this.lockOwner.set(null);
    this.flying.set(null);
    this.msg.set(null);
    this.seq = 100;
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.rafId);
  }
}
