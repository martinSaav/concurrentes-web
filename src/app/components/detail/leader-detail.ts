import { ChangeDetectionStrategy, Component, OnDestroy, computed, signal } from '@angular/core';

type LMode = 'ring' | 'bully';
type MsgType = 'ELECTION' | 'COORD' | 'OK';

interface DNode {
  id: number;
  alive: boolean;
}

interface Wire {
  from: number;
  to: number;
  t: number;
  dur: number;
  type: MsgType;
  label: string;
  payload?: { list?: number[]; starter?: number; leader?: number };
}

interface Timer {
  t: number;
  fn: () => void;
}

const N = 6;
const COLORS = ['#58a6ff', '#7ee787', '#ffd54f', '#ef5350', '#a78bfa', '#4dd0e1'];

/**
 * Elección de líder: anillo (Chang-Roberts, como ring.rs) vs bully (bully.rs).
 * Click en un nodo lo mata/revive. Matá al líder y mirá la elección correr;
 * comparó cuántos mensajes cuesta cada algoritmo.
 */
@Component({
  selector: 'app-leader-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="anim">
      <div class="head">
        <div class="titles">
          <div class="title">👑 Elección de líder: anillo vs bully</div>
          <div class="caption">
            Click en un nodo para matarlo o revivirlo. Matá al líder 👑 y arranca la elección.
          </div>
        </div>
        <div class="controls">
          <button class="ctl play" (click)="toggleRun()">{{ running() ? '⏸ Pausa' : '▶ Correr' }}</button>
          <div class="modes">
            <button class="mode" [class.on]="mode() === 'ring'" (click)="setMode('ring')">💍 anillo</button>
            <button class="mode" [class.on]="mode() === 'bully'" (click)="setMode('bully')">💪 bully</button>
          </div>
          <button class="ctl" (click)="reset()">↺ Reset</button>
        </div>
      </div>

      <div class="board">
        <div class="arena" [class.electing]="electing()">
          <svg viewBox="0 0 100 100">
            <!-- aristas del anillo -->
            @if (mode() === 'ring') {
              @for (n of nodes(); track n.id) {
                <line
                  [attr.x1]="nx(n.id)" [attr.y1]="ny(n.id)"
                  [attr.x2]="nx((n.id + 1) % count)" [attr.y2]="ny((n.id + 1) % count)"
                  class="edge"
                />
              }
            }

            <!-- mensajes en vuelo -->
            @for (w of wires(); track $index) {
              <g>
                <circle [attr.cx]="wx(w)" [attr.cy]="wy(w)" r="2.6" [attr.fill]="wireColor(w)" />
                <text [attr.x]="wx(w)" [attr.y]="wy(w) - 4" text-anchor="middle" font-size="3.2"
                      [attr.fill]="wireColor(w)">{{ w.label }}</text>
              </g>
            }

            <!-- nodos -->
            @for (n of nodes(); track n.id) {
              <g class="node" (click)="toggleNode(n.id)">
                <circle [attr.cx]="nx(n.id)" [attr.cy]="ny(n.id)" r="8"
                        [attr.fill]="n.alive ? '#1a2132' : '#2a1518'"
                        [attr.stroke]="n.alive ? colors[n.id] : '#5c3a3e'"
                        stroke-width="1.5" [attr.opacity]="n.alive ? 1 : 0.75" />
                <text [attr.x]="nx(n.id)" [attr.y]="ny(n.id) + 2" text-anchor="middle" font-size="5.4"
                      [attr.fill]="n.alive ? '#e6e9f0' : '#5c3a3e'" font-weight="800">
                  {{ n.alive ? n.id : '✖' }}
                </text>
                @if (leader() === n.id && n.alive) {
                  <text [attr.x]="nx(n.id)" [attr.y]="ny(n.id) - 10.5" text-anchor="middle" font-size="6">👑</text>
                }
              </g>
            }
          </svg>
          @if (electing()) {
            <div class="elec-banner">🗳 elección en curso · {{ msgCount() }} mensajes</div>
          }
          @if (allDead()) {
            <div class="elec-banner dead-b">💀 no queda nadie vivo</div>
          }
        </div>

        <div class="side">
          <div class="panel">
            <div class="p-title">líder actual</div>
            <div class="p-big">
              @if (leader() !== null && isAlive(leader()!)) {
                👑 nodo {{ leader() }}
              } @else {
                <span class="nolider">— sin líder —</span>
              }
            </div>
          </div>
          @if (mode() === 'ring' && ringList(); as rl) {
            <div class="panel hot">
              <div class="p-title">🗳 candidatos en el ELECTION</div>
              <div class="cand">[ {{ rl.join(' → ') }} ]</div>
              <div class="p-note">
                cada nodo vivo se agrega a la lista al reenviar; cuando la vuelta se cierra,
                el <strong>máximo</strong> es el nuevo líder.
              </div>
            </div>
          }
          <div class="panel">
            <div class="p-title">costo de la última elección</div>
            <div class="cmp">
              <span class="cmp-mode">💍 anillo</span>
              <span class="cmp-val">{{ lastRing() === null ? '—' : lastRing() + ' msgs' }}</span>
            </div>
            <div class="cmp">
              <span class="cmp-mode">💪 bully</span>
              <span class="cmp-val">{{ lastBully() === null ? '—' : lastBully() + ' msgs' }}</span>
            </div>
            <div class="p-note">
              anillo: O(n) siempre (2 vueltas). bully: mejor caso O(n), peor caso O(n²) —
              pero converge más rápido si arranca un nodo alto.
            </div>
          </div>
          <div class="panel">
            <div class="p-title">reglas del modo</div>
            <div class="p-note" [innerHTML]="modeRules()"></div>
          </div>
        </div>
      </div>

      <div class="status" [class.idle]="events().length === 0">
        @if (events().length === 0) {
          Presioná ▶ y matá al nodo 👑 {{ leader() }}. Un nodo detecta el silencio (timeout) e inicia la elección.
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
    .controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .ctl { background: var(--panel-2); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 7px 12px; cursor: pointer; font-size: 0.86rem; }
    .ctl:hover { background: #2d3750; }
    .ctl.play { background: #1f6feb; border-color: #1f6feb; color: #fff; font-weight: 700; min-width: 96px; }
    .modes { display: flex; background: var(--panel-2); border: 1px solid var(--border); border-radius: 8px; padding: 2px; gap: 2px; }
    .mode { background: transparent; border: none; color: var(--text-dim); border-radius: 6px; padding: 6px 10px; cursor: pointer; font-size: 0.8rem; font-weight: 600; }
    .mode.on { background: #1f6feb; color: #fff; }

    .board { display: flex; gap: 12px; align-items: stretch; }
    .arena { position: relative; flex: 1; min-height: 330px; background: radial-gradient(ellipse at 50% 45%, #202a40 0%, #171e2e 80%); border: 1px solid var(--border); border-radius: 10px; transition: border-color 0.3s; }
    .arena.electing { border-color: #ffd54f66; }
    .arena svg { position: absolute; inset: 0; width: 100%; height: 100%; }
    .edge { stroke: #39445f; stroke-width: 0.4; stroke-dasharray: 1.4 1.4; }
    .node { cursor: pointer; }
    .elec-banner { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); background: rgba(8, 12, 22, 0.95); border: 1.5px solid #ffd54f; color: #ffd54f; border-radius: 9px; padding: 4px 12px; font-size: 0.74rem; font-weight: 700; white-space: nowrap; }
    .elec-banner.dead-b { border-color: #ef5350; color: #ef9a9a; }

    .side { width: 250px; flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; }
    .panel { background: #10151f; border: 1px solid var(--border); border-radius: 10px; padding: 9px 12px; }
    .panel.hot { border-color: #ffd54f; }
    .cand { font-family: Consolas, monospace; font-weight: 800; font-size: 0.95rem; color: #ffd54f; margin-bottom: 4px; }
    .p-title { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 1px; color: #5c6a8e; font-weight: 700; margin-bottom: 5px; }
    .p-big { font-size: 1.05rem; font-weight: 800; color: #ffd54f; }
    .nolider { color: #ef9a9a; font-style: italic; font-size: 0.9rem; }
    .cmp { display: flex; justify-content: space-between; font-size: 0.8rem; padding: 3px 0; }
    .cmp-mode { color: var(--text-dim); }
    .cmp-val { font-family: Consolas, monospace; font-weight: 800; color: var(--text); }
    .p-note { font-size: 0.7rem; color: var(--text-dim); line-height: 1.5; margin-top: 4px; }
    .p-note strong { color: var(--text); }

    .status { margin-top: 12px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; min-height: 46px; font-size: 0.85rem; line-height: 1.55; }
    .status.idle { color: var(--text-dim); font-style: italic; }

    @media (max-width: 720px) {
      .board { flex-direction: column; }
      .side { width: 100%; }
    }
  `,
})
export class LeaderDetail implements OnDestroy {
  readonly count = N;
  readonly colors = COLORS;

  readonly running = signal(false);
  readonly mode = signal<LMode>('ring');
  readonly nodes = signal<DNode[]>(this.fresh());
  readonly wires = signal<Wire[]>([]);
  readonly leader = signal<number | null>(N - 1);
  readonly electing = signal(false);
  readonly msgCount = signal(0);
  readonly lastRing = signal<number | null>(null);
  readonly lastBully = signal<number | null>(null);
  /** lista de candidatos que va juntando el ELECTION (solo modo anillo) */
  readonly ringList = signal<number[] | null>(null);
  readonly events = signal<string[]>([]);

  readonly lastEvents = computed(() => this.events().slice(-3));
  readonly allDead = computed(() => this.nodes().every((n) => !n.alive));

  private timers: Timer[] = [];
  /** bully: nodos que ya arrancaron su elección en esta ronda */
  private inElection = new Set<number>();
  /** bully: nodos esperando OK (si no llega, se proclaman) */
  private awaitingOk = new Set<number>();
  private rafId = 0;
  private lastTs = 0;

  private fresh(): DNode[] {
    return Array.from({ length: N }, (_, id) => ({ id, alive: true }));
  }

  /* --- geometría --- */
  private angle(i: number): number {
    return (i * 2 * Math.PI) / N - Math.PI / 2;
  }
  nx(i: number): number {
    return 50 + 36 * Math.cos(this.angle(i));
  }
  ny(i: number): number {
    return 50 + 36 * Math.sin(this.angle(i));
  }
  wx(w: Wire): number {
    const p = Math.min(w.t / w.dur, 1);
    return this.nx(w.from) + (this.nx(w.to) - this.nx(w.from)) * p;
  }
  wy(w: Wire): number {
    const p = Math.min(w.t / w.dur, 1);
    return this.ny(w.from) + (this.ny(w.to) - this.ny(w.from)) * p;
  }
  wireColor(w: Wire): string {
    return w.type === 'ELECTION' ? '#ffd54f' : w.type === 'COORD' ? '#7ee787' : '#58a6ff';
  }

  isAlive(id: number): boolean {
    return this.nodes()[id].alive;
  }

  modeRules(): string {
    return this.mode() === 'ring'
      ? 'El mensaje ELECTION recorre el anillo <strong>juntando los ids vivos</strong>; al volver al iniciador, el máximo es el líder y una segunda vuelta (COORDINATOR) lo anuncia. Los nodos muertos se saltean.'
      : 'El iniciador manda ELECTION a todos los ids <strong>mayores</strong>. Si alguno responde OK, se baja (el grande "lo apura"). El que no recibe OK se proclama y manda COORDINATOR a todos. Un nodo que revive con id alto <strong>le roba el liderazgo</strong> al actual.';
  }

  setMode(m: LMode): void {
    if (this.mode() === m) return;
    this.mode.set(m);
    this.softReset();
    this.logEv(
      m === 'ring'
        ? '💍 Modo anillo (Chang-Roberts, como <code>ring.rs</code>): mensajes solo al vecino siguiente.'
        : '💪 Modo bully (como <code>bully.rs</code>): mensajes directos a los ids mayores.',
    );
  }

  toggleNode(id: number): void {
    const ns = this.nodes().map((n) => ({ ...n }));
    ns[id].alive = !ns[id].alive;
    this.nodes.set(ns);
    if (!ns[id].alive) {
      if (this.leader() === id) {
        this.logEv(`💀 Murió el nodo ${id}… ¡y era el LÍDER! En ~1s alguien nota el silencio (timeout de heartbeat).`);
        this.timers.push({
          t: 1200,
          fn: () => {
            const starter = this.lowestAlive();
            if (starter !== null) this.startElection(starter);
          },
        });
      } else {
        this.logEv(`💀 Murió el nodo ${id} (no era el líder: nadie se inmuta).`);
      }
    } else {
      this.logEv(`💚 El nodo ${id} revive.`);
      if (this.mode() === 'bully' && (this.leader() === null || id > this.leader()!)) {
        this.timers.push({
          t: 900,
          fn: () => {
            this.logEv(`💪 El nodo ${id} tiene id mayor que el líder actual: inicia una elección para "apurarlo".`);
            this.startElection(id);
          },
        });
      }
    }
    if (!this.running()) this.toggleRun();
  }

  private lowestAlive(): number | null {
    const alive = this.nodes().filter((n) => n.alive);
    return alive.length ? alive[0].id : null;
  }

  private aliveIds(): number[] {
    return this.nodes().filter((n) => n.alive).map((n) => n.id);
  }

  private nextAlive(after: number): number | null {
    for (let k = 1; k <= N; k++) {
      const cand = (after + k) % N;
      if (this.nodes()[cand].alive) return cand;
    }
    return null;
  }

  private send(from: number, to: number, type: MsgType, label: string, payload?: Wire['payload']): void {
    const dist = Math.hypot(this.nx(to) - this.nx(from), this.ny(to) - this.ny(from));
    this.wires.update((ws) => [...ws, { from, to, t: 0, dur: 260 + dist * 9, type, label, payload }]);
    this.msgCount.update((m) => m + 1);
  }

  private startElection(starter: number): void {
    if (this.mode() === 'ring') {
      if (this.electing()) return;
      this.electing.set(true);
      this.msgCount.set(0);
      this.ringList.set([starter]);
      const next = this.nextAlive(starter);
      if (next === null) return;
      this.logEv(`🗳 El nodo ${starter} inicia la elección: manda ELECTION[${starter}] a su vecino.`);
      if (next === starter) {
        // está solo
        this.finishElection(starter);
        return;
      }
      this.send(starter, next, 'ELECTION', `E[${starter}]`, { list: [starter], starter });
    } else {
      if (this.inElection.has(starter) || !this.isAlive(starter)) return;
      if (!this.electing()) {
        this.electing.set(true);
        this.msgCount.set(0);
      }
      this.inElection.add(starter);
      const higher = this.aliveIds().filter((id) => id > starter);
      if (higher.length === 0) {
        this.becomeLeader(starter);
        return;
      }
      this.logEv(`🗳 El nodo ${starter} manda ELECTION a los mayores: {${higher.join(', ')}}.`);
      this.awaitingOk.add(starter);
      for (const h of higher) this.send(starter, h, 'ELECTION', 'ELEC');
      this.timers.push({
        t: 2200,
        fn: () => {
          if (this.awaitingOk.has(starter) && this.isAlive(starter)) {
            this.awaitingOk.delete(starter);
            this.becomeLeader(starter);
          }
        },
      });
    }
  }

  private becomeLeader(id: number): void {
    this.leader.set(id);
    this.logEv(`👑 El nodo ${id} no recibió OK de nadie mayor: SE PROCLAMA líder y manda COORDINATOR a todos.`);
    for (const m of this.aliveIds()) {
      if (m !== id) this.send(id, m, 'COORD', 'COORD');
    }
    this.timers.push({ t: 1200, fn: () => this.finishBully() });
  }

  private finishBully(): void {
    if (!this.electing()) return;
    this.electing.set(false);
    this.inElection.clear();
    this.awaitingOk.clear();
    this.lastBully.set(this.msgCount());
    this.logEv(`✅ Elección bully terminada: <strong>${this.msgCount()} mensajes</strong>. Líder: nodo ${this.leader()}.`);
  }

  private finishElection(leaderId: number): void {
    this.leader.set(leaderId);
    this.electing.set(false);
    this.ringList.set(null);
    this.lastRing.set(this.msgCount());
    this.logEv(`✅ Elección en anillo terminada: <strong>${this.msgCount()} mensajes</strong>. Líder: nodo ${leaderId} 👑.`);
  }

  private deliver(w: Wire): void {
    const to = w.to;
    if (!this.isAlive(to)) {
      // el destino murió en vuelo: se re-rutea al siguiente vivo (anillo) o se pierde (bully)
      if (this.mode() === 'ring' && (w.type === 'ELECTION' || w.type === 'COORD')) {
        const next = this.nextAlive(to);
        if (next !== null && next !== w.from) this.send(w.from, next, w.type, w.label, w.payload);
      }
      return;
    }

    if (this.mode() === 'ring') {
      if (w.type === 'ELECTION') {
        const { list = [], starter = 0 } = w.payload ?? {};
        if (to === starter) {
          const max = Math.max(...list);
          this.logEv(`🔁 ELECTION dio la vuelta completa: el máximo de [${list.join(', ')}] es ${max}. Segunda vuelta: COORDINATOR.`);
          const next = this.nextAlive(to);
          if (next === null || next === to) {
            this.finishElection(max);
          } else {
            this.send(to, next, 'COORD', `C:${max}`, { leader: max, starter: to });
          }
        } else {
          const newList = [...list, to];
          this.ringList.set(newList);
          const next = this.nextAlive(to);
          if (next === null) return;
          this.send(to, next, 'ELECTION', `E[${newList.join(',')}]`, { list: newList, starter });
        }
      } else if (w.type === 'COORD') {
        const { leader = 0, starter = 0 } = w.payload ?? {};
        this.leader.set(leader);
        const next = this.nextAlive(to);
        if (next === null || next === starter) {
          this.finishElection(leader);
        } else {
          this.send(to, next, 'COORD', `C:${leader}`, w.payload);
        }
      }
    } else {
      // bully
      if (w.type === 'ELECTION') {
        this.send(to, w.from, 'OK', 'OK');
        this.startElection(to);
      } else if (w.type === 'OK') {
        if (this.awaitingOk.has(to)) {
          this.awaitingOk.delete(to);
          this.logEv(`🙇 El nodo ${to} recibió OK de ${w.from}: se baja de la elección (hay uno más grande).`);
        }
      } else if (w.type === 'COORD') {
        this.leader.set(w.from);
      }
    }
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

    // mensajes en vuelo
    const ws = this.wires().map((w) => ({ ...w, t: w.t + dt }));
    const arrived = ws.filter((w) => w.t >= w.dur);
    this.wires.set(ws.filter((w) => w.t < w.dur));
    for (const w of arrived) this.deliver(w);

    // timers
    const due: Timer[] = [];
    this.timers = this.timers.filter((tm) => {
      tm.t -= dt;
      if (tm.t <= 0) {
        due.push(tm);
        return false;
      }
      return true;
    });
    for (const tm of due) tm.fn();

    this.rafId = requestAnimationFrame(this.tick);
  };

  private logEv(html: string): void {
    this.events.update((e) => [...e.slice(-30), html]);
  }

  private softReset(): void {
    this.nodes.set(this.fresh());
    this.wires.set([]);
    this.leader.set(N - 1);
    this.electing.set(false);
    this.msgCount.set(0);
    this.ringList.set(null);
    this.timers = [];
    this.inElection.clear();
    this.awaitingOk.clear();
  }

  reset(): void {
    this.running.set(false);
    cancelAnimationFrame(this.rafId);
    this.softReset();
    this.lastRing.set(null);
    this.lastBully.set(null);
    this.events.set([]);
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.rafId);
  }
}
