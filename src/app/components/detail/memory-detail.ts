import { ChangeDetectionStrategy, Component } from '@angular/core';

const N = 3; // hilos del proceso multithreaded

/**
 * Mapa de memoria: proceso single-threaded vs multithreaded.
 * Diagrama estático: en verde lo que comparten todos los hilos
 * (code/data/files), en violeta lo privado de cada hilo (registers/stack).
 */
@Component({
  selector: 'app-memory-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="anim">
      <div class="head">
        <div class="title">🧠 Mapa de memoria: un hilo vs muchos hilos</div>
        <div class="caption">Qué comparten y qué NO comparten los hilos de un mismo proceso.</div>
      </div>

      <div class="canvas">
        <svg viewBox="0 0 100 62" preserveAspectRatio="xMidYMid meet">
          <!-- ============ proceso single-threaded ============ -->
          <rect x="3" y="4" width="41" height="52" rx="1.5" class="proc" />
          @for (seg of segs; track seg; let i = $index) {
            <rect [attr.x]="5.5 + i * 12.8" y="6.5" width="11.5" height="6" rx="1" class="cell shared" />
            <text [attr.x]="11.25 + i * 12.8" y="10.7" text-anchor="middle" class="cl">{{ seg }}</text>
          }
          <rect x="5.5" y="14.5" width="17" height="6" rx="1" class="cell private" />
          <text x="14" y="18.7" text-anchor="middle" class="cl">registers</text>
          <rect x="24.5" y="14.5" width="17" height="6" rx="1" class="cell private" />
          <text x="33" y="18.7" text-anchor="middle" class="cl">stack</text>
          <path [attr.d]="squiggle(23.5, 27)" class="thread" />
          <text x="7" y="40" class="lbl">thread →</text>
          <text x="23.5" y="59.5" text-anchor="middle" class="cap">single-threaded process</text>

          <!-- ============ proceso multithreaded ============ -->
          <rect x="52" y="4" width="45" height="52" rx="1.5" class="proc" />
          @for (seg of segs; track seg; let i = $index) {
            <rect [attr.x]="54.5 + i * 14.1" y="6.5" width="12.8" height="6" rx="1" class="cell shared" />
            <text [attr.x]="60.9 + i * 14.1" y="10.7" text-anchor="middle" class="cl">{{ seg }}</text>
          }
          @for (t of threads; track t) {
            <rect [attr.x]="colX(t)" y="14.5" [attr.width]="colW" height="5.4" rx="1" class="cell private" />
            <text [attr.x]="colX(t) + colW / 2" y="18.4" text-anchor="middle" class="cl sm">registers</text>
            <rect [attr.x]="colX(t)" y="21.2" [attr.width]="colW" height="5.4" rx="1" class="cell private" />
            <text [attr.x]="colX(t) + colW / 2" y="25.1" text-anchor="middle" class="cl sm">stack</text>
            @if (t > 0) {
              <line [attr.x1]="colX(t) - 0.9" y1="28.5" [attr.x2]="colX(t) - 0.9" y2="54" class="sep" />
            }
            <path [attr.d]="squiggle(colX(t) + colW / 2, 30)" class="thread" />
          }
          <text x="74.5" y="59.5" text-anchor="middle" class="cap">multithreaded process</text>
        </svg>
      </div>

      <div class="keys">
        <div class="key shared-k">
          <span class="sw"></span>
          <div>
            <strong>Compartido por todos los hilos</strong>: el <code>code</code> (las instrucciones),
            la <code>data</code> (variables globales), los <code>files</code> abiertos y el
            <strong>heap</strong>. Todos ven la misma memoria → si uno escribe mientras otro lee, hay
            <strong>race condition</strong>. Acá hacen falta mutex, semáforos y monitores.
          </div>
        </div>
        <div class="key private-k">
          <span class="sw"></span>
          <div>
            <strong>Privado de cada hilo</strong>: sus <code>registers</code> (contexto de ejecución) y
            su <code>stack</code> (variables locales, dirección de retorno, temporales). Por eso cada
            hilo puede ejecutar algo distinto, y por eso el <strong>context switch</strong> tiene que
            guardar y restaurar todo esto.
          </div>
        </div>
      </div>
    </div>
  `,
  styles: `
    .anim { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin: 18px 0; }
    .head { margin-bottom: 12px; }
    .title { font-weight: 700; font-size: 1.02rem; color: #fff; }
    .caption { color: var(--text-dim); font-size: 0.85rem; margin-top: 2px; }

    .canvas { background: radial-gradient(ellipse at 50% 45%, #202a40 0%, #171e2e 80%); border: 1px solid var(--border); border-radius: 10px; padding: 8px; }
    svg { width: 100%; max-width: 640px; height: auto; display: block; margin: 0 auto; }

    .proc { fill: #10151f; stroke: #39445f; stroke-width: 0.4; }
    .cell { stroke-width: 0.4; }
    .cell.shared { fill: #16281c; stroke: #2ea043; }
    .cell.private { fill: #241a33; stroke: #8957e5; }
    .cl { fill: #e6e9f0; font-size: 2.6px; font-family: 'Segoe UI', sans-serif; }
    .cl.sm { font-size: 2.2px; }
    .cap { fill: #9aa4bf; font-size: 2.7px; }
    .lbl { fill: #9aa4bf; font-size: 2.7px; }
    .thread { fill: none; stroke: #58a6ff; stroke-width: 0.65; stroke-linecap: round; }
    .sep { stroke: #39445f; stroke-width: 0.35; }

    .keys { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
    .key { display: flex; gap: 10px; align-items: flex-start; background: #10151f; border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; font-size: 0.82rem; line-height: 1.55; color: var(--text); }
    .key strong { color: #fff; }
    .sw { flex-shrink: 0; width: 14px; height: 14px; border-radius: 3px; margin-top: 3px; border: 1.5px solid; }
    .shared-k { border-left: 3px solid #2ea043; }
    .shared-k .sw { background: #16281c; border-color: #2ea043; }
    .private-k { border-left: 3px solid #8957e5; }
    .private-k .sw { background: #241a33; border-color: #8957e5; }

    @media (max-width: 720px) {
      .keys { grid-template-columns: 1fr; }
    }
  `,
})
export class MemoryDetail {
  readonly segs = ['code', 'data', 'files'];
  readonly threads = Array.from({ length: N }, (_, i) => i);

  /** ancho de cada columna de hilo en el proceso multithreaded */
  readonly colW = (41 - 1.6 * (N - 1)) / N;
  colX(i: number): number {
    return 54 + i * (this.colW + 1.6);
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
}
