import { ChangeDetectionStrategy, Component, OnInit, computed, input, signal } from '@angular/core';

interface RNet {
  id: string;
  name: string;
  desc: string;
  placeIds: string[];
  m0: number[];
  // transición: [consume por lugar, produce por lugar, lugares que inhiben (deben estar vacíos)]
  trans: { id: string; in: number[]; out: number[]; inh?: number[]; x: number; y: number }[];
  places: { x: number; y: number }[];
  arcs: RArc[];
  /** grafo profundo: va debajo de la red, a todo el ancho */
  stack?: boolean;
}

interface RArc {
  from: number | string; // índice de lugar o id de transición
  to: number | string;
  w?: number;
  inhib?: boolean;
}

/** Ejemplo 1 de la teórica: red cíclica, 5 marcados alcanzables, acotada */
const NET_EJ1: RNet = {
  id: 'ej1',
  name: 'Ejemplo 1 (acotada)',
  desc: 'La red cíclica de la teórica: 5 lugares, 5 transiciones. Su grafo de alcance tiene exactamente 5 marcados y siempre se puede volver a M0 (viva y reversible).',
  placeIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
  m0: [1, 0, 0, 0, 0],
  trans: [
    { id: 't1', in: [1, 0, 0, 0, 0], out: [0, 1, 1, 0, 0], x: 50, y: 28 },
    { id: 't2', in: [0, 1, 0, 0, 0], out: [0, 0, 0, 1, 0], x: 28, y: 58 },
    { id: 't3', in: [0, 0, 1, 0, 0], out: [0, 0, 0, 0, 1], x: 72, y: 58 },
    { id: 't4', in: [0, 0, 0, 1, 0], out: [0, 1, 0, 0, 0], x: 10, y: 52 },
    { id: 't5', in: [0, 0, 0, 1, 1], out: [1, 0, 0, 0, 0], x: 50, y: 90 },
  ],
  places: [
    { x: 50, y: 14 },
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

/** final 3/2/2026: estación de carga. Marcado (esp, lib, carg, cupo, fin) */
const NET_CARGA: RNet = {
  id: 'carga',
  name: 'Estación de carga (final)',
  desc: 'Lugares: esp = vehículos esperando, lib = surtidores libres, carg = cargando, cupo = cargas que quedan antes del mantenimiento, fin = cargas finalizadas. t1 = iniciar carga, t2 = finalizar carga, t3 = mantenimiento (peso 4 desde fin, inhibida por carg).',
  placeIds: ['esp', 'lib', 'carg', 'cupo', 'fin'],
  m0: [3, 2, 0, 4, 0],
  trans: [
    { id: 't1', in: [1, 1, 0, 1, 0], out: [0, 0, 1, 0, 0], x: 30, y: 52 },
    { id: 't2', in: [0, 0, 1, 0, 0], out: [1, 1, 0, 0, 1], x: 70, y: 52 },
    { id: 't3', in: [0, 0, 0, 0, 4], out: [0, 0, 0, 4, 0], inh: [2], x: 50, y: 88 },
  ],
  places: [
    { x: 50, y: 12 },
    { x: 50, y: 32 },
    { x: 50, y: 52 },
    { x: 14, y: 82 },
    { x: 86, y: 82 },
  ],
  arcs: [
    { from: 0, to: 't1' }, { from: 1, to: 't1' }, { from: 3, to: 't1' }, { from: 't1', to: 2 },
    { from: 2, to: 't2' }, { from: 't2', to: 0 }, { from: 't2', to: 1 }, { from: 't2', to: 4 },
    { from: 4, to: 't3', w: 4 }, { from: 't3', to: 3, w: 4 }, { from: 2, to: 't3', inhib: true },
  ],
  stack: true,
};

const RNETS = [NET_EJ1, NET_EJ2, NET_CARGA];
const MAX_NODES = 14;

/** habilitada: alcanzan los tokens de cada entrada y los lugares inhibidores están vacíos */
function isEnabled(t: RNet['trans'][number], m: number[]): boolean {
  return t.in.every((need, i) => m[i] >= need) && (t.inh ?? []).every((i) => m[i] === 0);
}
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

      <div class="board" [class.stack]="net().stack">
        <!-- red -->
        <div class="arena">
          <div class="a-label">la red · marcado ({{ curKey() }})</div>
          <svg viewBox="0 0 100 100">
            <defs>
              <marker id="rarrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 z" fill="#5c6a8e" />
              </marker>
              <marker id="rinhib" markerWidth="8" markerHeight="8" refX="6.4" refY="3.2" orient="auto">
                <circle cx="3.2" cy="3.2" r="2.4" fill="#171e2e" stroke="#ef9a9a" stroke-width="1" />
              </marker>
            </defs>
            @for (a of net().arcs; track $index) {
              <line [attr.x1]="ax(a, true)" [attr.y1]="ay(a, true)"
                    [attr.x2]="ax(a, false)" [attr.y2]="ay(a, false)"
                    class="arc" [class.inh]="a.inhib"
                    [attr.marker-end]="a.inhib ? 'url(#rinhib)' : 'url(#rarrow)'" />
              @if (a.w && a.w > 1) {
                <text [attr.x]="(ax(a, true) + ax(a, false)) / 2" [attr.y]="(ay(a, true) + ay(a, false)) / 2 - 1.4"
                      font-size="3.6" fill="#ffd54f" font-weight="800" text-anchor="middle">{{ a.w }}</text>
              }
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
                <text [attr.x]="t.x + 3" [attr.y]="t.y + 1.2" text-anchor="start" font-size="3.2"
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
                <path [attr.d]="edgeGeom(e).d" class="gedge" [class.back]="edgeGeom(e).back"
                      marker-end="url(#garrow)" />
                <text [attr.x]="edgeGeom(e).lx" [attr.y]="edgeGeom(e).ly"
                      font-size="2.8" fill="#ffd54f">{{ e.label }}</text>
              </g>
            }
            @for (n of nodes(); track n.key) {
              <g>
                <rect [attr.x]="pos(n.key).x - boxW() / 2" [attr.y]="pos(n.key).y - 3.4"
                      [attr.width]="boxW()" height="6.8" rx="2"
                      [attr.fill]="n.key === curKey() ? '#2a2a1a' : '#10151f'"
                      [attr.stroke]="n.key === curKey() ? '#ffd54f' : '#39445f'" stroke-width="0.7" />
                <text [attr.x]="pos(n.key).x" [attr.y]="pos(n.key).y + 1.2" text-anchor="middle"
                      [attr.font-size]="boxW() < 17 || n.key.length > 9 ? 2.7 : 3.2"
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
    .board.stack { grid-template-columns: 1fr; }
    .board.stack .reach { min-height: 600px; }
    .arena { position: relative; min-height: 420px; background: radial-gradient(ellipse at 50% 45%, #202a40 0%, #171e2e 80%); border: 1px solid var(--border); border-radius: 10px; }
    .arena svg { position: absolute; inset: 0; width: 100%; height: 100%; }
    /* halo oscuro: aristas y arcos no tachan el texto */
    .arena svg text { paint-order: stroke; stroke: #1b2336; stroke-width: 0.8px; stroke-linejoin: round; }
    .a-label { position: absolute; top: 6px; left: 10px; z-index: 2; font-size: 0.66rem; text-transform: uppercase; letter-spacing: 1px; color: #5c6a8e; font-weight: 700; }
    .arc { stroke: #5c6a8e; stroke-width: 0.35; }
    .arc.inh { stroke: #ef9a9a; stroke-dasharray: 1.2 1.2; }
    .tr { cursor: pointer; }
    .gedge { fill: none; stroke: #8b95b5; stroke-width: 0.35; }
    .gedge.back { stroke-dasharray: 1.2 0.9; }

    .verdict { margin-top: 12px; background: rgba(46, 160, 67, 0.1); border: 1px solid #2ea043; border-radius: 10px; padding: 10px 14px; font-size: 0.88rem; line-height: 1.55; }
    .verdict.bad { background: rgba(239, 83, 80, 0.1); border-color: #ef5350; }

    .status { margin-top: 12px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; min-height: 46px; font-size: 0.85rem; line-height: 1.55; }
    .status.idle { color: var(--text-dim); }

    @media (max-width: 720px) {
      .board { grid-template-columns: 1fr; }
      .board.stack .reach { min-height: 380px; }
    }
  `,
})
export class ReachDetail implements OnInit {
  readonly nets = RNETS;
  /** red con la que arranca (para reusar el widget en otro tema) */
  readonly start = input('ej1');

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
      .trans.filter((t) => isEnabled(t, m))
      .map((t) => t.id);
  });

  constructor() {
    this.seedGraph();
  }

  ngOnInit(): void {
    if (this.start() !== this.netId()) this.selectNet(this.start());
  }

  private seedGraph(): void {
    const m0 = this.net().m0;
    this.nodes.set([{ key: m0.join(','), marking: [...m0], depth: 0, x: 0, y: 0 }]);
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
  ax(a: RArc, start: boolean): number {
    const f = this.rNodePos(a.from);
    const t = this.rNodePos(a.to);
    const d = Math.hypot(t.x - f.x, t.y - f.y) || 1;
    return start ? f.x + ((t.x - f.x) / d) * f.r : t.x - ((t.x - f.x) / d) * t.r;
  }
  ay(a: RArc, start: boolean): number {
    const f = this.rNodePos(a.from);
    const t = this.rNodePos(a.to);
    const d = Math.hypot(t.x - f.x, t.y - f.y) || 1;
    return start ? f.y + ((t.y - f.y) / d) * f.r : t.y - ((t.y - f.y) / d) * t.r;
  }

  /* --- geometría del grafo: layout por capas (una fila por profundidad BFS) --- */
  private gNode(key: string): GNode | undefined {
    return this.nodes().find((n) => n.key === key);
  }

  /** posición de cada marcado: filas por profundidad, repartidos parejo en cada fila */
  readonly layout = computed(() => {
    const ns = this.nodes();
    const byDepth = new Map<number, GNode[]>();
    for (const n of ns) {
      if (!byDepth.has(n.depth)) byDepth.set(n.depth, []);
      byDepth.get(n.depth)!.push(n);
    }
    const maxDepth = Math.max(0, ...ns.map((n) => n.depth));
    // deja libre el pie (y > 92) para el cartel de "grafo infinito"
    const dy = maxDepth === 0 ? 0 : Math.min(15, (this.truncated() ? 75 : 82) / maxDepth);
    const out = new Map<string, { x: number; y: number }>();
    for (const [depth, row] of byDepth) {
      row.forEach((n, k) => out.set(n.key, { x: ((k + 1) / (row.length + 1)) * 100, y: 12 + depth * dy }));
    }
    return out;
  });

  /** ancho de cada caja según la fila más poblada, para que nunca se toquen */
  readonly boxW = computed(() => {
    const counts = new Map<number, number>();
    for (const n of this.nodes()) counts.set(n.depth, (counts.get(n.depth) ?? 0) + 1);
    const widest = Math.max(1, ...counts.values());
    return Math.min(20, 96 / (widest + 1) - 2);
  });

  pos(key: string): { x: number; y: number } {
    return this.layout().get(key) ?? { x: 50, y: 12 };
  }

  /** distancia desde el centro de una caja hasta su borde en la dirección (ux, uy) */
  private boxReach(ux: number, uy: number): number {
    const a = this.boxW() / 2 + 0.6;
    const b = 4;
    return 1 / Math.sqrt((ux / a) ** 2 + (uy / b) ** 2);
  }

  /**
   * Geometría de una arista. Las que van hacia una capa igual o más profunda son rectas;
   * las que vuelven a una capa anterior (ciclos) se curvan hacia un costado para no
   * pasar por detrás de las cajas intermedias.
   */
  edgeGeom(e: GEdge): { d: string; lx: number; ly: number; back: boolean } {
    const f = this.pos(e.from);
    const t = this.pos(e.to);
    const fd = this.gNode(e.from)?.depth ?? 0;
    const td = this.gNode(e.to)?.depth ?? 0;
    const back = td < fd;

    // punto de control: medio del segmento, o desplazado al costado si es arista de vuelta
    let cx = (f.x + t.x) / 2;
    const cy = (f.y + t.y) / 2;
    if (back) {
      const dir = f.x + t.x >= 100 ? 1 : -1; // hacia el lado donde ya están los nodos
      // el punto medio de la curva cae a mitad de camino entre la cuerda y el control:
      // el control se aleja lo necesario para que la curva rodee las cajas intermedias
      const half = this.boxW() / 2 + 3;
      const edges = this.nodes()
        .filter((n) => n.depth > td && n.depth < fd)
        .map((n) => this.pos(n.key).x + dir * half);
      const clear = edges.length ? 2 * (dir > 0 ? Math.max(...edges) : Math.min(...edges)) - cx : cx;
      const base = cx + dir * (12 + 4 * (fd - td));
      cx = dir > 0 ? Math.max(base, clear) : Math.min(base, clear);
      cx = Math.max(-40, Math.min(140, cx));
    }

    const clip = (p: { x: number; y: number }, q: { x: number; y: number }) => {
      const d = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      const ux = (q.x - p.x) / d;
      const uy = (q.y - p.y) / d;
      const r = this.boxReach(ux, uy);
      return { x: p.x + ux * r, y: p.y + uy * r };
    };
    const c = { x: cx, y: cy };
    const s = clip(f, back ? c : t);
    const en = clip(t, back ? c : f);
    const d = back
      ? `M ${s.x.toFixed(1)} ${s.y.toFixed(1)} Q ${c.x.toFixed(1)} ${c.y.toFixed(1)} ${en.x.toFixed(1)} ${en.y.toFixed(1)}`
      : `M ${s.x.toFixed(1)} ${s.y.toFixed(1)} L ${en.x.toFixed(1)} ${en.y.toFixed(1)}`;
    // etiqueta: sobre la curva (punto medio de la cuadrática) o al 40% de la recta
    const lx = back ? 0.25 * s.x + 0.5 * c.x + 0.25 * en.x + 0.8 : s.x + (en.x - s.x) * 0.4 + 1;
    const ly = back ? 0.25 * s.y + 0.5 * c.y + 0.25 * en.y : s.y + (en.y - s.y) * 0.4;
    return { d, lx, ly, back };
  }

  private addNode(marking: number[], depth: number): GNode {
    const key = marking.join(',');
    const existing = this.gNode(key);
    if (existing) return existing;
    const node: GNode = { key, marking: [...marking], depth, x: 0, y: 0 };
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
        if (!isEnabled(t, m)) continue;
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
