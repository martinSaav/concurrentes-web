import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

type Mode = 'none' | 'shared' | 'private';

/**
 * Mapa de memoria: proceso single-threaded vs multithreaded.
 * code/data/files (y el heap) se COMPARTEN; registers y stack son
 * privados de cada hilo. Resaltable y con cantidad de hilos ajustable.
 */
@Component({
  selector: 'app-memory-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="anim">
      <div class="head">
        <div class="titles">
          <div class="title">🧠 Mapa de memoria: un hilo vs muchos hilos</div>
          <div class="caption">
            Qué comparten y qué NO comparten los hilos de un mismo proceso.
          </div>
        </div>
        <div class="controls">
          <div class="modes">
            <button class="mode sh" [class.on]="mode() === 'shared'" (click)="setMode('shared')">
              resaltar compartido
            </button>
            <button class="mode pv" [class.on]="mode() === 'private'" (click)="setMode('private')">
              resaltar privado
            </button>
          </div>
          <label class="slider">
            hilos: <strong>{{ n() }}</strong>
            <input type="range" min="2" max="4" [value]="n()" (input)="setN($event)" />
          </label>
        </div>
      </div>

      <div class="canvas">
        <svg [attr.viewBox]="'0 0 100 ' + H" preserveAspectRatio="xMidYMid meet">
          <!-- ============ proceso single-threaded ============ -->
          <g>
            <rect x="3" y="4" width="41" height="52" rx="1.5" class="proc" />

            <!-- code / data / files -->
            @for (seg of segs; track seg.label; let i = $index) {
              <g [class.dim]="mode() === 'private'" [class.hot]="mode() === 'shared'">
                <rect [attr.x]="5.5 + i * 12.8" y="6.5" width="11.5" height="6" rx="1" class="cell shared" />
                <text [attr.x]="11.25 + i * 12.8" y="10.7" text-anchor="middle" class="cl">{{ seg.label }}</text>
              </g>
            }

            <!-- registers / stack -->
            <g [class.dim]="mode() === 'shared'" [class.hot]="mode() === 'private'">
              <rect x="5.5" y="14.5" width="17" height="6" rx="1" class="cell private" />
              <text x="14" y="18.7" text-anchor="middle" class="cl">registers</text>
              <rect x="24.5" y="14.5" width="17" height="6" rx="1" class="cell private" />
              <text x="33" y="18.7" text-anchor="middle" class="cl">stack</text>
            </g>

            <!-- el hilo -->
            <path [attr.d]="squiggle(23.5, 27)" class="thread" />
            <text x="7" y="40" class="lbl">thread →</text>
            <text x="23.5" y="59.5" text-anchor="middle" class="cap">single-threaded process</text>
          </g>

          <!-- ============ proceso multithreaded ============ -->
          <g>
            <rect x="52" y="4" width="45" height="52" rx="1.5" class="proc" />

            <!-- code / data / files (compartidos: ocupan todo el ancho) -->
            @for (seg of segs; track seg.label; let i = $index) {
              <g [class.dim]="mode() === 'private'" [class.hot]="mode() === 'shared'">
                <rect [attr.x]="54.5 + i * 14.1" y="6.5" width="12.8" height="6" rx="1" class="cell shared" />
                <text [attr.x]="60.9 + i * 14.1" y="10.7" text-anchor="middle" class="cl">{{ seg.label }}</text>
              </g>
            }

            <!-- registers / stack: uno por hilo -->
            <g [class.dim]="mode() === 'shared'" [class.hot]="mode() === 'private'">
              @for (t of threads(); track t; let i = $index) {
                <rect [attr.x]="colX(i)" y="14.5" [attr.width]="colW()" height="5.4" rx="1" class="cell private" />
                <text [attr.x]="colX(i) + colW() / 2" y="18.4" text-anchor="middle" class="cl sm">registers</text>
                <rect [attr.x]="colX(i)" y="21.2" [attr.width]="colW()" height="5.4" rx="1" class="cell private" />
                <text [attr.x]="colX(i) + colW() / 2" y="25.1" text-anchor="middle" class="cl sm">stack</text>
              }
            </g>

            <!-- separadores verticales + hilos -->
            @for (t of threads(); track t; let i = $index) {
              @if (i > 0) {
                <line [attr.x1]="colX(i) - 0.9" y1="28.5" [attr.x2]="colX(i) - 0.9" y2="54" class="sep" />
              }
              <path [attr.d]="squiggle(colX(i) + colW() / 2, 30)" class="thread" />
            }
            <text x="74.5" y="59.5" text-anchor="middle" class="cap">multithreaded process</text>
          </g>
        </svg>
      </div>

      <div class="legend">
        <span class="lg sharedk">■ compartido por todos los hilos</span>
        <span class="lg privatek">■ privado de cada hilo</span>
      </div>

      <div class="status">
        <span [innerHTML]="statusMsg()"></span>
      </div>
    </div>
  `,
  styles: `
    .anim { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin: 18px 0; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
    .title { font-weight: 700; font-size: 1.02rem; color: #fff; }
    .caption { color: var(--text-dim); font-size: 0.85rem; margin-top: 2px; }
    .controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .modes { display: flex; background: var(--panel-2); border: 1px solid var(--border); border-radius: 8px; padding: 2px; gap: 2px; }
    .mode { background: transparent; border: none; color: var(--text-dim); border-radius: 6px; padding: 6px 10px; cursor: pointer; font-size: 0.78rem; font-weight: 600; }
    .mode.sh.on { background: #2ea043; color: #fff; }
    .mode.pv.on { background: #8957e5; color: #fff; }
    .slider { display: flex; align-items: center; gap: 8px; font-size: 0.8rem; color: var(--text-dim); }
    .slider strong { color: var(--text); font-family: Consolas, monospace; }
    .slider input { accent-color: var(--accent); width: 90px; }

    .canvas { background: radial-gradient(ellipse at 50% 45%, #202a40 0%, #171e2e 80%); border: 1px solid var(--border); border-radius: 10px; padding: 8px; }
    svg { width: 100%; height: auto; display: block; }

    .proc { fill: #10151f; stroke: #39445f; stroke-width: 0.4; }
    .cell { stroke-width: 0.35; transition: fill 0.25s, stroke 0.25s; }
    .cell.shared { fill: #1a2132; stroke: #4a5570; }
    .cell.private { fill: #1a2132; stroke: #4a5570; }
    .cl { fill: #c8d0e4; font-size: 2.6px; font-family: 'Segoe UI', sans-serif; }
    .cl.sm { font-size: 2.2px; }
    .cap { fill: #9aa4bf; font-size: 2.7px; }
    .lbl { fill: #9aa4bf; font-size: 2.7px; }
    .thread { fill: none; stroke: #58a6ff; stroke-width: 0.65; stroke-linecap: round; }
    .sep { stroke: #39445f; stroke-width: 0.35; }

    g.hot .cell.shared { fill: #16281c; stroke: #2ea043; }
    g.hot .cell.private { fill: #241a33; stroke: #8957e5; }
    g.dim { opacity: 0.32; }

    .legend { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 10px; font-size: 0.76rem; }
    .lg.sharedk { color: #7ee787; }
    .lg.privatek { color: #d2b9ff; }

    .status { margin-top: 10px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; font-size: 0.85rem; line-height: 1.55; min-height: 46px; }
  `,
})
export class MemoryDetail {
  readonly H = 62;
  readonly segs = [{ label: 'code' }, { label: 'data' }, { label: 'files' }];

  readonly mode = signal<Mode>('none');
  readonly n = signal(3);

  readonly threads = computed(() => Array.from({ length: this.n() }, (_, i) => i));

  setMode(m: Mode): void {
    this.mode.update((cur) => (cur === m ? 'none' : m));
  }

  setN(ev: Event): void {
    this.n.set(+(ev.target as HTMLInputElement).value);
  }

  /** ancho de cada columna de hilo en el proceso multithreaded */
  colW(): number {
    const usable = 41; // ancho interno útil
    const gap = 1.6;
    return (usable - gap * (this.n() - 1)) / this.n();
  }
  colX(i: number): number {
    return 54 + i * (this.colW() + 1.6);
  }

  /** serpentina vertical que representa el flujo de ejecución de un hilo */
  squiggle(cx: number, y0: number): string {
    let d = `M ${cx.toFixed(1)} ${y0}`;
    for (let k = 0; k < 4; k++) {
      const dir = k % 2 === 0 ? 2.6 : -2.6;
      d += ` q ${dir} 2.9 0 5.8`;
    }
    return d;
  }

  readonly statusMsg = computed(() => {
    switch (this.mode()) {
      case 'shared':
        return '<strong>Compartido</strong>: el <code>code</code> (las instrucciones), la <code>data</code> (variables globales), los <code>files</code> abiertos y el <strong>heap</strong>. Todos los hilos ven exactamente la misma memoria → si uno escribe mientras otro lee, hay <strong>race condition</strong>. Acá es donde hacen falta mutex, semáforos y monitores.';
      case 'private':
        return '<strong>Privado</strong>: cada hilo tiene sus propios <code>registers</code> (su contexto de ejecución) y su propio <code>stack</code> (variables locales, dirección de retorno, temporales). Por eso pueden ejecutar funciones distintas al mismo tiempo — y por eso el <strong>context switch</strong> tiene que guardar y restaurar todo eso.';
      default:
        return 'Un proceso single-threaded tiene <strong>un</strong> flujo de ejecución; uno multithreaded tiene varios sobre <strong>la misma memoria</strong>. Tocá los botones para ver qué se comparte y qué no — de ahí sale toda la necesidad de sincronización.';
    }
  });
}
