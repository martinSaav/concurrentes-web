import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

interface RNet {
  id: string;
  name: string;
  desc: string;
  placeIds: string[];
  m0: number[];
  // transición: [consume por lugar, produce por lugar]
  trans: { id: string; in: number[]; out: number[]; x: number; y: number }[];
  places: { x: number; y: number }[];
  arcs: { from: number | string; to: number | string }[]; // índice de lugar o id de transición
}

/** Ejemplo 1 de la teórica: red cíclica, 5 marcados alcanzables, acotada */
const NET_EJ1: RNet = {
  id: 'ej1',
  name: 'Ejemplo 1 (acotada)',
  desc: 'La red cíclica de la teórica: 5 lugares, 5 transiciones. Su grafo de alcance tiene exactamente 5 marcados y siempre se puede volver a M0 (viva y reversible).',
  placeIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
  m0: [1, 0, 0, 0, 0],
  trans: [
    { id: 't1', in: [1, 0, 0, 0, 0], out: [0, 1, 1, 0, 0], x: 50, y: 26 },
    { id: 't2', in: [0, 1, 0, 0, 0], out: [0, 0, 0, 1, 0], x: 28, y: 58 },
    { id: 't3', in: [0, 0, 1, 0, 0], out: [0, 0, 0, 0, 1], x: 72, y: 58 },
    { id: 't4', in: [0, 0, 0, 1, 0], out: [0, 1, 0, 0, 0], x: 10, y: 42 },
    { id: 't5', in: [0, 0, 0, 1, 1], out: [1, 0, 0, 0, 0], x: 50, y: 90 },
  ],
  places: [
    { x: 50, y: 8 },
    { x: 28, y: 42 },
    { x: 72, y: 42 },
    { x: 28, y: 74 },
    { x: 72, y: 74 },
  ],
  arcs: [
    { from: 0, to: 't1' }, { from: 't1', to: 1 }, { from: 't1', to: 2 },
    { from: 1, to: 't2' }, { from: 't2', to: 3 },
    { from: 2, to: 't3' }, { from: 't3', to: 4 },
    { from: 3, to: 't4' }, { from: 't4', to: 1 },
    { from: 3, to: 't5' }, { from: 4, to: 't5' }, { from: 't5', to: 0 },
  ],
};

/** Ejemplo 2 de la teórica: p2 crece sin límite → red NO acotada */
const NET_EJ2: RNet = {
  id: 'ej2',
  name: 'Ejemplo 2 (NO acotada)',
  desc: 'El Ejemplo 2 de la teórica: t1 devuelve el token a p1 Y agrega uno a p2 — p2 puede crecer sin límite. Su grafo de alcance es INFINITO: la red no es acotada.',
  placeIds: ['p1', 'p2', 'p3'],
  m0: [1, 0, 0],
  trans: [
    { id: 't1', in: [1, 0, 0], out: [1, 1, 0], x: 30, y: 22 },
    { id: 't2', in: [1, 0, 0], out: [0, 0, 1], x: 30, y: 62 },
    { id: 't3', in: [0, 0, 1], out: [1, 0, 0], x: 70, y: 82 },
    { id: 't4', in: [0, 1, 1], out: [0, 0, 1], x: 70, y: 42 },
  ],
  places: [
    { x: 12, y: 42 },
    { x: 60, y: 12 },
    { x: 60, y: 62 },
  ],
  arcs: [
    { from: 0, to: 't1' }, { from: 't1', to: 0 }, { from: 't1', to: 1 },
    { from: 0, to: 't2' }, { from: 't2', to: 2 },
    { from: 2, to: 't3' }, { from: 't3', to: 0 },
    { from: 1, to: 't4' }, { from: 2, to: 't4' }, { from: 't4', to: 2 },
  ],
};

const RNETS = [NET_EJ1, NET_EJ2];
const MAX_NODES = 14;
const UNBOUND_LIMIT = 6; // si un lugar pasa este valor, declaramos no acotada

interface GNode {
  key: string;
  marking: number[];
  depth: number;
  x: number;
  y: number;
}

interface GEdge {
  from: string;
  to: string;
  label: string;
}

/**
 * Grafo de alcance: disparás transiciones en la red (izquierda) y el grafo
 * de marcados alcanzables se construye a la derecha. El botón BFS explora
 * todo y verifica propiedades: acotación, deadlocks, reversibilidad.
 */
@Component({
  selector: 'app-reach-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="anim">
      <div class="head">
        <div class="titles">
          <div class="title">🗺 Grafo de alcance: verificar SIN ejecutar</div>
          <div class="caption">
            Cada nodo es un marcado; cada arista, un disparo. Disparar acá es moverse en el grafo.
          </div>
        </div>
        <div class="controls">
          <button class="ctl bfs" (click)="explore()">🔍 explorar todo (BFS)</button>
          <button class="ctl" (click)="reset()">↺ Reset</button>
        </div>
      </div>

      <div class="nets">
        @for (n of nets; track n.id) {
          <button class="netbtn" [class.on]="netId() === n.id" (click)="selectNet(n.id)">{{ n.name }}</button>
        }
      </div>
      <div class="netdesc">{{ net().desc }}</div>

      <div class="board">
        <!-- red -->
        <div class="arena">
          <div class="a-label">la red · marcado ({{ curKey() }})</div>
          <svg viewBox="0 0 100 100">
            <defs>
              <marker id="rarrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 z" fill="#5c6a8e" />
              </marker>
            </defs>
            @for (a of net().arcs; track $index) {
              <line [attr.x1]="ax(a, true)" [attr.y1]="ay(a, true)"
                    [attr.x2]="ax(a, false)" [attr.y2]="ay(a, false)"
                    class="arc" marker-end="url(#rarrow)" />
            }
            @for (p of net().places; track $index; let i = $index) {
              <g>
                <circle [attr.cx]="p.x" [attr.cy]="p.y" r="5.6" fill="#1a2132"
                        [attr.stroke]="marking()[i] > 0 ? '#e8b4b8' : '#39445f'" stroke-width="0.8" />
                @if (marking()[i] > 0) {
                  <text [attr.x]="p.x" [attr.y]="p.y + 1.7" text-anchor="middle" font-size="4.4"
                        fill="#e8b4b8" font-weight="800">{{ marking()[i] }}</text>
                }
                <text [attr.x]="p.x" [attr.y]="p.y - 7.6" text-anchor="middle" font-size="3.2" fill="#9aa4bf">
                  {{ net().placeIds[i] }}
                </text>
              </g>
            }
            @for (t of net().trans; track t.id) {
              <g class="tr" (click)="fire(t.id)">
                <rect [attr.x]="t.x - 1.5" [attr.y]="t.y - 4.6" width="3" height="9.2" rx="0.6"
                      [attr.fill]="enabled().includes(t.id) ? '#2ea043' : '#39445f'"
                      [attr.stroke]="enabled().includes(t.id) ? '#7ee787' : 'none'" stroke-width="0.6" />
                <text [attr.x]="t.x" [attr.y]="t.y + 8.4" text-anchor="middle" font-size="3.2"
                      [attr.fill]="enabled().includes(t.id) ? '#7ee787' : '#5c6a8e'">{{ t.id }}</text>
              </g>
            }
          </svg>
        </div>

        <!-- grafo de alcance -->
        <div class="arena reach">
          <div class="a-label">grafo de alcance · {{ nodes().length }} marcado{{ nodes().length === 1 ? '' : 's' }}</div>
          <svg viewBox="0 0 100 100">
            <defs>
              <marker id="garrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 z" fill="#8b95b5" />
              </marker>
            </defs>
            @for (e of edges(); track $index) {
              <g>
                <line [attr.x1]="ex(e, true)" [attr.y1]="ey(e, true)"
                      [attr.x2]="ex(e, false)" [attr.y2]="ey(e, false)"
                      class="gedge" marker-end="url(#garrow)" />
                <text [attr.x]="(ex(e, true) + ex(e, false)) / 2 + 1.2"
                      [attr.y]="(ey(e, true) + ey(e, false)) / 2 - 1"
                      font-size="2.9" fill="#ffd54f">{{ e.label }}</text>
              </g>
            }
            @for (n of nodes(); track n.key) {
              <g>
                <rect [attr.x]="n.x - 10" [attr.y]="n.y - 3.6" width="20" height="7.2" rx="2"
                      [attr.fill]="n.key === curKey() ? '#2a2a1a' : '#10151f'"
                      [attr.stroke]="n.key === curKey() ? '#ffd54f' : '#39445f'" stroke-width="0.7" />
                <text [attr.x]="n.x" [attr.y]="n.y + 1.4" text-anchor="middle" font-size="3.4"
                      [attr.fill]="n.key === curKey() ? '#ffd54f' : '#c8d0e4'" font-weight="700">
                  ({{ n.key }})
                </text>
              </g>
            }
            @if (truncated()) {
              <text x="50" y="97" text-anchor="middle" font-size="3.6" fill="#ef9a9a" font-weight="700">
                … y sigue creciendo (grafo infinito)
              </text>
            }
          </svg>
        </div>
      </div>

      @if (verdict(); as v) {
        <div class="verdict" [class.bad]="!v.bounded">
          <span [innerHTML]="v.html"></span>
        </div>
      }

      <div class="status" [class.idle]="statusMsg() === null">
        @if (statusMsg(); as m) {
          <span [innerHTML]="m"></span>
        } @else {
          Disparar transiciones dibuja el grafo de a un marcado. El BFS lo construye completo:
          así se verifica <strong>acotación</strong>, <strong>deadlocks</strong> (nodos sin salida)
          y <strong>reversibilidad</strong> sin correr el programa ni una vez.
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
    .ctl.bfs { background: #1f6feb; border-color: #1f6feb; color: #fff; font-weight: 700; }

    .nets { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
    .netbtn { background: var(--panel-2); border: 1px solid var(--border); color: var(--text-dim); border-radius: 8px; padding: 6px 12px; cursor: pointer; font-size: 0.8rem; font-weight: 600; }
    .netbtn.on { background: #1f6feb; border-color: #1f6feb; color: #fff; }
    .netdesc { color: var(--text-dim); font-size: 0.78rem; margin-bottom: 10px; line-height: 1.5; }

    .board { display: grid; grid-template-columns: 1fr 1.15fr; gap: 12px; }
    .arena { position: relative; min-height: 420px; background: radial-gradient(ellipse at 50% 45%, #202a40 0%, #171e2e 80%); border: 1px solid var(--border); border-radius: 10px; }
    .arena svg { position: absolute; inset: 0; width: 100%; height: 100%; }
    .a-label { position: absolute; top: 6px; left: 10px; z-index: 2; font-size: 0.66rem; text-transform: uppercase; letter-spacing: 1px; color: #5c6a8e; font-weight: 700; }
    .arc { stroke: #5c6a8e; stroke-width: 0.35; }
    .tr { cursor: pointer; }
    .gedge { stroke: #8b95b5; stroke-width: 0.35; }

    .verdict { margin-top: 12px; background: rgba(46, 160, 67, 0.1); border: 1px solid #2ea043; border-radius: 10px; padding: 10px 14px; font-size: 0.88rem; line-height: 1.55; }
    .verdict.bad { background: rgba(239, 83, 80, 0.1); border-color: #ef5350; }

    .status { margin-top: 12px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; min-height: 46px; font-size: 0.85rem; line-height: 1.55; }
    .status.idle { color: var(--text-dim); }

    @media (max-width: 720px) {
      .board { grid-template-columns: 1fr; }
    }
  `,
})
export class ReachDetail {
  readonly nets = RNETS;

  readonly netId = signal('ej1');
  readonly marking = signal<number[]>([...NET_EJ1.m0]);
  readonly nodes = signal<GNode[]>([]);
  readonly edges = signal<GEdge[]>([]);
  readonly truncated = signal(false);
  readonly statusMsg = signal<string | null>(null);
  readonly verdict = signal<{ bounded: boolean; html: string } | null>(null);

  readonly net = computed(() => RNETS.find((n) => n.id === this.netId())!);
  readonly curKey = computed(() => this.marking().join(','));

  readonly enabled = computed(() => {
    const m = this.marking();
    return this.net()
      .trans.filter((t) => t.in.every((need, i) => m[i] >= need))
      .map((t) => t.id);
  });

  constructor() {
    this.seedGraph();
  }

  private seedGraph(): void {
    const m0 = this.net().m0;
    this.nodes.set([{ key: m0.join(','), marking: [...m0], depth: 0, x: 50, y: 12 }]);
    this.edges.set([]);
    this.truncated.set(false);
  }

  selectNet(id: string): void {
    this.netId.set(id);
    this.reset();
  }

  reset(): void {
    this.marking.set([...this.net().m0]);
    this.seedGraph();
    this.statusMsg.set(null);
    this.verdict.set(null);
  }

  /* --- geometría de la red --- */
  private rNodePos(ref: number | string): { x: number; y: number; r: number } {
    if (typeof ref === 'number') {
      const p = this.net().places[ref];
      return { x: p.x, y: p.y, r: 6.2 };
    }
    const t = this.net().trans.find((x) => x.id === ref)!;
    return { x: t.x, y: t.y, r: 3.2 };
  }
  ax(a: { from: number | string; to: number | string }, start: boolean): number {
    const f = this.rNodePos(a.from);
    const t = this.rNodePos(a.to);
    const d = Math.hypot(t.x - f.x, t.y - f.y) || 1;
    return start ? f.x + ((t.x - f.x) / d) * f.r : t.x - ((t.x - f.x) / d) * t.r;
  }
  ay(a: { from: number | string; to: number | string }, start: boolean): number {
    const f = this.rNodePos(a.from);
    const t = this.rNodePos(a.to);
    const d = Math.hypot(t.x - f.x, t.y - f.y) || 1;
    return start ? f.y + ((t.y - f.y) / d) * f.r : t.y - ((t.y - f.y) / d) * t.r;
  }

  /* --- geometría del grafo --- */
  private gNode(key: string): GNode | undefined {
    return this.nodes().find((n) => n.key === key);
  }
  ex(e: GEdge, start: boolean): number {
    const f = this.gNode(e.from)!;
    const t = this.gNode(e.to)!;
    const d = Math.hypot(t.x - f.x, t.y - f.y) || 1;
    const r = 10.5;
    return start ? f.x + ((t.x - f.x) / d) * r : t.x - ((t.x - f.x) / d) * r;
  }
  ey(e: GEdge, start: boolean): number {
    const f = this.gNode(e.from)!;
    const t = this.gNode(e.to)!;
    const d = Math.hypot(t.x - f.x, t.y - f.y) || 1;
    const r = 5;
    return start ? f.y + ((t.y - f.y) / d) * r : t.y - ((t.y - f.y) / d) * r;
  }

  private addNode(marking: number[], depth: number): GNode {
    const key = marking.join(',');
    const existing = this.gNode(key);
    if (existing) return existing;
    const atDepth = this.nodes().filter((n) => n.depth === depth).length;
    const node: GNode = {
      key,
      marking: [...marking],
      depth,
      x: 18 + ((atDepth * 26 + depth * 9) % 70),
      y: Math.min(12 + depth * 15, 90),
    };
    this.nodes.update((ns) => [...ns, node]);
    return node;
  }

  private addEdge(from: string, to: string, label: string): void {
    if (this.edges().some((e) => e.from === from && e.to === to && e.label === label)) return;
    this.edges.update((es) => [...es, { from, to, label }]);
  }

  fire(tid: string): void {
    if (!this.enabled().includes(tid)) {
      this.statusMsg.set(`⛔ <strong>${tid}</strong> no está habilitada con el marcado actual (${this.curKey()}).`);
      return;
    }
    const t = this.net().trans.find((x) => x.id === tid)!;
    const from = this.curKey();
    const fromNode = this.gNode(from)!;
    const m = this.marking().map((v, i) => v - t.in[i] + t.out[i]);
    this.marking.set(m);
    const node = this.addNode(m, fromNode.depth + 1);
    this.addEdge(from, node.key, tid);
    this.statusMsg.set(
      `⚡ <strong>${tid}</strong>: (${from}) → (${node.key}). ${this.gNode(node.key) ? 'El grafo suma este marcado si es nuevo.' : ''}`,
    );
    if (m.some((v) => v > UNBOUND_LIMIT)) {
      this.truncated.set(true);
      this.verdict.set({
        bounded: false,
        html: '🚨 Un lugar superó los ' + UNBOUND_LIMIT + ' tokens y puede seguir creciendo: la red <strong>NO es acotada</strong> — su grafo de alcance es infinito.',
      });
    }
  }

  /** BFS completo del grafo de alcance (con corte por no-acotación) */
  explore(): void {
    this.reset();
    const net = this.net();
    const seen = new Map<string, number[]>();
    const queue: { m: number[]; depth: number }[] = [{ m: [...net.m0], depth: 0 }];
    seen.set(net.m0.join(','), net.m0);
    let unbounded = false;
    let deadlocks = 0;

    while (queue.length > 0) {
      if (seen.size > MAX_NODES) {
        unbounded = true;
        break;
      }
      const { m, depth } = queue.shift()!;
      const fromKey = m.join(',');
      let any = false;
      for (const t of net.trans) {
        if (!t.in.every((need, i) => m[i] >= need)) continue;
        any = true;
        const nm = m.map((v, i) => v - t.in[i] + t.out[i]);
        const key = nm.join(',');
        if (nm.some((v) => v > UNBOUND_LIMIT)) {
          unbounded = true;
          continue;
        }
        if (!seen.has(key)) {
          seen.set(key, nm);
          this.addNode(nm, depth + 1);
          queue.push({ m: nm, depth: depth + 1 });
        }
        this.addEdge(fromKey, key, t.id);
      }
      if (!any) deadlocks++;
    }

    this.truncated.set(unbounded);
    const n = this.nodes().length;
    if (unbounded) {
      this.verdict.set({
        bounded: false,
        html: `🚨 El BFS no termina: hay lugares que crecen sin límite → la red <strong>NO es acotada</strong> y su grafo de alcance es <strong>infinito</strong> (mostramos los primeros ${n}). En el prod-cons esto es un buffer que explota.`,
      });
    } else {
      this.verdict.set({
        bounded: true,
        html: `✅ Grafo completo: <strong>${n} marcados alcanzables</strong>, <strong>${deadlocks} deadlock${deadlocks === 1 ? '' : 's'}</strong> (nodos sin salida)${deadlocks === 0 ? ' — la red es viva' : ''}, acotada (ningún lugar supera ${UNBOUND_LIMIT} tokens). Esto es VERIFICAR: propiedades demostradas para TODAS las ejecuciones posibles.`,
      });
    }
    this.statusMsg.set(`🔍 BFS terminado: exploró ${n} marcados siguiendo todas las transiciones habilitadas.`);
  }
}
