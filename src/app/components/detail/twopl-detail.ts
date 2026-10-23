import { ChangeDetectionStrategy, Component, OnDestroy, computed, signal } from '@angular/core';
import { SteppedAnim } from './stepped';

interface Op {
  label: string;
  locks: number; // locks retenidos DESPUÉS de esta operación
  phase: 'grow' | 'peak' | 'shrink' | 'commit';
  msg: string;
}

const PLAIN: Op[] = [
  { label: 'begin', locks: 0, phase: 'grow', msg: 'Arranca la transacción, sin locks tomados.' },
  { label: 'lock(A)', locks: 1, phase: 'grow', msg: '<strong>Fase de expansión</strong>: se toma el lock de A. En esta fase <strong>solo se pueden adquirir</strong> locks.' },
  { label: 'read A', locks: 1, phase: 'grow', msg: 'Lee A. Sigue en expansión: podría tomar más locks.' },
  { label: 'lock(B)', locks: 2, phase: 'grow', msg: 'Toma también el lock de B. Ya retiene 2.' },
  { label: 'write B', locks: 2, phase: 'grow', msg: 'Escribe B. Nadie más puede tocar A ni B.' },
  { label: 'lock(C)', locks: 3, phase: 'peak', msg: '<strong>LOCKED POINT</strong>: el momento de máximo bloqueo. Es el pico de la curva y el punto donde la transacción queda "serializada" respecto de las demás.' },
  { label: 'write C', locks: 3, phase: 'peak', msg: 'Escribe C con los 3 locks en la mano.' },
  { label: 'unlock(C)', locks: 2, phase: 'shrink', msg: '<strong>Fase de contracción</strong>: empieza a liberar. A partir de acá <strong>NO puede tomar ningún lock nuevo</strong> — si lo hiciera, se rompería la serializabilidad.' },
  { label: 'unlock(B)', locks: 1, phase: 'shrink', msg: 'Libera B. Otra transacción ya puede tomarlo… <strong>aunque esta todavía no commiteó</strong>.' },
  { label: 'commit', locks: 1, phase: 'commit', msg: '⚠️ Commit con locks ya liberados: si ahora la transacción abortara, otra pudo haber leído datos que se van a deshacer (<strong>dirty read</strong> → aborto en cascada).' },
  { label: 'unlock(A)', locks: 0, phase: 'shrink', msg: 'Libera el último lock. Transacción terminada.' },
];

const STRICT: Op[] = [
  { label: 'begin', locks: 0, phase: 'grow', msg: 'Arranca la transacción, sin locks tomados.' },
  { label: 'lock(A)', locks: 1, phase: 'grow', msg: '<strong>Fase de expansión</strong>: se toma el lock de A.' },
  { label: 'read A', locks: 1, phase: 'grow', msg: 'Lee A.' },
  { label: 'lock(B)', locks: 2, phase: 'grow', msg: 'Toma el lock de B.' },
  { label: 'write B', locks: 2, phase: 'grow', msg: 'Escribe B.' },
  { label: 'lock(C)', locks: 3, phase: 'peak', msg: '<strong>LOCKED POINT</strong>: máximo bloqueo.' },
  { label: 'write C', locks: 3, phase: 'peak', msg: 'Escribe C. Retiene los 3 locks.' },
  { label: 'commit', locks: 3, phase: 'commit', msg: '<strong>Strict 2PL</strong>: commitea <strong>todavía con todos los locks tomados</strong>. Nadie pudo leer datos intermedios.' },
  { label: 'unlock ×3', locks: 0, phase: 'shrink', msg: 'Recién <strong>después del commit</strong> libera todo, de golpe. Por eso no hay dirty reads ni abortos en cascada — a costa de retener los locks más tiempo (menos concurrencia).' },
];

/**
 * Two-phase locking: la curva de locks retenidos a lo largo de la
 * transacción, con el locked point y la comparación 2PL vs strict 2PL.
 */
@Component({
  selector: 'app-twopl-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="anim">
      <div class="head">
        <div class="titles">
          <div class="title">📈 Two-Phase Locking: expansión y contracción</div>
          <div class="caption">Primero se toman TODOS los locks; después se liberan. Nunca al revés.</div>
        </div>
        <div class="controls">
          <button class="ctl" (click)="prev()" [disabled]="index() < 0">⏮</button>
          <button class="ctl play" (click)="toggle()">
            {{ playing() ? '⏸ Pausa' : finished() ? '↺ Repetir' : '▶ Play' }}
          </button>
          <button class="ctl" (click)="next()" [disabled]="finished()">⏭</button>
          <div class="modes">
            <button class="mode" [class.on]="!strict()" (click)="setStrict(false)">2PL</button>
            <button class="mode" [class.on]="strict()" (click)="setStrict(true)">strict 2PL</button>
          </div>
        </div>
      </div>

      <div class="chart">
        <!-- el SVG se estira (preserveAspectRatio none) así que solo lleva trazos;
             textos y el punto van en HTML posicionado en %, para no deformarse -->
        <div class="plot">
          <svg viewBox="0 0 100 46" preserveAspectRatio="none">
            @for (l of [0, 1, 2, 3]; track l) {
              <line x1="7" [attr.y1]="yFor(l)" x2="99" [attr.y2]="yFor(l)" class="grid" />
            }
            <path [attr.d]="areaPath()" class="area" />
            <path [attr.d]="linePath()" class="line" />
            @if (cur() >= 0) {
              <line [attr.x1]="xFor(cur())" y1="2" [attr.x2]="xFor(cur())" y2="38" class="cursor" />
            }
          </svg>
          @if (cur() >= 0) {
            <span class="pt" [style.left.%]="xFor(cur())" [style.top.%]="pctY(yFor(ops()[cur()].locks))"></span>
          }
          @if (peakIdx() >= 0) {
            <span class="peak-t" [style.left.%]="xFor(peakIdx())" [style.top.%]="pctY(yFor(3)) - 8">locked point</span>
          }
          @for (l of [0, 1, 2, 3]; track l) {
            <span class="ax" [style.top.%]="pctY(yFor(l))">{{ l }}</span>
          }
          <span class="ax-title">locks</span>
        </div>

        <!-- etiquetas de operaciones -->
        <div class="oplabels">
          @for (o of ops(); track $index; let i = $index) {
            <button class="op" [class.now]="cur() === i" [class.past]="cur() > i"
                    [class.commit]="o.phase === 'commit'" (click)="jump(i)">{{ o.label }}</button>
          }
        </div>
      </div>

      <div class="phases">
        <span class="ph grow" [class.on]="phase() === 'grow'">↗ expansión (solo adquirir)</span>
        <span class="ph peak" [class.on]="phase() === 'peak'">⬤ locked point</span>
        <span class="ph shrink" [class.on]="phase() === 'shrink'">↘ contracción (solo liberar)</span>
      </div>

      <div class="status" [class.done]="finished()" [class.idle]="index() < 0">
        @if (index() >= 0 && !finished()) {
          <span class="stepno">{{ index() + 1 }}/{{ ops().length }}</span>
        }
        @if (finished()) { <span class="stepno ok">✔</span> }
        <span [innerHTML]="statusMsg()"></span>
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
    .mode.on { background: #1f6feb; color: #fff; }

    .chart { background: radial-gradient(ellipse at 50% 45%, #202a40 0%, #171e2e 80%); border: 1px solid var(--border); border-radius: 10px; padding: 10px; }
    .plot { position: relative; height: 190px; }
    svg { width: 100%; height: 100%; display: block; }
    .pt { position: absolute; width: 10px; height: 10px; border-radius: 50%; background: #ffd54f; transform: translate(-50%, -50%); box-shadow: 0 0 8px rgba(255, 213, 79, 0.6); }
    .peak-t { position: absolute; transform: translate(-50%, -100%); color: #ffab70; font-size: 0.72rem; font-weight: 700; white-space: nowrap; }
    .ax { position: absolute; left: 2%; transform: translateY(-50%); color: #5c6a8e; font-size: 0.66rem; font-family: Consolas, monospace; }
    .ax-title { position: absolute; left: 0; top: 0; color: #5c6a8e; font-size: 0.6rem; text-transform: uppercase; letter-spacing: 1px; }
    .grid { stroke: #232b3e; stroke-width: 0.3; vector-effect: non-scaling-stroke; }
    .area { fill: rgba(88, 166, 255, 0.14); }
    .line { fill: none; stroke: #58a6ff; stroke-width: 2; vector-effect: non-scaling-stroke; }
    .cursor { stroke: #ffd54f; stroke-width: 1.4; stroke-dasharray: 2 2; vector-effect: non-scaling-stroke; }

    .oplabels { display: flex; gap: 3px; margin-top: 8px; flex-wrap: wrap; }
    .op { flex: 1; min-width: 52px; background: var(--panel-2); border: 1px solid var(--border); color: var(--text-dim); border-radius: 5px; padding: 4px 3px; font-size: 0.62rem; font-family: Consolas, monospace; cursor: pointer; }
    .op.past { color: var(--text); border-color: #3d4a6b; }
    .op.now { background: #2a2a1a; border-color: #ffd54f; color: #fff; font-weight: 700; }
    .op.commit { border-color: #2ea04388; color: #7ee787; }

    .phases { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
    .ph { font-size: 0.72rem; padding: 3px 10px; border-radius: 12px; border: 1px solid var(--border); color: #5c6a8e; }
    .ph.on.grow { border-color: #58a6ff; color: #79c0ff; background: rgba(88, 166, 255, 0.1); }
    .ph.on.peak { border-color: #f0883e; color: #ffab70; background: rgba(240, 136, 62, 0.1); }
    .ph.on.shrink { border-color: #a78bfa; color: #d2b9ff; background: rgba(167, 139, 250, 0.1); }

    .status { display: flex; align-items: center; gap: 10px; margin-top: 12px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 11px 14px; min-height: 50px; font-size: 0.9rem; line-height: 1.5; }
    .status.done { border-color: #2ea04366; background: rgba(46, 160, 67, 0.1); }
    .status.idle { color: var(--text-dim); font-style: italic; }
    .stepno { flex-shrink: 0; background: #1f6feb; color: #fff; border-radius: 6px; font-size: 0.75rem; font-weight: 700; padding: 2px 8px; }
    .stepno.ok { background: #2ea043; }
  `,
})
export class TwoplDetail extends SteppedAnim implements OnDestroy {
  readonly strict = signal(false);

  readonly ops = computed<Op[]>(() => (this.strict() ? STRICT : PLAIN));

  protected stepCount(): number {
    return this.ops().length;
  }
  protected override stepTravel(_i: number): number {
    return 400;
  }
  protected override stepDwell(_i: number): number {
    return 2600;
  }

  /** índice de paso mostrado (con finished apuntando al último) */
  readonly cur = computed(() => {
    if (this.finished()) return this.ops().length - 1;
    return this.index();
  });

  readonly peakIdx = computed(() => this.ops().findIndex((o) => o.phase === 'peak'));
  readonly phase = computed(() => {
    const i = this.cur();
    return i < 0 ? null : this.ops()[i].phase;
  });

  setStrict(v: boolean): void {
    if (this.strict() === v) return;
    this.strict.set(v);
    this.reset();
  }

  xFor(i: number): number {
    const n = this.ops().length - 1;
    return 7 + (i / n) * 92;
  }
  yFor(locks: number): number {
    return 38 - (locks / 3) * 32;
  }
  /** y del viewBox (0..46) a % del alto del gráfico, para los overlays HTML */
  pctY(y: number): number {
    return (y / 46) * 100;
  }

  readonly linePath = computed(() => {
    const ops = this.ops();
    let d = `M ${this.xFor(0)} ${this.yFor(ops[0].locks)}`;
    for (let i = 1; i < ops.length; i++) {
      // escalón: primero horizontal, después vertical
      d += ` L ${this.xFor(i)} ${this.yFor(ops[i - 1].locks)}`;
      d += ` L ${this.xFor(i)} ${this.yFor(ops[i].locks)}`;
    }
    return d;
  });

  readonly areaPath = computed(() => {
    const ops = this.ops();
    const base = this.yFor(0);
    return `${this.linePath()} L ${this.xFor(ops.length - 1)} ${base} L ${this.xFor(0)} ${base} Z`;
  });

  readonly statusMsg = computed(() => {
    if (this.finished()) {
      return this.strict()
        ? '<strong>Strict 2PL</strong>: la contracción ocurre <strong>después del commit</strong>. Evita dirty reads y abortos en cascada, pero retiene los locks más tiempo → menos concurrencia. Es lo que usan la mayoría de las bases de datos reales.'
        : '<strong>2PL clásico</strong>: garantiza <em>serializabilidad</em> — el resultado equivale a alguna ejecución secuencial. Pero puede haber <strong>deadlocks</strong> (dos transacciones pidiendo locks cruzados) y dirty reads si alguien lee lo liberado antes del commit.';
    }
    const i = this.index();
    if (i < 0) {
      return 'Presioná ▶ Play. Mirá la curva: sube mientras adquiere locks, y una vez que empieza a bajar <strong>ya no puede volver a subir</strong>.';
    }
    return this.ops()[i].msg;
  });

  ngOnDestroy(): void {
    this.destroy();
  }
}
