import { ChangeDetectionStrategy, Component, OnDestroy, computed, signal } from '@angular/core';
import { SteppedAnim } from './stepped';

interface Step {
  a: string; // qué hace/tiene el cliente A
  b: string;
  aState?: 'work' | 'ok' | 'fail' | 'wait';
  bState?: 'work' | 'ok' | 'fail' | 'wait';
  version: number; // versión commiteada del dato
  aRead?: number; // versión que leyó A
  bRead?: number;
  lock?: 'A' | 'B' | null;
  conflict?: boolean;
  msg: string;
}

const OPTIMISTIC: Step[] = [
  { a: '—', b: '—', version: 1, msg: 'El dato está en <strong>v1</strong>. Nadie lo tocó todavía. En el modelo <strong>optimista</strong> se asume que los conflictos son raros: <strong>nadie toma locks</strong>.' },
  { a: 'lee v1', b: '—', aState: 'work', version: 1, aRead: 1, msg: '<strong>Cliente A lee</strong> el dato y se guarda que leyó la <strong>versión 1</strong>. No bloquea nada: otros pueden leer y escribir mientras tanto.' },
  { a: 'trabaja', b: 'lee v1', aState: 'work', bState: 'work', version: 1, aRead: 1, bRead: 1, msg: '<strong>Cliente B lee el mismo dato</strong>, también en v1. Los dos tienen su copia local. Acá ya está el conflicto latente… y nadie se enteró.' },
  { a: 'modifica local', b: 'modifica local', aState: 'work', bState: 'work', version: 1, aRead: 1, bRead: 1, msg: 'Ambos modifican <strong>su copia local</strong>, sin ningún control. En esta fase el modelo optimista es <strong>totalmente paralelo</strong>: cero bloqueos.' },
  { a: '✔ commit', b: 'modifica local', aState: 'ok', bState: 'work', version: 2, aRead: 1, bRead: 1, msg: '<strong>A commitea</strong>: el sistema verifica si la versión sigue siendo la que A leyó (v1). <strong>Sí lo es</strong> → se aplican los cambios y el dato pasa a <strong>v2</strong>.' },
  { a: 'listo', b: '✘ CONFLICTO', aState: 'ok', bState: 'fail', version: 2, aRead: 1, bRead: 1, conflict: true, msg: '<strong>B intenta commitear</strong>: leyó v1, pero el dato ya está en <strong>v2</strong>. Alguien lo modificó en el medio → <strong>se detecta el conflicto y la transacción de B se ABORTA</strong>. Todo su trabajo se descarta.' },
  { a: 'listo', b: 'reintenta: lee v2', aState: 'ok', bState: 'work', version: 2, bRead: 2, msg: 'B <strong>reintenta desde cero</strong>: vuelve a leer, ahora en v2, y rehace su trabajo sobre el valor actualizado.' },
  { a: 'listo', b: '✔ commit', aState: 'ok', bState: 'ok', version: 3, bRead: 2, msg: 'Ahora sí: la versión que leyó B coincide con la actual → commitea y el dato pasa a <strong>v3</strong>. <strong>Ventaja</strong>: libre de deadlocks, muy paralelo. <strong>Desventaja</strong>: rehacer todo es caro en alta carga.' },
];

const PESSIMISTIC: Step[] = [
  { a: '—', b: '—', version: 1, lock: null, msg: 'Mismo escenario, pero con <strong>bloqueo (2PL)</strong>: antes de tocar el dato hay que tomar el lock.' },
  { a: '🔒 toma el lock', b: '—', aState: 'work', version: 1, lock: 'A', msg: '<strong>A toma el lock</strong> del dato. Ahora es el único que puede tocarlo.' },
  { a: 'lee v1', b: '⛔ bloqueado', aState: 'work', bState: 'wait', version: 1, aRead: 1, lock: 'A', msg: '<strong>B quiere el lock y se BLOQUEA</strong>: queda esperando, sin hacer nada útil. Acá está el costo del modelo pesimista — pero también su garantía.' },
  { a: 'modifica', b: '⛔ bloqueado', aState: 'work', bState: 'wait', version: 1, aRead: 1, lock: 'A', msg: 'A trabaja tranquilo: nadie puede leer un estado intermedio.' },
  { a: '✔ commit', b: '⛔ bloqueado', aState: 'ok', bState: 'wait', version: 2, aRead: 1, lock: 'A', msg: 'A commitea → el dato pasa a <strong>v2</strong>. Sigue reteniendo el lock (en <em>strict</em> 2PL se libera recién ahora).' },
  { a: 'libera 🔓', b: '🔒 toma el lock', aState: 'ok', bState: 'work', version: 2, lock: 'B', msg: 'A libera y <strong>B despierta</strong> con el lock. No hubo conflicto ni trabajo desperdiciado: B simplemente esperó su turno.' },
  { a: 'listo', b: 'lee v2 y modifica', aState: 'ok', bState: 'work', version: 2, bRead: 2, lock: 'B', msg: 'B lee el valor <strong>ya actualizado</strong> (v2) y trabaja sobre él. Nunca leyó un dato viejo.' },
  { a: 'listo', b: '✔ commit', aState: 'ok', bState: 'ok', version: 3, bRead: 2, lock: null, msg: 'B commitea → <strong>v3</strong>. <strong>Ventaja</strong>: cero trabajo desperdiciado. <strong>Desventaja</strong>: B estuvo bloqueado sin hacer nada, y si dos transacciones se piden locks cruzados → <strong>deadlock</strong>.' },
];

/**
 * Control de concurrencia: optimista (sin locks, verifica al commitear
 * y aborta si hubo conflicto) vs pesimista (2PL, bloquea y espera).
 */
@Component({
  selector: 'app-optimistic-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="anim">
      <div class="head">
        <div class="titles">
          <div class="title">🎲 Optimista vs pesimista: dos clientes, un dato</div>
          <div class="caption">Los dos leen lo mismo y los dos quieren escribir. ¿Qué pasa?</div>
        </div>
        <div class="controls">
          <button class="ctl" (click)="prev()" [disabled]="index() < 0">⏮</button>
          <button class="ctl play" (click)="toggle()">
            {{ playing() ? '⏸ Pausa' : finished() ? '↺ Repetir' : '▶ Play' }}
          </button>
          <button class="ctl" (click)="next()" [disabled]="finished()">⏭</button>
          <div class="modes">
            <button class="mode" [class.on]="!pess()" (click)="setPess(false)">optimista</button>
            <button class="mode" [class.on]="pess()" (click)="setPess(true)">con locks</button>
          </div>
        </div>
      </div>

      <div class="board">
        <!-- cliente A -->
        <div class="client a" [class.ok]="cur()?.aState === 'ok'" [class.fail]="cur()?.aState === 'fail'"
             [class.wait]="cur()?.aState === 'wait'">
          <div class="c-head">💻 Cliente A</div>
          <div class="c-act">{{ cur()?.a ?? '—' }}</div>
          @if (cur()?.aRead) {
            <div class="c-read">leyó <strong>v{{ cur()!.aRead }}</strong></div>
          }
        </div>

        <!-- el dato -->
        <div class="data" [class.conflict]="cur()?.conflict">
          <div class="d-label">dato compartido</div>
          <div class="d-ver">v{{ cur()?.version ?? 1 }}</div>
          @if (pess()) {
            <div class="d-lock" [class.taken]="!!cur()?.lock">
              @if (cur()?.lock; as l) { 🔒 lock: {{ l }} } @else { 🔓 libre }
            </div>
          } @else {
            <div class="d-lock free">sin locks</div>
          }
          @if (cur()?.conflict) {
            <div class="d-conf">⚠️ versión leída ≠ versión actual</div>
          }
        </div>

        <!-- cliente B -->
        <div class="client b" [class.ok]="cur()?.bState === 'ok'" [class.fail]="cur()?.bState === 'fail'"
             [class.wait]="cur()?.bState === 'wait'">
          <div class="c-head">💻 Cliente B</div>
          <div class="c-act">{{ cur()?.b ?? '—' }}</div>
          @if (cur()?.bRead) {
            <div class="c-read">leyó <strong>v{{ cur()!.bRead }}</strong></div>
          }
        </div>
      </div>

      <div class="cmp">
        <div class="cmp-col" [class.on]="!pess()">
          <strong>Optimista</strong> · sin bloqueos, máximo paralelismo · detecta el conflicto
          <em>al commitear</em> · el perdedor <strong>rehace todo</strong>
        </div>
        <div class="cmp-col" [class.on]="pess()">
          <strong>Pesimista (2PL)</strong> · bloquea desde el principio · sin trabajo desperdiciado ·
          puede haber <strong>deadlocks</strong> y menos concurrencia
        </div>
      </div>

      <div class="status" [class.done]="finished()" [class.idle]="index() < 0">
        @if (index() >= 0 && !finished()) {
          <span class="stepno">{{ index() + 1 }}/{{ steps().length }}</span>
        }
        @if (finished()) { <span class="stepno ok">✔</span> }
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
    .mode.on { background: #1f6feb; color: #fff; }

    .board { display: grid; grid-template-columns: 1fr 0.85fr 1fr; gap: 12px; align-items: stretch; }
    .client { background: #10151f; border: 1.5px solid var(--border); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 6px; transition: border-color 0.25s, background 0.25s; }
    .client.ok { border-color: #2ea043; background: rgba(46, 160, 67, 0.06); }
    .client.fail { border-color: #ef5350; background: rgba(239, 83, 80, 0.08); }
    .client.wait { border-color: #6b4348; opacity: 0.8; }
    .c-head { font-weight: 800; font-size: 0.85rem; color: #fff; }
    .c-act { font-size: 0.9rem; color: var(--text); min-height: 22px; }
    .c-read { font-size: 0.7rem; color: var(--text-dim); font-family: Consolas, monospace; }
    .c-read strong { color: #ffd54f; }

    .data { background: radial-gradient(ellipse at 50% 40%, #202a40 0%, #171e2e 80%); border: 2px solid #39445f; border-radius: 10px; padding: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; transition: border-color 0.25s; }
    .data.conflict { border-color: #ef5350; }
    .d-label { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 1px; color: #5c6a8e; font-weight: 700; }
    .d-ver { font-family: Consolas, monospace; font-size: 2rem; font-weight: 800; color: #7ee787; line-height: 1.1; }
    .d-lock { font-size: 0.68rem; color: #5c6a8e; font-family: Consolas, monospace; }
    .d-lock.taken { color: #ffd54f; }
    .d-lock.free { font-style: italic; }
    .d-conf { font-size: 0.62rem; color: #ef9a9a; text-align: center; font-weight: 700; }

    .cmp { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
    .cmp-col { background: #10151f; border: 1px solid var(--border); border-radius: 9px; padding: 8px 12px; font-size: 0.74rem; color: #5c6a8e; line-height: 1.5; transition: border-color 0.2s, color 0.2s; }
    .cmp-col.on { border-color: #1f6feb; color: var(--text-dim); }
    .cmp-col.on strong { color: var(--text); }

    .status { display: flex; align-items: center; gap: 10px; margin-top: 12px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 11px 14px; min-height: 50px; font-size: 0.9rem; line-height: 1.5; }
    .status.done { border-color: #2ea04366; background: rgba(46, 160, 67, 0.1); }
    .status.idle { color: var(--text-dim); font-style: italic; }
    .stepno { flex-shrink: 0; background: #1f6feb; color: #fff; border-radius: 6px; font-size: 0.75rem; font-weight: 700; padding: 2px 8px; }
    .stepno.ok { background: #2ea043; }
    .dots { display: flex; gap: 6px; margin-top: 10px; justify-content: center; flex-wrap: wrap; }
    .dot { width: 12px; height: 12px; border-radius: 50%; border: 1px solid var(--border); background: var(--panel-2); cursor: pointer; padding: 0; transition: transform 0.15s; }
    .dot:hover { transform: scale(1.3); }
    .dot.past { background: #1f6feb; border-color: #1f6feb; }
    .dot.now { background: #ffd54f; border-color: #ffd54f; }

    @media (max-width: 720px) {
      .board { grid-template-columns: 1fr; }
      .cmp { grid-template-columns: 1fr; }
    }
  `,
})
export class OptimisticDetail extends SteppedAnim implements OnDestroy {
  readonly pess = signal(false);

  readonly steps = computed<Step[]>(() => (this.pess() ? PESSIMISTIC : OPTIMISTIC));

  protected stepCount(): number {
    return this.steps().length;
  }
  protected override stepTravel(_i: number): number {
    return 450;
  }
  protected override stepDwell(_i: number): number {
    return 3400;
  }

  readonly cur = computed<Step | null>(() => {
    const i = this.index();
    if (i < 0) return this.steps()[0];
    return this.finished() ? this.steps()[this.steps().length - 1] : this.steps()[i];
  });

  setPess(v: boolean): void {
    if (this.pess() === v) return;
    this.pess.set(v);
    this.reset();
  }

  readonly statusMsg = computed(() => {
    if (this.finished()) {
      return this.pess()
        ? '<strong>Cuándo conviene cada uno</strong>: el pesimista, cuando hay <strong>muchas escrituras sobre los mismos datos</strong> — abortar y rehacer sería carísimo.'
        : '<strong>Cuándo conviene cada uno</strong>: el optimista, cuando hay <strong>muchas más consultas que modificaciones</strong> — los conflictos son raros, así que casi nunca se paga el costo de rehacer. Es el modelo de Git/GitHub.';
    }
    const i = this.index();
    if (i < 0) {
      return 'Presioná ▶ Play. Escenario clásico: dos clientes leen el mismo dato y los dos quieren modificarlo.';
    }
    return this.steps()[i].msg;
  });

  ngOnDestroy(): void {
    this.destroy();
  }
}
