import { ChangeDetectionStrategy, Component, OnDestroy, computed, signal } from '@angular/core';

type Mode = 'naive' | 'orden' | 'mozo';
type PState = 'think' | 'seat' | 'f1' | 'f2' | 'eat';

interface Phil {
  id: number;
  state: PState;
  t: number;
  dur: number;
  meals: number;
}

const N = 5;
const COLORS = ['#58a6ff', '#ef5350', '#7ee787', '#ffd54f', '#a78bfa'];

/**
 * Filósofos comensales: simulación con 3 estrategias (naïve → deadlock,
 * orden global de recursos, mozo con N-1 asientos) + panel de Coffman.
 * Fork i está entre el filósofo i y el i+1.
 */
@Component({
  selector: 'app-deadlock-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="anim">
      <div class="head">
        <div class="titles">
          <div class="title">🍝 Filósofos comensales: deadlock en vivo y cómo romperlo</div>
          <div class="caption">Click en un filósofo pensando para darle hambre YA.</div>
        </div>
        <div class="controls">
          <button class="ctl play" (click)="toggleRun()">{{ running() ? '⏸ Pausa' : '▶ Correr' }}</button>
          <button class="ctl hungry" (click)="allHungry()">🍽 todos con hambre</button>
          <button class="ctl" (click)="reset()">↺ Reset</button>
        </div>
      </div>

      <div class="modes">
        <button class="mode" [class.on]="mode() === 'naive'" (click)="setMode('naive')">
          😈 naïve: todos agarran el mismo lado
        </button>
        <button class="mode" [class.on]="mode() === 'orden'" (click)="setMode('orden')">
          🔢 orden global de recursos
        </button>
        <button class="mode" [class.on]="mode() === 'mozo'" (click)="setMode('mozo')">
          🤵 mozo: máx {{ n - 1 }} sentados
        </button>
      </div>

      <div class="board">
        <div class="table-wrap" [class.dead]="deadlocked()">
          <svg viewBox="0 0 100 100">
            <!-- mesa -->
            <circle cx="50" cy="50" r="20" fill="#232b3e" stroke="#39445f" stroke-width="0.8" />
            <text x="50" y="48" text-anchor="middle" font-size="5">🍝</text>
            @if (mode() === 'mozo') {
              <text x="50" y="56" text-anchor="middle" font-size="3.2" fill="#9aa4bf">
                asientos {{ seats() }}/{{ n - 1 }}
              </text>
            }

            <!-- flechas de espera (deadlock) -->
            @if (deadlocked()) {
              @for (p of phils(); track p.id) {
                <line
                  [attr.x1]="px(p.id)" [attr.y1]="py(p.id)"
                  [attr.x2]="fx(second(p.id))" [attr.y2]="fy(second(p.id))"
                  stroke="#ef5350" stroke-width="0.9" stroke-dasharray="2 1.4"
                  marker-end="url(#arrow)"
                />
              }
              <defs>
                <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 z" fill="#ef5350" />
                </marker>
              </defs>
            }

            <!-- tenedores -->
            @for (f of forkArr(); track $index; let i = $index) {
              <g>
                <circle
                  class="fork"
                  [attr.cx]="fcx(i)" [attr.cy]="fcy(i)" r="3.4"
                  [attr.fill]="f === null ? '#10151f' : colors[f]"
                  [attr.stroke]="f === null ? '#39445f' : '#fff'"
                  stroke-width="0.5"
                />
                <text class="fork" [attr.x]="fcx(i)" [attr.y]="fcy(i) + 1.4" text-anchor="middle" font-size="3.6">🍴</text>
              </g>
            }

            <!-- filósofos -->
            @for (p of phils(); track p.id) {
              <g class="phil" (click)="poke(p.id)">
                <circle
                  [attr.cx]="px(p.id)" [attr.cy]="py(p.id)" r="8"
                  [attr.fill]="philFill(p)"
                  [attr.stroke]="colors[p.id]"
                  stroke-width="1.4"
                />
                <text [attr.x]="px(p.id)" [attr.y]="py(p.id) + 1.6" text-anchor="middle" font-size="6">{{ philEmoji(p) }}</text>
                <text [attr.x]="px(p.id)" [attr.y]="py(p.id) - 10.5" text-anchor="middle" font-size="3.4" fill="#9aa4bf">
                  F{{ p.id }}
                </text>
              </g>
            }
          </svg>
          @if (deadlocked()) {
            <div class="dead-banner">
              💀 DEADLOCK: los 5 tienen un tenedor y esperan el otro — ciclo de espera perfecto
            </div>
          }
        </div>

        <div class="side">
          <!-- Coffman -->
          <div class="coffman">
            <div class="cf-title">Condiciones de Coffman</div>
            @for (c of coffman(); track $index) {
              <div class="cf-row" [class.broken]="c.broken" [class.hot]="deadlocked() && !c.broken">
                <span class="cf-mark">{{ c.broken ? '✂️' : deadlocked() ? '🔥' : '✓' }}</span>
                <span class="cf-name">{{ c.name }}</span>
              </div>
            }
            <div class="cf-note" [innerHTML]="modeNote()"></div>
          </div>

          <!-- métricas -->
          <div class="meals">
            <div class="cf-title">🍽 comidas</div>
            @for (p of phils(); track p.id) {
              <div class="meal-row">
                <span class="meal-name" [style.color]="colors[p.id]">F{{ p.id }}</span>
                <div class="meal-track">
                  <div class="meal-bar" [style.background]="colors[p.id]" [style.width.%]="mealPct(p)"></div>
                </div>
                <span class="meal-n">{{ p.meals }}</span>
              </div>
            }
            <div class="meal-total">deadlocks: <strong>{{ deadlocks() }}</strong></div>
          </div>
        </div>
      </div>

      <div class="status" [class.idle]="events().length === 0">
        @if (events().length === 0) {
          Presioná ▶ y después <strong>🍽 todos con hambre</strong> en modo naïve para ver el deadlock:
          los 5 agarran su primer tenedor a la vez.
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
    .controls { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .ctl { background: var(--panel-2); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 7px 12px; cursor: pointer; font-size: 0.86rem; }
    .ctl:hover { background: #2d3750; }
    .ctl.play { background: #1f6feb; border-color: #1f6feb; color: #fff; font-weight: 700; min-width: 96px; }
    .ctl.hungry { border-color: #f68c1f88; color: #ffab70; }

    .modes { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
    .mode { background: var(--panel-2); border: 1px solid var(--border); color: var(--text-dim); border-radius: 8px; padding: 7px 12px; cursor: pointer; font-size: 0.8rem; font-weight: 600; }
    .mode.on { background: #1f6feb; border-color: #1f6feb; color: #fff; }

    .board { display: flex; gap: 12px; align-items: stretch; }
    .table-wrap { position: relative; flex: 1; min-height: 340px; background: radial-gradient(ellipse at 50% 45%, #202a40 0%, #171e2e 80%); border: 1px solid var(--border); border-radius: 10px; transition: border-color 0.3s; }
    .table-wrap.dead { border-color: #ef5350; box-shadow: 0 0 20px rgba(239, 83, 80, 0.25); }
    .table-wrap svg { width: 100%; height: 100%; position: absolute; inset: 0; }
    .phil { cursor: pointer; }
    .fork { transition: cx 0.35s, cy 0.35s, x 0.35s, y 0.35s, fill 0.25s; }
    .dead-banner { position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); background: rgba(8, 12, 22, 0.95); border: 1.5px solid #ef5350; color: #ef9a9a; border-radius: 9px; padding: 6px 14px; font-size: 0.78rem; font-weight: 700; white-space: nowrap; }

    .side { width: 250px; flex-shrink: 0; display: flex; flex-direction: column; gap: 10px; }
    .coffman, .meals { background: #10151f; border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
    .cf-title { font-weight: 700; font-size: 0.82rem; margin-bottom: 8px; color: #ffd54f; }
    .cf-row { display: flex; gap: 8px; align-items: center; font-size: 0.78rem; padding: 4px 6px; border-radius: 6px; color: var(--text); }
    .cf-row.broken { color: #7ee787; }
    .cf-row.broken .cf-name { text-decoration: line-through; opacity: 0.8; }
    .cf-row.hot { background: rgba(239, 83, 80, 0.12); color: #ef9a9a; }
    .cf-mark { width: 20px; text-align: center; }
    .cf-note { margin-top: 8px; font-size: 0.72rem; color: var(--text-dim); line-height: 1.5; }
    .cf-note strong { color: var(--text); }

    .meal-row { display: grid; grid-template-columns: 26px 1fr 26px; gap: 8px; align-items: center; margin-bottom: 4px; }
    .meal-name { font-family: Consolas, monospace; font-weight: 800; font-size: 0.76rem; }
    .meal-track { height: 8px; background: #0b0f19; border: 1px solid var(--border); border-radius: 5px; overflow: hidden; }
    .meal-bar { height: 100%; transition: width 0.3s; }
    .meal-n { font-family: Consolas, monospace; font-size: 0.74rem; color: var(--text-dim); text-align: right; }
    .meal-total { margin-top: 6px; font-size: 0.76rem; color: var(--text-dim); }
    .meal-total strong { color: #ef9a9a; font-family: Consolas, monospace; }

    .status { margin-top: 12px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; min-height: 46px; font-size: 0.85rem; line-height: 1.55; }
    .status.idle { color: var(--text-dim); font-style: italic; }

    @media (max-width: 720px) {
      .board { flex-direction: column; }
      .side { width: 100%; }
    }
  `,
})
export class DeadlockDetail implements OnDestroy {
  readonly n = N;
  readonly colors = COLORS;

  readonly running = signal(false);
  readonly mode = signal<Mode>('naive');
  readonly phils = signal<Phil[]>(this.freshPhils());
  readonly forks = signal<(number | null)[]>(Array(N).fill(null)); // dueño de cada tenedor
  readonly seats = signal(0); // asientos ocupados (modo mozo)
  readonly deadlocked = signal(false);
  readonly deadlocks = signal(0);
  readonly events = signal<string[]>([]);

  readonly forkArr = computed(() => this.forks());
  readonly lastEvents = computed(() => this.events().slice(-3));

  readonly coffman = computed(() => {
    const m = this.mode();
    return [
      { name: 'Exclusión mutua', broken: false },
      { name: 'Hold and wait', broken: false },
      { name: 'Sin desalojo', broken: false },
      { name: 'Espera circular', broken: m !== 'naive' },
    ];
  });

  private rafId = 0;
  private lastTs = 0;

  private freshPhils(): Phil[] {
    return Array.from({ length: N }, (_, id) => ({
      id,
      state: 'think' as PState,
      t: 0,
      dur: 1000 + Math.random() * 2500,
      meals: 0,
    }));
  }

  /* --- geometría (viewBox 100×100) --- */
  private angleP(i: number): number {
    return (i * 2 * Math.PI) / N - Math.PI / 2;
  }
  px(i: number): number {
    return 50 + 36 * Math.cos(this.angleP(i));
  }
  py(i: number): number {
    return 50 + 36 * Math.sin(this.angleP(i));
  }
  /** posición base del tenedor i (entre filósofo i e i+1) */
  private angleF(i: number): number {
    return ((i + 0.5) * 2 * Math.PI) / N - Math.PI / 2;
  }
  fx(i: number): number {
    return 50 + 26 * Math.cos(this.angleF(i));
  }
  fy(i: number): number {
    return 50 + 26 * Math.sin(this.angleF(i));
  }
  /** posición actual: si tiene dueño, se corre hacia él */
  fcx(i: number): number {
    const owner = this.forks()[i];
    if (owner === null) return this.fx(i);
    return this.fx(i) + (this.px(owner) - this.fx(i)) * 0.42;
  }
  fcy(i: number): number {
    const owner = this.forks()[i];
    if (owner === null) return this.fy(i);
    return this.fy(i) + (this.py(owner) - this.fy(i)) * 0.42;
  }

  /* --- tenedores de cada filósofo: fork i (derecha) y fork i-1 (izquierda) --- */
  private forkA(id: number): number {
    return id; // el que agarra primero en modo naïve
  }
  private forkB(id: number): number {
    return (id + N - 1) % N;
  }
  /** primer y segundo tenedor según la estrategia */
  first(id: number): number {
    if (this.mode() === 'orden') return Math.min(this.forkA(id), this.forkB(id));
    return this.forkA(id);
  }
  second(id: number): number {
    if (this.mode() === 'orden') return Math.max(this.forkA(id), this.forkB(id));
    return this.forkB(id);
  }

  philEmoji(p: Phil): string {
    if (this.deadlocked()) return '💀';
    switch (p.state) {
      case 'think': return '🤔';
      case 'seat': return '🪑';
      case 'f1':
      case 'f2': return '🖐';
      case 'eat': return '😋';
    }
  }

  philFill(p: Phil): string {
    if (p.state === 'eat') return '#1b3a24';
    if (p.state === 'f1' || p.state === 'f2' || p.state === 'seat') return '#3a2224';
    return '#1a2132';
  }

  mealPct(p: Phil): number {
    const max = Math.max(1, ...this.phils().map((x) => x.meals));
    return (p.meals / max) * 100;
  }

  modeNote(): string {
    switch (this.mode()) {
      case 'naive':
        return 'Las 4 condiciones se cumplen → el deadlock es <strong>posible</strong> (no seguro: hace falta el timing exacto).';
      case 'orden':
        return 'Todos toman los tenedores en <strong>orden global creciente</strong> (F4 invierte su orden natural) → no puede cerrarse el ciclo. ✂️ espera circular.';
      case 'mozo':
        return 'Un semáforo con <strong>' + (N - 1) + ' permisos</strong>: nunca están los 5 sentados a la vez → siempre alguno consigue ambos tenedores. ✂️ espera circular.';
    }
  }

  setMode(m: Mode): void {
    if (this.mode() === m) return;
    this.mode.set(m);
    this.softReset();
    this.logEv(
      m === 'naive'
        ? '😈 Modo naïve: cada filósofo agarra primero SU tenedor derecho. Con el timing justo… 💀'
        : m === 'orden'
          ? '🔢 Orden global: los recursos se piden siempre en el mismo orden (jerarquía). Adiós ciclo.'
          : '🤵 Mozo: a lo sumo ' + (N - 1) + ' filósofos con hambre a la mesa (semáforo con N−1 permisos).',
    );
  }

  poke(id: number): void {
    const ps = this.phils().map((p) => ({ ...p }));
    const p = ps[id];
    if (p.state !== 'think') return;
    p.t = p.dur;
    this.phils.set(ps);
    if (!this.running()) this.toggleRun();
  }

  allHungry(): void {
    const ps = this.phils().map((p) => (p.state === 'think' ? { ...p, t: p.dur } : { ...p }));
    this.phils.set(ps);
    this.logEv('🍽 Todos con hambre a la vez: el escenario perfecto para el ciclo.');
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

    const ps = this.phils().map((p) => ({ ...p }));
    const fk = [...this.forks()];

    for (const p of ps) {
      switch (p.state) {
        case 'think':
          p.t += dt;
          if (p.t >= p.dur) {
            if (this.mode() === 'mozo') {
              p.state = 'seat';
            } else {
              p.state = 'f1';
            }
            p.t = 0;
          }
          break;
        case 'seat':
          if (this.seats() < N - 1) {
            this.seats.update((s) => s + 1);
            p.state = 'f1';
          }
          break;
        case 'f1': {
          const f = this.first(p.id);
          if (fk[f] === null) {
            fk[f] = p.id;
            p.state = 'f2';
            this.logEv(`F${p.id} agarra el tenedor ${f} y va por el ${this.second(p.id)}.`);
          }
          break;
        }
        case 'f2': {
          const f = this.second(p.id);
          if (fk[f] === null) {
            fk[f] = p.id;
            p.state = 'eat';
            p.t = 0;
            p.dur = 1300 + Math.random() * 900;
          }
          break;
        }
        case 'eat':
          p.t += dt;
          if (p.t >= p.dur) {
            fk[this.first(p.id)] = null;
            fk[this.second(p.id)] = null;
            if (this.mode() === 'mozo') this.seats.update((s) => Math.max(0, s - 1));
            p.meals++;
            p.state = 'think';
            p.t = 0;
            p.dur = 1000 + Math.random() * 2500;
            this.logEv(`F${p.id} termina de comer (${p.meals}) y suelta los dos tenedores.`);
          }
          break;
      }
    }

    // deadlock: los 5 en f2 (cada uno con un tenedor, esperando el del vecino)
    const dead = ps.every((p) => p.state === 'f2') && fk.every((o) => o !== null);
    if (dead && !this.deadlocked()) {
      this.deadlocked.set(true);
      this.deadlocks.update((d) => d + 1);
      this.logEv(
        '💀 <strong>DEADLOCK</strong>: F0→espera el tenedor de F1→espera el de F2→…→espera el de F0. ' +
          'Ciclo cerrado, nadie suelta nada (hold and wait + sin desalojo). Cambiá de estrategia o ↺ Reset.',
      );
    } else if (!dead && this.deadlocked()) {
      this.deadlocked.set(false);
    }

    this.phils.set(ps);
    this.forks.set(fk);
    this.rafId = requestAnimationFrame(this.tick);
  };

  private logEv(html: string): void {
    this.events.update((e) => [...e.slice(-30), html]);
  }

  private softReset(): void {
    this.phils.set(this.freshPhils());
    this.forks.set(Array(N).fill(null));
    this.seats.set(0);
    this.deadlocked.set(false);
  }

  reset(): void {
    this.running.set(false);
    cancelAnimationFrame(this.rafId);
    this.softReset();
    this.deadlocks.set(0);
    this.events.set([]);
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.rafId);
  }
}
