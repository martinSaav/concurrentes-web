import { ChangeDetectionStrategy, Component, OnDestroy, computed, signal } from '@angular/core';

interface Edge {
  from: string;
  to: string;
}

interface Probe {
  path: string[]; // nodos por los que ya pasó
  idx: number; // tramo actual
  t: number; // 0..1 dentro del tramo
  origin: string;
}

const NODES = ['P1', 'R1', 'P2', 'R2', 'P3', 'R3', 'P4', 'R4'];

const PRESETS: Record<string, Edge[]> = {
  deadlock: [
    { from: 'R1', to: 'P1' },
    { from: 'P1', to: 'R2' },
    { from: 'R2', to: 'P2' },
    { from: 'P2', to: 'R1' },
  ],
  ok: [
    { from: 'R1', to: 'P1' },
    { from: 'P1', to: 'R2' },
    { from: 'R2', to: 'P2' },
    { from: 'R3', to: 'P3' },
  ],
  big: [
    { from: 'R1', to: 'P1' },
    { from: 'P1', to: 'R2' },
    { from: 'R2', to: 'P2' },
    { from: 'P2', to: 'R3' },
    { from: 'R3', to: 'P3' },
    { from: 'P3', to: 'R4' },
    { from: 'R4', to: 'P4' },
    { from: 'P4', to: 'R1' },
  ],
};

/**
 * Grafo de espera de recursos: P→R significa "el proceso espera ese recurso",
 * R→P significa "el recurso está asignado a ese proceso". Un CICLO = deadlock.
 * Incluye el edge chasing distribuido (probes que recorren la cadena).
 */
@Component({
  selector: 'app-waitgraph-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="anim">
      <div class="head">
        <div class="titles">
          <div class="title">🕸 Grafo de espera: buscar el ciclo</div>
          <div class="caption">
            Click en un <strong>proceso</strong> y luego en un <strong>recurso</strong> (o al revés) para crear o borrar una arista.
          </div>
        </div>
        <div class="controls">
          <button class="ctl" (click)="preset('deadlock')">💀 deadlock clásico</button>
          <button class="ctl" (click)="preset('ok')">✅ sin deadlock</button>
          <button class="ctl" (click)="preset('big')">🔄 ciclo de 4</button>
          <button class="ctl" (click)="clear()">↺ limpiar</button>
        </div>
      </div>

      <div class="board">
        <div class="arena" [class.dead]="cycle().length > 0">
          <svg viewBox="0 0 100 100">
            <defs>
              <marker id="warrow" markerWidth="6" markerHeight="6" refX="5.2" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 z" fill="#5c6a8e" />
              </marker>
              <marker id="wcyc" markerWidth="6" markerHeight="6" refX="5.2" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 z" fill="#ef5350" />
              </marker>
            </defs>

            <!-- aristas -->
            @for (e of edges(); track e.from + e.to) {
              <line
                [attr.x1]="ex(e, true)" [attr.y1]="ey(e, true)"
                [attr.x2]="ex(e, false)" [attr.y2]="ey(e, false)"
                class="edge" [class.incyc]="inCycle(e)" [class.wait]="isProc(e.from)"
                [attr.marker-end]="inCycle(e) ? 'url(#wcyc)' : 'url(#warrow)'"
              />
            }

            <!-- probe en vuelo -->
            @if (probe(); as p) {
              <circle [attr.cx]="probeX(p)" [attr.cy]="probeY(p)" r="2.4" fill="#ffd54f" />
              <text [attr.x]="probeX(p)" [attr.y]="probeY(p) - 3.4" text-anchor="middle"
                    font-size="3" fill="#ffd54f" font-weight="700">probe</text>
            }

            <!-- nodos -->
            @for (n of nodes; track n; let i = $index) {
              <g class="node" (click)="clickNode(n)">
                @if (isProc(n)) {
                  <circle [attr.cx]="nx(i)" [attr.cy]="ny(i)" r="6.5"
                          [attr.fill]="fill(n)" [attr.stroke]="stroke(n)" stroke-width="0.8" />
                } @else {
                  <rect [attr.x]="nx(i) - 5.6" [attr.y]="ny(i) - 5.6" width="11.2" height="11.2" rx="1.4"
                        [attr.fill]="fill(n)" [attr.stroke]="stroke(n)" stroke-width="0.8" />
                }
                <text [attr.x]="nx(i)" [attr.y]="ny(i) + 1.5" text-anchor="middle" class="nl">{{ n }}</text>
              </g>
            }
          </svg>
        </div>

        <div class="side">
          <div class="panel">
            <div class="p-title">leyenda</div>
            <div class="lg"><span class="k circle"></span> proceso</div>
            <div class="lg"><span class="k square"></span> recurso</div>
            <div class="lg"><span class="k line wait"></span> P→R: <em>espera</em> el recurso</div>
            <div class="lg"><span class="k line"></span> R→P: <em>asignado</em> al proceso</div>
          </div>

          <div class="panel">
            <div class="p-title">edge chasing (distribuido)</div>
            <div class="p-note">
              Nadie ve el grafo completo: cada nodo conoce solo sus aristas. Un proceso
              bloqueado manda un <strong>probe</strong> al que tiene el recurso, y este lo
              reenvía. <strong>Si el probe vuelve al que lo lanzó, hay ciclo.</strong>
            </div>
            <button class="ctl probe" (click)="launchProbe()" [disabled]="running() || blockedProcs().length === 0">
              🛰 lanzar probe
            </button>
          </div>

          <div class="panel">
            <div class="p-title">estado</div>
            <div class="cmp"><span>aristas</span><strong>{{ edges().length }}</strong></div>
            <div class="cmp"><span>procesos bloqueados</span><strong>{{ blockedProcs().length }}</strong></div>
            <div class="cmp">
              <span>deadlock</span>
              <strong [class.bad-t]="cycle().length > 0" [class.ok-t]="cycle().length === 0">
                {{ cycle().length > 0 ? 'SÍ' : 'no' }}
              </strong>
            </div>
          </div>
        </div>
      </div>

      @if (cycle().length > 0) {
        <div class="banner">💀 CICLO: {{ cycleLabel() }} — <strong>deadlock</strong></div>
      }

      <div class="status" [class.idle]="!msg()">
        @if (msg(); as m) {
          <span [innerHTML]="m"></span>
        } @else {
          Un <strong>ciclo</strong> en este grafo es exactamente la <strong>espera circular</strong> de
          Coffman: cada uno retiene algo que el siguiente necesita. Probá los presets, o armá tu propio grafo.
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
    .ctl { background: var(--panel-2); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 7px 12px; cursor: pointer; font-size: 0.82rem; }
    .ctl:hover:not(:disabled) { background: #2d3750; }
    .ctl:disabled { opacity: 0.4; cursor: default; }
    .ctl.probe { background: #1f6feb; border-color: #1f6feb; color: #fff; font-weight: 700; width: 100%; margin-top: 8px; }

    .board { display: flex; gap: 12px; align-items: stretch; }
    .arena { position: relative; flex: 1; min-height: 380px; background: radial-gradient(ellipse at 50% 45%, #202a40 0%, #171e2e 80%); border: 1px solid var(--border); border-radius: 10px; transition: border-color 0.3s; }
    .arena.dead { border-color: #ef5350; box-shadow: 0 0 18px rgba(239, 83, 80, 0.2); }
    .arena svg { position: absolute; inset: 0; width: 100%; height: 100%; }
    .node { cursor: pointer; }
    .nl { fill: #e6e9f0; font-size: 3.4px; font-weight: 800; font-family: Consolas, monospace; }
    .edge { stroke: #5c6a8e; stroke-width: 0.45; }
    .edge.wait { stroke-dasharray: 1.6 1.2; }
    .edge.incyc { stroke: #ef5350; stroke-width: 0.75; }
    .banner { margin-top: 12px; background: rgba(239, 83, 80, 0.1); border: 1px solid #ef5350; color: #ef9a9a; border-radius: 10px; padding: 9px 14px; font-size: 0.86rem; font-weight: 700; text-align: center; }

    .side { width: 236px; flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; }
    .panel { background: #10151f; border: 1px solid var(--border); border-radius: 10px; padding: 9px 12px; }
    .p-title { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 1px; color: #5c6a8e; font-weight: 700; margin-bottom: 6px; }
    .p-note { font-size: 0.7rem; color: var(--text-dim); line-height: 1.5; }
    .p-note strong { color: var(--text); }
    .lg { display: flex; align-items: center; gap: 8px; font-size: 0.72rem; color: var(--text-dim); margin-bottom: 4px; }
    .lg em { color: var(--text); font-style: normal; }
    .k { display: inline-block; flex-shrink: 0; }
    .k.circle { width: 12px; height: 12px; border-radius: 50%; border: 1.5px solid #58a6ff; background: #1a2132; }
    .k.square { width: 12px; height: 12px; border-radius: 2px; border: 1.5px solid #f0883e; background: #1a2132; }
    .k.line { width: 16px; height: 0; border-top: 2px solid #5c6a8e; }
    .k.line.wait { border-top-style: dashed; }
    .cmp { display: flex; justify-content: space-between; font-size: 0.76rem; color: var(--text-dim); padding: 2px 0; }
    .cmp strong { font-family: Consolas, monospace; color: var(--text); }
    .bad-t { color: #ef9a9a !important; }
    .ok-t { color: #7ee787 !important; }

    .status { margin-top: 12px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; min-height: 46px; font-size: 0.85rem; line-height: 1.55; }
    .status.idle { color: var(--text-dim); }

    @media (max-width: 720px) {
      .board { flex-direction: column; }
      .side { width: 100%; }
    }
  `,
})
export class WaitgraphDetail implements OnDestroy {
  readonly nodes = NODES;

  readonly edges = signal<Edge[]>(PRESETS['deadlock']);
  readonly selected = signal<string | null>(null);
  readonly msg = signal<string | null>(null);
  readonly probe = signal<Probe | null>(null);
  readonly running = signal(false);

  isProc(id: string): boolean {
    return id.startsWith('P');
  }

  /** procesos que están esperando algún recurso */
  readonly blockedProcs = computed(() =>
    this.nodes.filter((n) => this.isProc(n) && this.edges().some((e) => e.from === n)),
  );

  /** ciclo detectado (lista de nodos), vacío si no hay */
  readonly cycle = computed<string[]>(() => {
    const adj = new Map<string, string[]>();
    for (const e of this.edges()) {
      if (!adj.has(e.from)) adj.set(e.from, []);
      adj.get(e.from)!.push(e.to);
    }
    const state = new Map<string, number>(); // 0 = sin visitar, 1 = en curso, 2 = listo
    const stack: string[] = [];
    let found: string[] = [];

    const dfs = (u: string): boolean => {
      state.set(u, 1);
      stack.push(u);
      for (const v of adj.get(u) ?? []) {
        const st = state.get(v) ?? 0;
        if (st === 1) {
          // ciclo: desde v hasta el tope del stack
          const i = stack.indexOf(v);
          found = stack.slice(i);
          return true;
        }
        if (st === 0 && dfs(v)) return true;
      }
      stack.pop();
      state.set(u, 2);
      return false;
    };

    for (const n of this.nodes) {
      if ((state.get(n) ?? 0) === 0 && dfs(n)) break;
    }
    return found;
  });

  readonly cycleLabel = computed(() => {
    const c = this.cycle();
    return c.length ? [...c, c[0]].join(' → ') : '';
  });

  inCycle(e: Edge): boolean {
    const c = this.cycle();
    if (c.length === 0) return false;
    for (let i = 0; i < c.length; i++) {
      const a = c[i];
      const b = c[(i + 1) % c.length];
      if (e.from === a && e.to === b) return true;
    }
    return false;
  }

  /* --- geometría: los 8 nodos en círculo, alternando P y R --- */
  nx(i: number): number {
    return 50 + 34 * Math.cos((i * 2 * Math.PI) / NODES.length - Math.PI / 2);
  }
  ny(i: number): number {
    return 50 + 34 * Math.sin((i * 2 * Math.PI) / NODES.length - Math.PI / 2);
  }
  private pos(id: string): { x: number; y: number } {
    const i = NODES.indexOf(id);
    return { x: this.nx(i), y: this.ny(i) };
  }
  ex(e: Edge, start: boolean): number {
    const f = this.pos(e.from);
    const t = this.pos(e.to);
    const d = Math.hypot(t.x - f.x, t.y - f.y) || 1;
    const r = 7.6;
    return start ? f.x + ((t.x - f.x) / d) * r : t.x - ((t.x - f.x) / d) * r;
  }
  ey(e: Edge, start: boolean): number {
    const f = this.pos(e.from);
    const t = this.pos(e.to);
    const d = Math.hypot(t.x - f.x, t.y - f.y) || 1;
    const r = 7.6;
    return start ? f.y + ((t.y - f.y) / d) * r : t.y - ((t.y - f.y) / d) * r;
  }

  fill(n: string): string {
    if (this.selected() === n) return '#2a2a1a';
    if (this.cycle().includes(n)) return '#3a2224';
    return '#1a2132';
  }
  stroke(n: string): string {
    if (this.selected() === n) return '#ffd54f';
    if (this.cycle().includes(n)) return '#ef5350';
    return this.isProc(n) ? '#58a6ff' : '#f0883e';
  }

  clickNode(n: string): void {
    const sel = this.selected();
    if (sel === null) {
      this.selected.set(n);
      this.msg.set(
        `Seleccionaste <strong>${n}</strong>. Ahora clickeá ${this.isProc(n) ? 'un recurso (R) para decir que lo espera' : 'un proceso (P) para asignárselo'}.`,
      );
      return;
    }
    if (sel === n) {
      this.selected.set(null);
      this.msg.set(null);
      return;
    }
    if (this.isProc(sel) === this.isProc(n)) {
      // mismo tipo: cambio de selección
      this.selected.set(n);
      return;
    }
    // crear o borrar la arista sel → n
    const exists = this.edges().some((e) => e.from === sel && e.to === n);
    if (exists) {
      this.edges.update((es) => es.filter((e) => !(e.from === sel && e.to === n)));
      this.msg.set(`Borrada la arista ${sel} → ${n}.`);
    } else {
      this.edges.update((es) => [...es, { from: sel, to: n }]);
      this.msg.set(
        this.isProc(sel)
          ? `<strong>${sel} espera ${n}</strong>: se bloquea hasta que se libere.`
          : `<strong>${n} tiene ${sel}</strong>: el recurso le está asignado.`,
      );
    }
    this.selected.set(null);
    this.checkCycle();
  }

  private checkCycle(): void {
    const c = this.cycle();
    if (c.length > 0) {
      this.msg.set(
        `💀 <strong>Deadlock</strong>: hay un ciclo <code>${[...c, c[0]].join(' → ')}</code>. Cada uno retiene algo que el siguiente necesita — la <strong>espera circular</strong> de Coffman. Para romperlo hay que abortar a alguien (la "víctima") o quitarle el recurso.`,
      );
    }
  }

  preset(k: string): void {
    this.stopProbe();
    this.edges.set([...PRESETS[k]]);
    this.selected.set(null);
    const c = this.cycle();
    this.msg.set(
      c.length > 0
        ? `💀 Ciclo <code>${[...c, c[0]].join(' → ')}</code>: deadlock. Probá borrar una arista (click en sus dos nodos) para romperlo.`
        : '✅ Sin ciclos: no hay deadlock. Todos los procesos pueden eventualmente avanzar.',
    );
  }

  clear(): void {
    this.stopProbe();
    this.edges.set([]);
    this.selected.set(null);
    this.msg.set('Grafo vacío. Armá el tuyo: click en un proceso y después en un recurso.');
  }

  /* --- edge chasing --- */
  private rafId = 0;
  private lastTs = 0;

  launchProbe(): void {
    const origin = this.blockedProcs()[0];
    if (!origin) return;
    // el probe sigue la cadena de espera mientras pueda
    const path: string[] = [origin];
    let cur = origin;
    for (let k = 0; k < 12; k++) {
      const next = this.edges().find((e) => e.from === cur)?.to;
      if (!next) break;
      path.push(next);
      if (next === origin) break;
      cur = next;
    }
    if (path.length < 2) {
      this.msg.set(`El probe de ${origin} no tiene a quién seguir: no está esperando a nadie.`);
      return;
    }
    this.probe.set({ path, idx: 0, t: 0, origin });
    this.running.set(true);
    this.lastTs = performance.now();
    this.msg.set(`🛰 <strong>${origin}</strong> lanza un probe siguiendo su cadena de espera…`);
    this.rafId = requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number): void => {
    if (!this.running()) return;
    const dt = Math.min(now - this.lastTs, 100);
    this.lastTs = now;
    const p = this.probe();
    if (!p) return;
    const nt = p.t + dt / 700;
    if (nt >= 1) {
      const nextIdx = p.idx + 1;
      const arrived = p.path[nextIdx];
      if (nextIdx >= p.path.length - 1) {
        // fin del recorrido
        this.probe.set({ ...p, idx: nextIdx - 1, t: 1 });
        this.running.set(false);
        if (arrived === p.origin) {
          this.msg.set(
            `🛰💀 El probe <strong>volvió a ${p.origin}</strong>, que fue quien lo lanzó → hay un <strong>ciclo</strong>: deadlock confirmado. Así se detecta sin que nadie conozca el grafo completo.`,
          );
        } else {
          this.msg.set(
            `🛰✅ El probe llegó a <strong>${arrived}</strong> y ahí se corta la cadena (nadie más está esperando). <strong>No hay ciclo</strong> → no hay deadlock.`,
          );
        }
        setTimeout(() => this.probe.set(null), 1200);
        return;
      }
      this.probe.set({ ...p, idx: nextIdx, t: 0 });
    } else {
      this.probe.set({ ...p, t: nt });
    }
    this.rafId = requestAnimationFrame(this.tick);
  };

  probeX(p: Probe): number {
    const a = this.pos(p.path[p.idx]);
    const b = this.pos(p.path[Math.min(p.idx + 1, p.path.length - 1)]);
    return a.x + (b.x - a.x) * p.t;
  }
  probeY(p: Probe): number {
    const a = this.pos(p.path[p.idx]);
    const b = this.pos(p.path[Math.min(p.idx + 1, p.path.length - 1)]);
    return a.y + (b.y - a.y) * p.t;
  }

  private stopProbe(): void {
    this.running.set(false);
    cancelAnimationFrame(this.rafId);
    this.probe.set(null);
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.rafId);
  }
}
