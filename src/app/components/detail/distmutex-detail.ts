import { ChangeDetectionStrategy, Component, OnDestroy, computed, signal } from '@angular/core';

type DMode = 'central' | 'token';
type CState = 'idle' | 'want' | 'cs';

interface Peer {
  id: number;
  alive: boolean;
  state: CState;
  t: number;
  dur: number;
}

interface Wire {
  from: number;
  to: number;
  t: number;
  dur: number;
  type: 'REQ' | 'GRANT' | 'REL' | 'TOKEN';
}

const N = 5;
const COLORS = ['#f0883e', '#58a6ff', '#7ee787', '#ffd54f', '#a78bfa'];

/**
 * Exclusión mutua distribuida (centralizedmutex.rs / tokenring.rs):
 * coordinador con cola de pedidos vs token que circula. Matá al coordinador
 * (SPOF) o a un nodo con el token en camino (token perdido).
 */
@Component({
  selector: 'app-distmutex-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="anim">
      <div class="head">
        <div class="titles">
          <div class="title">🔐 Exclusión mutua distribuida: coordinador vs token ring</div>
          <div class="caption">
            Click en un nodo: le da ganas de entrar a la CS. Click largo mental: pensá qué pasa si se muere el que más importa.
          </div>
        </div>
        <div class="controls">
          <button class="ctl play" (click)="toggleRun()">{{ running() ? '⏸ Pausa' : '▶ Correr' }}</button>
          <div class="modes">
            <button class="mode" [class.on]="mode() === 'central'" (click)="setMode('central')">🎖 centralizado</button>
            <button class="mode" [class.on]="mode() === 'token'" (click)="setMode('token')">💍 token ring</button>
          </div>
          <button class="ctl" (click)="reset()">↺ Reset</button>
        </div>
      </div>

      <div class="board">
        <div class="arena">
          <svg viewBox="0 0 100 100">
            <!-- cableado -->
            @if (mode() === 'central') {
              @for (i of clientIds; track i) {
                <line [attr.x1]="cx(0)" [attr.y1]="cy(0)" [attr.x2]="cx(i)" [attr.y2]="cy(i)" class="edge" />
              }
            } @else {
              @for (p of peers(); track p.id) {
                <line [attr.x1]="cx(p.id)" [attr.y1]="cy(p.id)"
                      [attr.x2]="cx((p.id + 1) % count)" [attr.y2]="cy((p.id + 1) % count)" class="edge" />
              }
            }

            <!-- mensajes / token -->
            @for (w of wires(); track $index) {
              @if (w.type === 'TOKEN') {
                <g>
                  <circle [attr.cx]="wx(w)" [attr.cy]="wy(w)" r="3.2" fill="#ffd54f" stroke="#0d1117" stroke-width="0.7" />
                  <text [attr.x]="wx(w)" [attr.y]="wy(w) + 1.2" text-anchor="middle" font-size="3.2" fill="#0d1117" font-weight="800">T</text>
                </g>
              } @else {
                <g>
                  <circle [attr.cx]="wx(w)" [attr.cy]="wy(w)" r="2.4" [attr.fill]="wireColor(w)" />
                  <text [attr.x]="wx(w)" [attr.y]="wy(w) - 4" text-anchor="middle" font-size="3" [attr.fill]="wireColor(w)">
                    {{ w.type }}
                  </text>
                </g>
              }
            }

            <!-- nodos -->
            @for (p of peers(); track p.id) {
              <g class="node" (click)="clickNode(p.id)">
                <circle [attr.cx]="cx(p.id)" [attr.cy]="cy(p.id)" r="8.5"
                        [attr.fill]="nodeFill(p)"
                        [attr.stroke]="p.alive ? colors[p.id] : '#5c3a3e'" stroke-width="1.5" />
                <text [attr.x]="cx(p.id)" [attr.y]="cy(p.id) - 0.5" text-anchor="middle" font-size="4.6" fill="#e6e9f0" font-weight="800">
                  {{ nodeLabel(p) }}
                </text>
                <text [attr.x]="cx(p.id)" [attr.y]="cy(p.id) + 5" text-anchor="middle" font-size="3.4" fill="#9aa4bf">
                  {{ nodeSub(p) }}
                </text>
                @if (mode() === 'token' && tokenAt() === p.id) {
                  <g>
                    <circle [attr.cx]="cx(p.id)" [attr.cy]="cy(p.id) - 12" r="3.4"
                            fill="#ffd54f" stroke="#0d1117" stroke-width="0.7" />
                    <text [attr.x]="cx(p.id)" [attr.y]="cy(p.id) - 10.7" text-anchor="middle"
                          font-size="3.4" fill="#0d1117" font-weight="800">T</text>
                  </g>
                }
              </g>
            }
          </svg>

          @if (mode() === 'central' && !peers()[0].alive) {
            <div class="banner">💀 el coordinador es un <strong>single point of failure</strong>: nadie entra a la CS</div>
          }
          @if (mode() === 'token' && tokenLost()) {
            <div class="banner">
              🎫💀 <strong>token perdido</strong> (murió quien lo tenía) — sin token no hay CS
              <button class="regen" (click)="regenToken()">regenerar token</button>
            </div>
          }
        </div>

        <div class="side">
          <div class="panel">
            <div class="p-title">métricas</div>
            <div class="cmp"><span class="cmp-mode">accesos a la CS</span><span class="cmp-val">{{ csCount() }}</span></div>
            <div class="cmp"><span class="cmp-mode">mensajes totales</span><span class="cmp-val">{{ msgCount() }}</span></div>
            <div class="cmp"><span class="cmp-mode">msgs / acceso</span><span class="cmp-val">{{ msgsPerCs() }}</span></div>
            @if (mode() === 'token') {
              <div class="cmp"><span class="cmp-mode">hops del token en vano</span><span class="cmp-val">{{ idleHops() }}</span></div>
            }
            @if (mode() === 'central') {
              <div class="cmp"><span class="cmp-mode">cola del coordinador</span><span class="cmp-val">{{ queueView() }}</span></div>
            }
          </div>
          <div class="panel">
            <div class="p-title">comparación</div>
            <div class="p-note" [innerHTML]="modeNote()"></div>
          </div>
        </div>
      </div>

      <div class="status" [class.idle]="events().length === 0">
        @if (events().length === 0) {
          Presioná ▶ y clickeá nodos para que pidan la sección crítica.
          En centralizado, probá matar al 🎖. En token ring, matá al que tiene el 🎫.
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
    .arena { position: relative; flex: 1; min-height: 330px; background: radial-gradient(ellipse at 50% 45%, #202a40 0%, #171e2e 80%); border: 1px solid var(--border); border-radius: 10px; }
    .arena svg { position: absolute; inset: 0; width: 100%; height: 100%; }
    .edge { stroke: #39445f; stroke-width: 0.4; stroke-dasharray: 1.4 1.4; }
    .node { cursor: pointer; }
    .banner { position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); background: rgba(8, 12, 22, 0.95); border: 1.5px solid #ef5350; color: #ef9a9a; border-radius: 9px; padding: 5px 12px; font-size: 0.74rem; font-weight: 600; white-space: nowrap; display: flex; gap: 8px; align-items: center; }
    .banner strong { color: #ef9a9a; }
    .regen { background: #2ea043; border: none; color: #fff; border-radius: 6px; padding: 3px 9px; cursor: pointer; font-size: 0.68rem; font-weight: 700; }

    .side { width: 250px; flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; }
    .panel { background: #10151f; border: 1px solid var(--border); border-radius: 10px; padding: 9px 12px; }
    .p-title { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 1px; color: #5c6a8e; font-weight: 700; margin-bottom: 5px; }
    .cmp { display: flex; justify-content: space-between; font-size: 0.78rem; padding: 3px 0; gap: 8px; }
    .cmp-mode { color: var(--text-dim); }
    .cmp-val { font-family: Consolas, monospace; font-weight: 800; color: var(--text); }
    .p-note { font-size: 0.7rem; color: var(--text-dim); line-height: 1.55; }
    .p-note strong { color: var(--text); }

    .status { margin-top: 12px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; min-height: 46px; font-size: 0.85rem; line-height: 1.55; }
    .status.idle { color: var(--text-dim); font-style: italic; }

    @media (max-width: 720px) {
      .board { flex-direction: column; }
      .side { width: 100%; }
    }
  `,
})
export class DistmutexDetail implements OnDestroy {
  readonly count = N;
  readonly colors = COLORS;
  readonly clientIds = [1, 2, 3, 4];

  readonly running = signal(false);
  readonly mode = signal<DMode>('central');
  readonly peers = signal<Peer[]>(this.fresh());
  readonly wires = signal<Wire[]>([]);
  readonly tokenAt = signal<number | null>(null); // token en un nodo (modo token)
  readonly tokenLost = signal(false);
  readonly csCount = signal(0);
  readonly msgCount = signal(0);
  readonly idleHops = signal(0);
  readonly queue = signal<number[]>([]); // cola del coordinador
  readonly events = signal<string[]>([]);

  readonly lastEvents = computed(() => this.events().slice(-3));
  readonly msgsPerCs = computed(() =>
    this.csCount() === 0 ? '—' : (this.msgCount() / this.csCount()).toFixed(1),
  );
  readonly queueView = computed(() =>
    this.queue().length === 0 ? 'vacía' : this.queue().map((id) => 'N' + id).join(', '),
  );

  private holder: number | null = null; // quién tiene la CS otorgada (central)
  private rafId = 0;
  private lastTs = 0;
  private tokenPause = 0; // pausa del token en un nodo sin hambre

  private fresh(): Peer[] {
    return Array.from({ length: N }, (_, id) => ({
      id,
      alive: true,
      state: 'idle' as CState,
      t: 0,
      dur: 1500 + Math.random() * 3000,
    }));
  }

  /* --- geometría: modo central → 0 en el centro; token → todos en círculo --- */
  cx(i: number): number {
    if (this.mode() === 'central') {
      if (i === 0) return 50;
      const a = ((i - 1) * Math.PI) / 2 + Math.PI / 4;
      return 50 + 34 * Math.cos(a);
    }
    return 50 + 36 * Math.cos((i * 2 * Math.PI) / N - Math.PI / 2);
  }
  cy(i: number): number {
    if (this.mode() === 'central') {
      if (i === 0) return 47;
      const a = ((i - 1) * Math.PI) / 2 + Math.PI / 4;
      return 47 + 34 * Math.sin(a);
    }
    return 50 + 36 * Math.sin((i * 2 * Math.PI) / N - Math.PI / 2);
  }
  wx(w: Wire): number {
    const p = Math.min(w.t / w.dur, 1);
    return this.cx(w.from) + (this.cx(w.to) - this.cx(w.from)) * p;
  }
  wy(w: Wire): number {
    const p = Math.min(w.t / w.dur, 1);
    return this.cy(w.from) + (this.cy(w.to) - this.cy(w.from)) * p;
  }
  wireColor(w: Wire): string {
    return w.type === 'REQ' ? '#ffd54f' : w.type === 'GRANT' ? '#7ee787' : w.type === 'REL' ? '#58a6ff' : '#f0883e';
  }

  nodeFill(p: Peer): string {
    if (!p.alive) return '#2a1518';
    if (p.state === 'cs') return '#1b3a24';
    if (p.state === 'want') return '#3a2f1a';
    return '#1a2132';
  }
  nodeLabel(p: Peer): string {
    if (!p.alive) return '✖';
    if (this.mode() === 'central' && p.id === 0) return '🎖';
    return 'N' + p.id;
  }
  nodeSub(p: Peer): string {
    if (!p.alive) return '';
    if (this.mode() === 'central' && p.id === 0) return 'coord';
    if (p.state === 'cs') return 'CS!';
    if (p.state === 'want') return 'quiere';
    return '';
  }

  modeNote(): string {
    return this.mode() === 'central'
      ? '<strong>Centralizado</strong>: 3 mensajes por acceso (REQ, GRANT, REL) y cola justa. Simple y eficiente… pero el coordinador es cuello de botella y <strong>single point of failure</strong>.'
      : '<strong>Token ring</strong>: entra a la CS solo quien tiene el 🎫 — exclusión garantizada sin coordinador. Costo: el token circula <strong>aunque nadie quiera entrar</strong>, y si muere el portador, hay que detectar y regenerar el token (¡y que no queden dos!).';
  }

  setMode(m: DMode): void {
    if (this.mode() === m) return;
    this.mode.set(m);
    this.softReset();
    if (m === 'token') {
      this.tokenAt.set(0);
      this.logEv('💍 Token ring (como <code>tokenring.rs</code>): el 🎫 arranca en N0 y circula. Solo su portador puede entrar a la CS.');
    } else {
      this.logEv('🎖 Centralizado (como <code>centralizedmutex.rs</code>): N0 es el coordinador; los demás le piden permiso.');
    }
  }

  clickNode(id: number): void {
    const ps = this.peers().map((p) => ({ ...p }));
    const p = ps[id];
    if (this.mode() === 'central' && id === 0) {
      // matar/revivir coordinador
      p.alive = !p.alive;
      this.peers.set(ps);
      if (!p.alive) {
        this.logEv('💀 Murió el coordinador. Los REQ que lleguen se pierden; nadie recibe GRANT.');
      } else {
        this.holder = null;
        this.queue.set([]);
        this.logEv('💚 El coordinador vuelve (estado limpio). Los clientes con hambre reintentan su REQ.');
        for (const c of ps) {
          if (c.id !== 0 && c.alive && c.state === 'want') this.send(c.id, 0, 'REQ');
        }
      }
      if (!this.running()) this.toggleRun();
      return;
    }
    if (this.mode() === 'token' && p.alive && this.tokenAt() === id) {
      // matar al portador del token
      p.alive = !p.alive;
      this.peers.set(ps);
      this.tokenAt.set(null);
      this.tokenLost.set(true);
      this.logEv('💀 Murió N' + id + ' CON el token encima: 🎫 perdido. Sin token, NADIE puede entrar a la CS nunca más.');
      return;
    }
    if (!p.alive) {
      p.alive = true;
      this.peers.set(ps);
      this.logEv(`💚 N${id} revive.`);
      return;
    }
    if (p.state === 'idle') {
      p.t = p.dur; // fuerza el hambre en el próximo frame
      this.peers.set(ps);
      if (!this.running()) this.toggleRun();
    }
  }

  regenToken(): void {
    if (!this.tokenLost()) return;
    const first = this.peers().find((p) => p.alive);
    if (!first) return;
    this.tokenLost.set(false);
    this.tokenAt.set(first.id);
    this.logEv(
      `🎫 Token regenerado en N${first.id} (en la vida real: un algoritmo de elección decide QUIÉN lo regenera, y hay que garantizar que no aparezcan DOS tokens).`,
    );
  }

  private send(from: number, to: number, type: Wire['type']): void {
    const dist = Math.hypot(this.cx(to) - this.cx(from), this.cy(to) - this.cy(from));
    this.wires.update((ws) => [...ws, { from, to, t: 0, dur: 240 + dist * 9, type }]);
    this.msgCount.update((m) => m + 1);
  }

  private nextAlive(after: number): number | null {
    for (let k = 1; k <= N; k++) {
      const cand = (after + k) % N;
      if (this.peers()[cand].alive) return cand;
    }
    return null;
  }

  private deliver(w: Wire): void {
    const ps = this.peers().map((p) => ({ ...p }));
    if (w.type === 'REQ') {
      if (!ps[0].alive) return; // coordinador muerto: REQ perdido
      if (this.holder === null && this.queue().length === 0) {
        this.holder = w.from;
        this.send(0, w.from, 'GRANT');
      } else {
        this.queue.update((q) => [...q, w.from]);
        this.logEv(`🎖 CS ocupada por N${this.holder}: el coordinador encola a N${w.from}.`);
      }
    } else if (w.type === 'GRANT') {
      const p = ps[w.to];
      if (p.alive && p.state === 'want') {
        p.state = 'cs';
        p.t = 0;
        p.dur = 1400 + Math.random() * 600;
      }
    } else if (w.type === 'REL') {
      if (!ps[0].alive) return;
      this.holder = null;
      const q = [...this.queue()];
      const next = q.shift();
      this.queue.set(q);
      if (next !== undefined) {
        this.holder = next;
        this.send(0, next, 'GRANT');
      }
    } else if (w.type === 'TOKEN') {
      if (!ps[w.to].alive) {
        this.tokenAt.set(null);
        this.tokenLost.set(true);
        this.logEv(`💀 El token viajaba hacia N${w.to}… que está muerto. 🎫 perdido.`);
      } else {
        this.tokenAt.set(w.to);
        this.tokenPause = 0;
      }
    }
    this.peers.set(ps);
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

    const ps = this.peers().map((p) => ({ ...p }));

    for (const p of ps) {
      if (!p.alive) continue;
      const isCoord = this.mode() === 'central' && p.id === 0;
      if (isCoord) continue;
      if (p.state === 'idle') {
        p.t += dt;
        if (p.t >= p.dur) {
          p.state = 'want';
          if (this.mode() === 'central') this.send(p.id, 0, 'REQ');
        }
      } else if (p.state === 'cs') {
        p.t += dt;
        if (p.t >= p.dur) {
          p.state = 'idle';
          p.t = 0;
          p.dur = 1500 + Math.random() * 3000;
          this.csCount.update((c) => c + 1);
          if (this.mode() === 'central') {
            this.send(p.id, 0, 'REL');
          } else {
            // suelta el token y lo pasa
            const next = this.nextAlive(p.id);
            this.logEv(`✅ N${p.id} sale de la CS y pasa el 🎫 a N${next}.`);
            if (next !== null) {
              this.tokenAt.set(null);
              this.send(p.id, next, 'TOKEN');
            }
          }
        }
      }
    }

    // lógica del token estacionado
    if (this.mode() === 'token' && this.tokenAt() !== null && !this.tokenLost()) {
      const at = this.tokenAt()!;
      const p = ps[at];
      if (p.alive && p.state === 'want') {
        p.state = 'cs';
        p.t = 0;
        p.dur = 1400 + Math.random() * 600;
        this.logEv(`🎫 N${at} tenía hambre y le llegó el token: entra a la CS.`);
      } else if (p.alive && p.state !== 'cs') {
        this.tokenPause += dt;
        if (this.tokenPause >= 420) {
          const next = this.nextAlive(at);
          if (next !== null) {
            this.tokenAt.set(null);
            this.send(at, next, 'TOKEN');
            this.idleHops.update((h) => h + 1);
          }
        }
      }
    }

    this.peers.set(ps);

    // mensajes en vuelo
    const ws = this.wires().map((w) => ({ ...w, t: w.t + dt }));
    const arrived = ws.filter((w) => w.t >= w.dur);
    this.wires.set(ws.filter((w) => w.t < w.dur));
    for (const w of arrived) this.deliver(w);

    this.rafId = requestAnimationFrame(this.tick);
  };

  private logEv(html: string): void {
    this.events.update((e) => [...e.slice(-30), html]);
  }

  private softReset(): void {
    this.peers.set(this.fresh());
    this.wires.set([]);
    this.tokenAt.set(null);
    this.tokenLost.set(false);
    this.csCount.set(0);
    this.msgCount.set(0);
    this.idleHops.set(0);
    this.queue.set([]);
    this.holder = null;
    this.tokenPause = 0;
  }

  reset(): void {
    this.running.set(false);
    cancelAnimationFrame(this.rafId);
    this.softReset();
    if (this.mode() === 'token') this.tokenAt.set(0);
    this.events.set([]);
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.rafId);
  }
}
