import { ChangeDetectionStrategy, Component, OnDestroy, computed, signal } from '@angular/core';
import { SteppedAnim } from './stepped';

type St = 'idle' | 'want' | 'cs' | 'dead';

interface Node {
  st: St;
  ts?: number;
  oks: number;
  queue: number[];
}

interface Arrow {
  from: number;
  to: number;
  label: string;
  kind: 'req' | 'ok' | 'lost';
}

interface Step {
  nodes: Node[];
  arrows: Arrow[];
  msg: string;
}

const N = 3; // para entrar hacen falta n − 1 = 2 OKs

const idle = (): Node => ({ st: 'idle', oks: 0, queue: [] });

/** el escenario del resumen: P0 y P2 quieren a la vez (ts 8 y 12), P1 no */
const NORMAL: Step[] = [
  {
    nodes: [{ st: 'want', ts: 8, oks: 0, queue: [] }, idle(), { st: 'want', ts: 12, oks: 0, queue: [] }],
    arrows: [],
    msg: '<strong>P0 y P2 quieren entrar a la sección crítica al mismo tiempo.</strong> Cada uno toma su reloj de Lamport: P0 marca <strong>8</strong>, P2 marca <strong>12</strong>. P1 no está interesado. No hay coordinador.',
  },
  {
    nodes: [{ st: 'want', ts: 8, oks: 0, queue: [] }, idle(), { st: 'want', ts: 12, oks: 0, queue: [] }],
    arrows: [
      { from: 0, to: 1, label: 'REQ(8)', kind: 'req' },
      { from: 0, to: 2, label: 'REQ(8)', kind: 'req' },
      { from: 2, to: 0, label: 'REQ(12)', kind: 'req' },
      { from: 2, to: 1, label: 'REQ(12)', kind: 'req' },
    ],
    msg: 'Cada uno <strong>broadcastea</strong> su pedido a todos los demás, con su número de proceso y su <strong>timestamp</strong>. Ahora tienen que esperar el OK de los n − 1 = 2 restantes.',
  },
  {
    nodes: [{ st: 'want', ts: 8, oks: 1, queue: [] }, idle(), { st: 'want', ts: 12, oks: 1, queue: [] }],
    arrows: [
      { from: 1, to: 0, label: 'OK', kind: 'ok' },
      { from: 1, to: 2, label: 'OK', kind: 'ok' },
    ],
    msg: '<strong>Regla 1</strong>: P1 no está en la sección crítica y no quiere entrar → le responde <strong>OK</strong> a los dos. A P1 no le importa quién gane.',
  },
  {
    nodes: [{ st: 'want', ts: 8, oks: 2, queue: [2] }, idle(), { st: 'want', ts: 12, oks: 1, queue: [] }],
    arrows: [{ from: 2, to: 0, label: 'OK', kind: 'ok' }],
    msg: '<strong>Regla 3</strong>: los dos quieren entrar, así que comparan timestamps. <strong>Gana el menor</strong>: 8 &lt; 12. P2 pierde y le manda OK a P0. P0 gana: <strong>no le responde</strong> a P2 y lo <strong>encola</strong>.',
  },
  {
    nodes: [{ st: 'cs', ts: 8, oks: 2, queue: [2] }, idle(), { st: 'want', ts: 12, oks: 1, queue: [] }],
    arrows: [],
    msg: 'P0 juntó los <strong>2 OKs</strong> (n − 1) → <strong>entra a la sección crítica</strong>. P2 tiene solo 1 y sigue esperando. Exclusión mutua garantizada: P2 no puede tener los dos OKs mientras P0 retenga el suyo.',
  },
  {
    nodes: [{ st: 'idle', oks: 0, queue: [] }, idle(), { st: 'want', ts: 12, oks: 2, queue: [] }],
    arrows: [{ from: 0, to: 2, label: 'OK', kind: 'ok' }],
    msg: '<strong>Regla 2</strong> en acción: al salir de la sección crítica, P0 le manda OK a <strong>todos los que había encolado</strong>. Ahora P2 completa sus 2 OKs.',
  },
  {
    nodes: [idle(), idle(), { st: 'cs', ts: 12, oks: 2, queue: [] }],
    arrows: [],
    msg: 'P2 entra a la sección crítica. Cada acceso costó <strong>2(n − 1) = 4 mensajes</strong> (n − 1 pedidos + n − 1 OKs), sin líder y <strong>sin starvation</strong>: el timestamp más viejo siempre termina ganando.',
  },
];

/** mismo escenario, pero P1 está caído: su silencio se lee como una negación */
const FAILED: Step[] = [
  {
    nodes: [{ st: 'want', ts: 8, oks: 0, queue: [] }, { st: 'dead', oks: 0, queue: [] }, { st: 'want', ts: 12, oks: 0, queue: [] }],
    arrows: [],
    msg: 'Mismo escenario, pero <strong>P1 está caído</strong>. P0 y P2 no lo saben: para ellos sigue siendo uno de los n − 1 que tienen que dar OK.',
  },
  {
    nodes: [{ st: 'want', ts: 8, oks: 0, queue: [] }, { st: 'dead', oks: 0, queue: [] }, { st: 'want', ts: 12, oks: 0, queue: [] }],
    arrows: [
      { from: 0, to: 1, label: 'REQ(8)', kind: 'lost' },
      { from: 0, to: 2, label: 'REQ(8)', kind: 'req' },
      { from: 2, to: 0, label: 'REQ(12)', kind: 'req' },
      { from: 2, to: 1, label: 'REQ(12)', kind: 'lost' },
    ],
    msg: 'Los dos broadcastean su pedido. Los que van a P1 <strong>se pierden</strong>: nadie los procesa.',
  },
  {
    nodes: [{ st: 'want', ts: 8, oks: 1, queue: [2] }, { st: 'dead', oks: 0, queue: [] }, { st: 'want', ts: 12, oks: 0, queue: [] }],
    arrows: [{ from: 2, to: 0, label: 'OK', kind: 'ok' }],
    msg: 'Entre P0 y P2 la comparación funciona igual: 8 &lt; 12, P2 da OK y P0 lo encola. Pero P1 <strong>no responde nada</strong>.',
  },
  {
    nodes: [{ st: 'want', ts: 8, oks: 1, queue: [2] }, { st: 'dead', oks: 0, queue: [] }, { st: 'want', ts: 12, oks: 0, queue: [] }],
    arrows: [],
    msg: '💀 <strong>Nadie entra jamás.</strong> P0 necesita 2 OKs y tiene 1; P2 tiene 0. El silencio de P1 se interpreta como <strong>denegación de permiso</strong>. Se reemplazó el single point of failure del centralizado por <strong>n points of failure</strong>.',
  },
];

/* posiciones de los tres procesos (viewBox 100 × 72) */
const POS = [
  { x: 50, y: 14 },
  { x: 17, y: 58 },
  { x: 83, y: 58 },
];

/**
 * Ricart-Agrawala paso a paso: broadcast con timestamps de Lamport,
 * las tres reglas de respuesta, y el modo "P1 caído" que bloquea a todos.
 */
@Component({
  selector: 'app-ricart-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="anim">
      <div class="head">
        <div class="titles">
          <div class="title">🗳 Ricart-Agrawala: pedir permiso a todos</div>
          <div class="caption">Sin coordinador: entrás cuando los n − 1 restantes te dieron OK. Empates: gana el timestamp menor.</div>
        </div>
        <div class="controls">
          <button class="ctl" (click)="prev()" [disabled]="index() < 0">⏮</button>
          <button class="ctl play" (click)="toggle()">
            {{ playing() ? '⏸ Pausa' : finished() ? '↺ Repetir' : '▶ Play' }}
          </button>
          <button class="ctl" (click)="next()" [disabled]="finished()">⏭</button>
          <div class="modes">
            <button class="mode" [class.on]="!failed()" (click)="setFailed(false)">normal</button>
            <button class="mode danger" [class.on]="failed()" (click)="setFailed(true)">P1 caído</button>
          </div>
        </div>
      </div>

      <div class="board">
        <div class="canvas">
          <svg viewBox="0 0 100 72">
            <defs>
              <marker id="ra-req" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 z" fill="#ffd54f" />
              </marker>
              <marker id="ra-ok" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 z" fill="#7ee787" />
              </marker>
              <marker id="ra-lost" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 z" fill="#ef5350" />
              </marker>
            </defs>

            <!-- conexiones de fondo -->
            @for (e of pairs; track $index) {
              <line [attr.x1]="pos[e[0]].x" [attr.y1]="pos[e[0]].y" [attr.x2]="pos[e[1]].x" [attr.y2]="pos[e[1]].y" class="link" />
            }

            <!-- mensajes del paso -->
            @for (a of cur().arrows; track $index) {
              <line [attr.x1]="ap(a).x1" [attr.y1]="ap(a).y1" [attr.x2]="ap(a).x2" [attr.y2]="ap(a).y2"
                    class="arr" [class.req]="a.kind === 'req'" [class.ok]="a.kind === 'ok'" [class.lost]="a.kind === 'lost'"
                    [attr.marker-end]="'url(#ra-' + a.kind + ')'" />
              <text [attr.x]="ap(a).lx" [attr.y]="ap(a).ly" text-anchor="middle" class="al"
                    [class.req-t]="a.kind === 'req'" [class.ok-t]="a.kind === 'ok'" [class.lost-t]="a.kind === 'lost'">{{ a.label }}</text>
            }

            <!-- procesos -->
            @for (n of cur().nodes; track $index; let i = $index) {
              <circle [attr.cx]="pos[i].x" [attr.cy]="pos[i].y" r="7" class="node"
                      [class.want]="n.st === 'want'" [class.cs]="n.st === 'cs'" [class.dead]="n.st === 'dead'" />
              <text [attr.x]="pos[i].x" [attr.y]="pos[i].y + 1.4" text-anchor="middle" class="nl">{{ n.st === 'dead' ? '✖' : 'P' + i }}</text>
              <text [attr.x]="pos[i].x" [attr.y]="pos[i].y + (i === 0 ? -9.5 : 11.5)" text-anchor="middle" class="ns">
                {{ stLabel(n) }}
              </text>
            }
          </svg>
        </div>

        <div class="side">
          <div class="p-title">estado de cada proceso</div>
          @for (n of cur().nodes; track $index; let i = $index) {
            <div class="row" [class.cs-row]="n.st === 'cs'" [class.dead-row]="n.st === 'dead'">
              <div class="r-head">
                <strong>P{{ i }}</strong>
                <span class="r-st">{{ stLabel(n) }}</span>
              </div>
              @if (n.st === 'want' || n.st === 'cs') {
                <div class="r-line">
                  OKs: <span class="okbar">
                    @for (k of okSlots; track k) {
                      <span class="slot" [class.full]="k < n.oks"></span>
                    }
                  </span>
                  {{ n.oks }}/{{ needed }}
                </div>
              }
              @if (n.queue.length > 0) {
                <div class="r-line">cola de diferidos: <strong>{{ queueLabel(n) }}</strong></div>
              }
            </div>
          }
          <div class="rules">
            <div class="p-title">al recibir un REQ</div>
            <div class="rule"><b>1</b> No estoy en la CS ni quiero entrar → <span class="ok-c">OK</span></div>
            <div class="rule"><b>2</b> Estoy en la CS → no respondo, <span class="q-c">encolo</span></div>
            <div class="rule"><b>3</b> También quiero entrar → gana el timestamp menor</div>
          </div>
        </div>
      </div>

      <div class="status" [class.done]="finished()" [class.idle]="index() < 0" [class.bad]="failed() && finished()">
        @if (index() >= 0 && !finished()) {
          <span class="stepno">{{ index() + 1 }}/{{ steps().length }}</span>
        }
        @if (finished()) {
          <span class="stepno" [class.ok]="!failed()" [class.fail]="failed()">{{ failed() ? '✖' : '✔' }}</span>
        }
        <span [innerHTML]="statusMsg()"></span>
      </div>

      <div class="dots">
        @for (s of steps(); track $index; let i = $index) {
          <button class="dot" [class.past]="i < index() || finished()" [class.now]="i === index() && !finished()" (click)="jump(i)"></button>
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
    .ctl { background: var(--panel-2); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 7px 12px; cursor: pointer; font-size: 0.9rem; }
    .ctl:hover:not(:disabled) { background: #2d3750; }
    .ctl:disabled { opacity: 0.35; cursor: default; }
    .ctl.play { background: #1f6feb; border-color: #1f6feb; color: #fff; font-weight: 700; min-width: 96px; }
    .modes { display: flex; background: var(--panel-2); border: 1px solid var(--border); border-radius: 8px; padding: 2px; gap: 2px; margin-left: 6px; }
    .mode { background: transparent; border: none; color: var(--text-dim); border-radius: 6px; padding: 6px 10px; cursor: pointer; font-size: 0.78rem; font-weight: 600; }
    .mode.on { background: #2ea043; color: #fff; }
    .mode.danger.on { background: #c73e3a; }

    .board { display: flex; gap: 12px; align-items: stretch; }
    .canvas { flex: 1; min-width: 0; background: radial-gradient(ellipse at 50% 45%, #202a40 0%, #171e2e 80%); border: 1px solid var(--border); border-radius: 10px; padding: 8px; display: flex; align-items: center; }
    svg { width: 100%; max-width: 560px; height: auto; display: block; margin: 0 auto; }
    svg text { paint-order: stroke; stroke: #1b2336; stroke-width: 0.8px; stroke-linejoin: round; }
    .link { stroke: #2d3750; stroke-width: 0.3; stroke-dasharray: 1 1.2; }
    .arr { stroke-width: 0.55; }
    .arr.req { stroke: #ffd54f; }
    .arr.ok { stroke: #7ee787; }
    .arr.lost { stroke: #ef5350; stroke-dasharray: 1.4 1; }
    .al { font-size: 2.8px; font-family: Consolas, monospace; font-weight: 700; }
    .req-t { fill: #ffd54f; }
    .ok-t { fill: #7ee787; }
    .lost-t { fill: #ef9a9a; }
    .node { fill: #1a2132; stroke: #58a6ff; stroke-width: 0.7; }
    .node.want { fill: #2a2a1a; stroke: #ffd54f; }
    .node.cs { fill: #16281c; stroke: #2ea043; stroke-width: 1; }
    .node.dead { fill: #2a1518; stroke: #5c3a3e; }
    .nl { fill: #fff; font-size: 4px; font-weight: 800; }
    .ns { fill: #9aa4bf; font-size: 2.8px; }

    .side { width: 250px; flex-shrink: 0; display: flex; flex-direction: column; gap: 6px; }
    .p-title { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 1px; color: #5c6a8e; font-weight: 700; margin-bottom: 2px; }
    .row { background: #10151f; border: 1px solid var(--border); border-radius: 9px; padding: 7px 10px; font-size: 0.76rem; color: var(--text-dim); }
    .row.cs-row { border-color: #2ea043; }
    .row.dead-row { opacity: 0.6; }
    .r-head { display: flex; justify-content: space-between; gap: 6px; }
    .r-head strong { color: #fff; }
    .r-st { font-size: 0.7rem; }
    .r-line { margin-top: 3px; display: flex; align-items: center; gap: 6px; }
    .r-line strong { color: #ffab70; font-family: Consolas, monospace; }
    .okbar { display: inline-flex; gap: 3px; }
    .slot { width: 14px; height: 8px; border-radius: 2px; border: 1px solid #2ea04388; }
    .slot.full { background: #2ea043; }
    .rules { margin-top: 4px; background: #10151f; border: 1px solid var(--border); border-radius: 9px; padding: 8px 10px; }
    .rule { font-size: 0.72rem; color: var(--text-dim); line-height: 1.5; }
    .rule b { display: inline-block; width: 14px; color: #ffd54f; }
    .ok-c { color: #7ee787; font-weight: 700; }
    .q-c { color: #ffab70; font-weight: 700; }

    .status { display: flex; align-items: center; gap: 10px; margin-top: 12px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 11px 14px; min-height: 50px; font-size: 0.92rem; line-height: 1.5; }
    .status.done { border-color: #2ea04366; background: rgba(46, 160, 67, 0.1); }
    .status.bad { border-color: #ef535088; background: rgba(239, 83, 80, 0.1); }
    .status.idle { color: var(--text-dim); font-style: italic; }
    .stepno { flex-shrink: 0; background: #1f6feb; color: #fff; border-radius: 6px; font-size: 0.75rem; font-weight: 700; padding: 2px 8px; }
    .stepno.ok { background: #2ea043; }
    .stepno.fail { background: #c73e3a; }
    .dots { display: flex; gap: 6px; margin-top: 10px; justify-content: center; flex-wrap: wrap; }
    .dot { width: 12px; height: 12px; border-radius: 50%; border: 1px solid var(--border); background: var(--panel-2); cursor: pointer; padding: 0; transition: transform 0.15s; }
    .dot:hover { transform: scale(1.3); }
    .dot.past { background: #1f6feb; border-color: #1f6feb; }
    .dot.now { background: #ffd54f; border-color: #ffd54f; }

    @media (max-width: 720px) {
      .board { flex-direction: column; }
      .side { width: 100%; }
    }
  `,
})
export class RicartDetail extends SteppedAnim implements OnDestroy {
  readonly pos = POS;
  readonly pairs = [
    [0, 1],
    [0, 2],
    [1, 2],
  ];
  readonly needed = N - 1;
  readonly okSlots = Array.from({ length: N - 1 }, (_, i) => i);

  readonly failed = signal(false);
  readonly steps = computed(() => (this.failed() ? FAILED : NORMAL));

  protected stepCount(): number {
    return this.steps().length;
  }
  protected override stepTravel(_i: number): number {
    return 500;
  }
  protected override stepDwell(_i: number): number {
    return 4200;
  }

  /** paso visible: antes de arrancar se muestra el estado inicial */
  readonly cur = computed<Step>(() => {
    const s = this.steps();
    if (this.finished()) return s[s.length - 1];
    return s[Math.max(this.index(), 0)];
  });

  setFailed(v: boolean): void {
    if (this.failed() === v) return;
    this.failed.set(v);
    this.reset();
  }

  stLabel(n: Node): string {
    switch (n.st) {
      case 'idle':
        return 'no quiere';
      case 'want':
        return `quiere · ts ${n.ts}`;
      case 'cs':
        return `🔓 en la CS · ts ${n.ts}`;
      case 'dead':
        return '💀 caído';
    }
  }

  queueLabel(n: Node): string {
    return n.queue.map((q) => 'P' + q).join(', ');
  }

  /**
   * Flecha de a → b recortada en los círculos y corrida al costado, para que
   * a→b y b→a no se superpongan. Etiqueta en el medio, del lado de la flecha.
   */
  ap(a: Arrow): { x1: number; y1: number; x2: number; y2: number; lx: number; ly: number } {
    const f = POS[a.from];
    const t = POS[a.to];
    const d = Math.hypot(t.x - f.x, t.y - f.y);
    const ux = (t.x - f.x) / d;
    const uy = (t.y - f.y) / d;
    const off = 2; // corrimiento perpendicular
    const nx = -uy * off;
    const ny = ux * off;
    const r = 8.2;
    const x1 = f.x + ux * r + nx;
    const y1 = f.y + uy * r + ny;
    const x2 = t.x - ux * r + nx;
    const y2 = t.y - uy * r + ny;
    return { x1, y1, x2, y2, lx: (x1 + x2) / 2 + nx * 1.9, ly: (y1 + y2) / 2 + ny * 1.9 + 1 };
  }

  readonly statusMsg = computed(() => {
    const s = this.steps();
    if (this.finished()) return s[s.length - 1].msg;
    const i = this.index();
    if (i < 0) {
      return 'Presioná ▶ Play. Es el ejemplo del resumen: dos procesos piden la sección crítica casi a la vez y el timestamp de Lamport decide quién va primero.';
    }
    return s[i].msg;
  });

  ngOnDestroy(): void {
    this.destroy();
  }
}
