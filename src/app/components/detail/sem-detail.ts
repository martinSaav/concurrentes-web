import { ChangeDetectionStrategy, Component, OnDestroy, computed, signal } from '@angular/core';

type Kind = 'prod' | 'cons';
// fases: 0 = trabajando/idle, 1 = adquirir sem1, 2 = adquirir sem2, 3 = op sobre el buffer
interface Agent {
  id: string;
  kind: Kind;
  phase: 0 | 1 | 2 | 3;
  t: number;
  dur: number;
  blockedOn: string | null; // 'vacios' | 'llenos' | 'mutex' | null
}

const CAP = 5;
const ITEMS = ['📦', '🍕', '📨', '🧮', '🎁', '🔧'];

/**
 * Productor-consumidor con buffer acotado: dos semáforos (vacios/llenos) + mutex.
 * Toggle "orden incorrecto": el consumidor toma el mutex ANTES de esperar
 * el semáforo → deadlock reproducible cuando el buffer queda vacío.
 */
@Component({
  selector: 'app-sem-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="anim">
      <div class="head">
        <div class="titles">
          <div class="title">🚦 Semáforos: productor-consumidor con buffer acotado (N = {{ cap }})</div>
          <div class="caption">
            vacios cuenta lugares libres, llenos cuenta ítems. El mutex solo protege el push/pop.
          </div>
        </div>
        <div class="controls">
          <button class="ctl play" (click)="toggleRun()">{{ running() ? '⏸ Pausa' : '▶ Correr' }}</button>
          <button
            class="ctl"
            [class.badon]="wrongOrder()"
            (click)="toggleOrder()"
            title="El consumidor toma el mutex antes de esperar 'llenos'"
          >
            {{ wrongOrder() ? '💀 orden incorrecto ON' : 'probar orden incorrecto' }}
          </button>
          <button class="ctl" (click)="reset()">↺ Reset</button>
        </div>
      </div>

      <div class="sliders">
        <label>
          🏭 velocidad productores
          <input type="range" min="1" max="10" [value]="prodSpeed()" (input)="setProdSpeed($event)" />
        </label>
        <label>
          🍽 velocidad consumidores
          <input type="range" min="1" max="10" [value]="consSpeed()" (input)="setConsSpeed($event)" />
        </label>
      </div>

      <div class="board">
        <!-- productores -->
        <div class="col">
          @for (a of producers(); track a.id) {
            <div class="agent prod" [class.blocked]="a.blockedOn !== null">
              <div class="a-head">
                <span class="a-name">🏭 {{ a.id }}</span>
                <span class="a-state">{{ stateLabel(a) }}</span>
              </div>
              <div class="bar-track">
                <div class="bar" [class.blockbar]="a.blockedOn !== null"
                     [style.width.%]="a.blockedOn !== null ? 100 : (a.t / a.dur) * 100"></div>
              </div>
            </div>
          }
        </div>

        <!-- buffer + semáforos -->
        <div class="center">
          <div class="buffer">
            @for (s of slots(); track $index) {
              <div class="slot" [class.full]="s !== null">{{ s ?? '' }}</div>
            }
          </div>
          <div class="sems">
            <div class="sem">
              <span class="sem-name green-t">vacios</span>
              <span class="dots">
                @for (d of dots(vacios()); track $index) {
                  <span class="dot green-d"></span>
                }
                @if (vacios() === 0) { <span class="zero">0</span> }
              </span>
              @if (semWaiters('vacios'); as w) {
                @if (w.length > 0) { <span class="waiters">⛔ {{ w.join(', ') }}</span> }
              }
            </div>
            <div class="sem">
              <span class="sem-name orange-t">llenos</span>
              <span class="dots">
                @for (d of dots(llenos()); track $index) {
                  <span class="dot orange-d"></span>
                }
                @if (llenos() === 0) { <span class="zero">0</span> }
              </span>
              @if (semWaiters('llenos'); as w) {
                @if (w.length > 0) { <span class="waiters">⛔ {{ w.join(', ') }}</span> }
              }
            </div>
            <div class="sem">
              <span class="sem-name">mutex</span>
              <span class="mutex-holder">
                @if (mutexHolder(); as h) { 🔒 {{ h }} } @else { 🔓 libre }
              </span>
              @if (semWaiters('mutex'); as w) {
                @if (w.length > 0) { <span class="waiters">⛔ {{ w.join(', ') }}</span> }
              }
            </div>
          </div>
        </div>

        <!-- consumidores -->
        <div class="col">
          @for (a of consumers(); track a.id) {
            <div class="agent cons" [class.blocked]="a.blockedOn !== null">
              <div class="a-head">
                <span class="a-name">🍽 {{ a.id }}</span>
                <span class="a-state">{{ stateLabel(a) }}</span>
              </div>
              <div class="bar-track">
                <div class="bar" [class.blockbar]="a.blockedOn !== null"
                     [style.width.%]="a.blockedOn !== null ? 100 : (a.t / a.dur) * 100"></div>
              </div>
            </div>
          }
        </div>
      </div>

      @if (deadlocked()) {
        <div class="dead">
          💀 <strong>DEADLOCK</strong>: un consumidor se durmió esperando <code>llenos</code>
          <strong>con el mutex tomado</strong>. Los productores tienen lugares (<code>vacios</code> &gt; 0)
          pero no pueden tocar el buffer sin el mutex. Nadie puede avanzar jamás.
          Fijate que hay hold&nbsp;and&nbsp;wait + espera circular. Tocá ↺ Reset o apagá el orden incorrecto.
        </div>
      }

      <div class="foot">
        <div class="metrics">
          <span class="metric">producidos <strong>{{ produced() }}</strong></span>
          <span class="metric">consumidos <strong>{{ consumed() }}</strong></span>
          <span class="metric">bloqueos <strong>{{ blocks() }}</strong></span>
        </div>
        <div class="status" [class.idle]="events().length === 0">
          @if (events().length === 0) {
            Presioná ▶. Subí la velocidad de los productores para llenar el buffer (vacios → 0),
            o la de los consumidores para vaciarlo (llenos → 0), y mirá quién se bloquea.
          }
          @for (e of lastEvents(); track $index) {
            <div [innerHTML]="e"></div>
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    .anim { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin: 18px 0; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
    .title { font-weight: 700; font-size: 1.02rem; color: #fff; }
    .caption { color: var(--text-dim); font-size: 0.85rem; margin-top: 2px; }
    .controls { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .ctl { background: var(--panel-2); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 7px 12px; cursor: pointer; font-size: 0.86rem; }
    .ctl:hover { background: #2d3750; }
    .ctl.play { background: #1f6feb; border-color: #1f6feb; color: #fff; font-weight: 700; min-width: 96px; }
    .ctl.badon { background: #c73e3a; border-color: #c73e3a; color: #fff; font-weight: 700; }

    .sliders { display: flex; gap: 22px; flex-wrap: wrap; margin-bottom: 12px; }
    .sliders label { display: flex; align-items: center; gap: 10px; font-size: 0.8rem; color: var(--text-dim); }
    .sliders input { accent-color: var(--accent); width: 140px; }

    .board { display: grid; grid-template-columns: 1fr 1.3fr 1fr; gap: 12px; align-items: start; }
    .col { display: flex; flex-direction: column; gap: 8px; }
    .agent { background: #10151f; border: 1px solid var(--border); border-radius: 9px; padding: 8px 10px; transition: opacity 0.2s; }
    .agent.prod { border-left: 4px solid #7ee787; }
    .agent.cons { border-left: 4px solid #ffab70; }
    .agent.blocked { opacity: 0.7; border-color: #ef535066; }
    .a-head { display: flex; justify-content: space-between; gap: 6px; font-size: 0.78rem; margin-bottom: 5px; }
    .a-name { font-weight: 800; }
    .a-state { color: var(--text-dim); font-size: 0.7rem; text-align: right; }
    .bar-track { height: 6px; background: #0b0f19; border-radius: 4px; overflow: hidden; }
    .bar { height: 100%; background: #58a6ff; }
    .agent.prod .bar { background: #7ee787; }
    .agent.cons .bar { background: #ffab70; }
    .bar.blockbar { background: repeating-linear-gradient(45deg, #3a2224, #3a2224 6px, #55282b 6px, #55282b 12px) !important; }

    .center { display: flex; flex-direction: column; gap: 10px; background: radial-gradient(ellipse at 50% 40%, #202a40 0%, #171e2e 80%); border: 1px solid var(--border); border-radius: 10px; padding: 14px; }
    .buffer { display: flex; gap: 6px; justify-content: center; }
    .slot { width: 44px; height: 44px; border: 2px dashed #39445f; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; background: #0b0f19; transition: border-color 0.2s; }
    .slot.full { border-style: solid; border-color: #7ee787; }
    .sems { display: flex; flex-direction: column; gap: 6px; }
    .sem { display: flex; align-items: center; gap: 8px; background: #10151f; border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; font-size: 0.78rem; min-height: 34px; flex-wrap: wrap; }
    .sem-name { font-family: Consolas, monospace; font-weight: 700; width: 52px; }
    .green-t { color: #7ee787; }
    .orange-t { color: #ffab70; }
    .dots { display: flex; gap: 3px; align-items: center; }
    .dot { width: 10px; height: 10px; border-radius: 50%; }
    .green-d { background: #7ee787; }
    .orange-d { background: #ffab70; }
    .zero { color: #ef9a9a; font-weight: 800; font-family: Consolas, monospace; }
    .mutex-holder { font-family: Consolas, monospace; font-size: 0.76rem; color: var(--text); }
    .waiters { margin-left: auto; color: #ef9a9a; font-size: 0.7rem; font-family: Consolas, monospace; }

    .dead { margin-top: 12px; background: rgba(239, 83, 80, 0.12); border: 1px solid #ef5350; border-radius: 10px; padding: 12px 14px; font-size: 0.9rem; line-height: 1.55; }

    .foot { margin-top: 12px; display: flex; gap: 12px; align-items: stretch; }
    .metrics { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }
    .metric { background: #10151f; border: 1px solid var(--border); border-radius: 8px; padding: 5px 12px; font-size: 0.76rem; color: var(--text-dim); }
    .metric strong { color: var(--text); font-family: Consolas, monospace; margin-left: 6px; }
    .status { flex: 1; background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; font-size: 0.85rem; line-height: 1.55; min-height: 46px; }
    .status.idle { color: var(--text-dim); font-style: italic; }

    @media (max-width: 720px) {
      .board { grid-template-columns: 1fr; }
      .foot { flex-direction: column; }
      .metrics { flex-direction: row; flex-wrap: wrap; }
    }
  `,
})
export class SemDetail implements OnDestroy {
  readonly cap = CAP;

  readonly running = signal(false);
  readonly wrongOrder = signal(false);
  readonly prodSpeed = signal(4);
  readonly consSpeed = signal(4);
  readonly vacios = signal(CAP);
  readonly llenos = signal(0);
  readonly buffer = signal<string[]>([]);
  readonly agents = signal<Agent[]>(this.freshAgents());
  readonly produced = signal(0);
  readonly consumed = signal(0);
  readonly blocks = signal(0);
  readonly events = signal<string[]>([]);
  readonly deadlocked = signal(false);

  readonly producers = computed(() => this.agents().filter((a) => a.kind === 'prod'));
  readonly consumers = computed(() => this.agents().filter((a) => a.kind === 'cons'));
  readonly lastEvents = computed(() => this.events().slice(-3));
  readonly slots = computed<(string | null)[]>(() => {
    const b = this.buffer();
    return Array.from({ length: CAP }, (_, i) => b[i] ?? null);
  });

  // colas de espera de cada semáforo (ids de agentes, FIFO)
  private waiting: Record<string, string[]> = { vacios: [], llenos: [], mutex: [] };
  private mutexFree = true;
  private mutexOwner: string | null = null;
  private rafId = 0;
  private lastTs = 0;
  private itemSeq = 0;

  private freshAgents(): Agent[] {
    const mk = (id: string, kind: Kind): Agent => ({
      id,
      kind,
      phase: 0,
      t: 0,
      dur: this.workDur(kind),
      blockedOn: null,
    });
    return [mk('P1', 'prod'), mk('P2', 'prod'), mk('C1', 'cons'), mk('C2', 'cons')];
  }

  mutexHolder(): string | null {
    return this.mutexOwner;
  }

  semWaiters(sem: string): string[] {
    // se lee desde el template; agents() lo re-evalúa en cada frame
    this.agents();
    return this.waiting[sem];
  }

  dots(n: number): unknown[] {
    return Array.from({ length: n });
  }

  stateLabel(a: Agent): string {
    if (a.blockedOn) return `⛔ esperando ${a.blockedOn}`;
    if (a.phase === 0) return a.kind === 'prod' ? '⚙ produciendo' : '😋 consumiendo';
    if (a.phase === 3) return a.kind === 'prod' ? '📥 push al buffer' : '📤 pop del buffer';
    return '…';
  }

  setProdSpeed(ev: Event): void {
    this.prodSpeed.set(+(ev.target as HTMLInputElement).value);
  }
  setConsSpeed(ev: Event): void {
    this.consSpeed.set(+(ev.target as HTMLInputElement).value);
  }

  toggleOrder(): void {
    this.wrongOrder.update((v) => !v);
    this.logEv(
      this.wrongOrder()
        ? '💀 Orden incorrecto activado: ahora los consumidores hacen <code>mutex.acquire()</code> ANTES de <code>llenos.acquire()</code>. Cuando el buffer quede vacío…'
        : '✅ Orden correcto restaurado: semáforo primero, mutex después.',
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

  private workDur(kind: Kind): number {
    const s = kind === 'prod' ? this.prodSpeed() : this.consSpeed();
    // slider 1..10 → 2600..600 ms aprox, con jitter
    const base = 2800 - s * 220;
    return base + Math.random() * 500;
  }

  /** primer semáforo que espera cada tipo de agente, según el modo */
  private firstSem(a: Agent): 'vacios' | 'llenos' | 'mutex' {
    if (a.kind === 'prod') return 'vacios';
    return this.wrongOrder() ? 'mutex' : 'llenos';
  }
  private secondSem(a: Agent): 'llenos' | 'mutex' {
    if (a.kind === 'prod') return 'mutex';
    return this.wrongOrder() ? 'llenos' : 'mutex';
  }

  private tryAcquire(sem: string, a: Agent): boolean {
    if (sem === 'mutex') {
      if (this.mutexFree) {
        this.mutexFree = false;
        this.mutexOwner = a.id;
        return true;
      }
    } else {
      const sig = sem === 'vacios' ? this.vacios : this.llenos;
      if (sig() > 0) {
        sig.update((v) => v - 1);
        return true;
      }
    }
    this.waiting[sem].push(a.id);
    this.blocks.update((b) => b + 1);
    return false;
  }

  /** release: si hay alguien esperando, le pasa el permiso directo */
  private release(sem: string, agents: Agent[]): void {
    const next = this.waiting[sem].shift();
    if (next !== undefined) {
      const ag = agents.find((x) => x.id === next)!;
      ag.blockedOn = null;
      if (sem === 'mutex') this.mutexOwner = ag.id;
      this.advancePhase(ag, agents);
    } else if (sem === 'mutex') {
      this.mutexFree = true;
      this.mutexOwner = null;
    } else {
      (sem === 'vacios' ? this.vacios : this.llenos).update((v) => v + 1);
    }
  }

  /** el agente completó la fase actual; intenta pasar a la siguiente */
  private advancePhase(a: Agent, agents: Agent[]): void {
    if (a.phase === 0) {
      a.phase = 1;
      const sem = this.firstSem(a);
      if (this.tryAcquire(sem, a)) {
        this.advancePhase(a, agents);
      } else {
        a.blockedOn = sem;
        this.logEv(`${a.id} se bloquea en <code>${sem}.acquire()</code>${sem === 'mutex' ? ' 🔒' : ' (contador en 0)'}.`);
      }
    } else if (a.phase === 1) {
      a.phase = 2;
      const sem = this.secondSem(a);
      if (this.tryAcquire(sem, a)) {
        this.advancePhase(a, agents);
      } else {
        a.blockedOn = sem;
        const holding = a.kind === 'cons' && this.wrongOrder() ? ' — ¡CON el mutex tomado!' : '';
        this.logEv(`${a.id} se bloquea en <code>${sem}.acquire()</code>${holding}`);
      }
    } else if (a.phase === 2) {
      a.phase = 3;
      a.t = 0;
      a.dur = 380;
    } else {
      // fin del acceso al buffer
      if (a.kind === 'prod') {
        const item = ITEMS[this.itemSeq++ % ITEMS.length];
        this.buffer.update((b) => [...b, item]);
        this.produced.update((p) => p + 1);
        this.release('mutex', agents);
        this.release('llenos', agents);
        this.logEv(`${a.id} pushea ${item} → <code>mutex.release(); llenos.release()</code>.`);
      } else {
        let item = '';
        this.buffer.update((b) => {
          item = b[0];
          return b.slice(1);
        });
        this.consumed.update((c) => c + 1);
        this.release('mutex', agents);
        this.release('vacios', agents);
        this.logEv(`${a.id} saca ${item} → <code>mutex.release(); vacios.release()</code>.`);
      }
      a.phase = 0;
      a.t = 0;
      a.dur = this.workDur(a.kind);
    }
  }

  private readonly tick = (now: number): void => {
    if (!this.running()) return;
    const dt = Math.min(now - this.lastTs, 100);
    this.lastTs = now;

    const agents = this.agents().map((a) => ({ ...a }));
    for (const a of agents) {
      if (a.blockedOn !== null) continue;
      if (a.phase === 0 || a.phase === 3) {
        a.t += dt;
        if (a.t >= a.dur) this.advancePhase(a, agents);
      }
    }

    // deadlock: todos bloqueados
    const allBlocked = agents.every((a) => a.blockedOn !== null);
    if (allBlocked && !this.deadlocked()) {
      this.deadlocked.set(true);
      this.logEv('💀 <strong>Deadlock detectado</strong>: los 4 agentes están bloqueados y nadie puede liberar a nadie.');
    } else if (!allBlocked && this.deadlocked()) {
      this.deadlocked.set(false);
    }

    this.agents.set(agents);
    this.rafId = requestAnimationFrame(this.tick);
  };

  private logEv(html: string): void {
    this.events.update((e) => [...e.slice(-30), html]);
  }

  reset(): void {
    this.running.set(false);
    cancelAnimationFrame(this.rafId);
    this.vacios.set(CAP);
    this.llenos.set(0);
    this.buffer.set([]);
    this.agents.set(this.freshAgents());
    this.produced.set(0);
    this.consumed.set(0);
    this.blocks.set(0);
    this.events.set([]);
    this.deadlocked.set(false);
    this.waiting = { vacios: [], llenos: [], mutex: [] };
    this.mutexFree = true;
    this.mutexOwner = null;
    this.itemSeq = 0;
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.rafId);
  }
}
