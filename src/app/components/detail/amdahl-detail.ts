import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

/**
 * Ley de Amdahl interactiva: speedup vs #cores para una fracción secuencial s.
 * Gráfico SVG puro con curva, asíntota 1/s, línea ideal y marcador movible.
 */
@Component({
  selector: 'app-amdahl-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="anim">
      <div class="head">
        <div class="titles">
          <div class="title">📈 Ley de Amdahl: el techo del speedup</div>
          <div class="caption">S(N) = 1 / (s + (1−s)/N) — jugá con la fracción secuencial.</div>
        </div>
      </div>

      <div class="sliders">
        <label>
          fracción secuencial s = <strong>{{ (s() * 100).toFixed(0) }}%</strong>
          <input type="range" min="1" max="50" step="1" [value]="s() * 100" (input)="setS($event)" />
        </label>
        <label>
          procesadores N = <strong>{{ n() }}</strong>
          <input type="range" min="0" max="6" step="1" [value]="log2n()" (input)="setN($event)" />
        </label>
      </div>

      <div class="chartwrap">
        <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" preserveAspectRatio="xMidYMid meet">
          <!-- grilla y ejes -->
          @for (gy of yTicks(); track gy) {
            <line [attr.x1]="PAD" [attr.y1]="yPos(gy)" [attr.x2]="W - 12" [attr.y2]="yPos(gy)" class="grid" />
            <text [attr.x]="PAD - 6" [attr.y]="yPos(gy) + 3" text-anchor="end" class="tick">{{ gy }}×</text>
          }
          @for (gx of X_TICKS; track gx) {
            <line [attr.x1]="xPos(gx)" [attr.y1]="12" [attr.x2]="xPos(gx)" [attr.y2]="H - PAD_B" class="grid" />
            <text [attr.x]="xPos(gx)" [attr.y]="H - PAD_B + 14" text-anchor="middle" class="tick">{{ gx }}</text>
          }
          <text [attr.x]="(PAD + W) / 2" [attr.y]="H - 4" text-anchor="middle" class="axis">procesadores (escala log)</text>
          <text [attr.x]="12" [attr.y]="(H - PAD_B) / 2" text-anchor="middle" class="axis" [attr.transform]="'rotate(-90 12 ' + (H - PAD_B) / 2 + ')'">speedup</text>

          <!-- ideal S = N -->
          <polyline [attr.points]="idealPts()" class="ideal" />
          <text [attr.x]="idealLabelX()" [attr.y]="idealLabelY()" class="ideal-t">ideal S=N</text>

          <!-- asíntota 1/s -->
          @if (asymptoteVisible()) {
            <line [attr.x1]="PAD" [attr.y1]="yPos(limit())" [attr.x2]="W - 12" [attr.y2]="yPos(limit())" class="asym" />
            <text [attr.x]="W - 14" [attr.y]="yPos(limit()) - 5" text-anchor="end" class="asym-t">
              techo 1/s = {{ limit().toFixed(1) }}×
            </text>
          }

          <!-- curva de Amdahl -->
          <polyline [attr.points]="curvePts()" class="curve" />

          <!-- marcador N -->
          <circle [attr.cx]="xPos(n())" [attr.cy]="yPos(speedupAt(n()))" r="5" class="marker" />
          <text [attr.x]="markerLabelX()" [attr.y]="yPos(speedupAt(n())) - 10" [attr.text-anchor]="markerAnchor()" class="marker-t">
            {{ n() }} cores → {{ speedupAt(n()).toFixed(2) }}×
          </text>
        </svg>
      </div>

      <div class="readouts">
        <div class="ro">
          <span class="ro-label">speedup con {{ n() }} cores</span>
          <span class="ro-val">{{ speedupAt(n()).toFixed(2) }}×</span>
        </div>
        <div class="ro">
          <span class="ro-label">eficiencia (S/N)</span>
          <span class="ro-val" [class.bad-v]="efficiency() < 50">{{ efficiency().toFixed(0) }}%</span>
        </div>
        <div class="ro">
          <span class="ro-label">techo con ∞ cores</span>
          <span class="ro-val hot">{{ limit().toFixed(1) }}×</span>
        </div>
        <div class="ro-note">
          Duplicar de {{ n() }} a {{ n() * 2 <= 64 ? n() * 2 : 128 }} cores te da
          <strong>+{{ marginalGain().toFixed(1) }}%</strong> de mejora
          {{ marginalGain() < 10 ? '— casi nada: la parte secuencial ya domina' : '' }}
        </div>
      </div>
    </div>
  `,
  styles: `
    .anim { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin: 18px 0; }
    .head { margin-bottom: 10px; }
    .title { font-weight: 700; font-size: 1.02rem; color: #fff; }
    .caption { color: var(--text-dim); font-size: 0.85rem; margin-top: 2px; }

    .sliders { display: flex; gap: 26px; flex-wrap: wrap; margin-bottom: 12px; }
    .sliders label { display: flex; align-items: center; gap: 10px; font-size: 0.84rem; color: var(--text-dim); }
    .sliders strong { color: #ffd54f; font-family: Consolas, monospace; min-width: 42px; display: inline-block; }
    .sliders input { accent-color: var(--accent); width: 180px; }

    .chartwrap { background: #10151f; border: 1px solid var(--border); border-radius: 10px; padding: 6px; }
    svg { width: 100%; height: auto; display: block; }
    .grid { stroke: #232b3e; stroke-width: 1; }
    .tick { fill: #5c6a8e; font-size: 10px; font-family: Consolas, monospace; }
    .axis { fill: #9aa4bf; font-size: 10px; }
    .curve { fill: none; stroke: #f0883e; stroke-width: 2.5; }
    .ideal { fill: none; stroke: #2ea043; stroke-width: 1.4; stroke-dasharray: 5 4; opacity: 0.8; }
    .ideal-t { fill: #7ee787; font-size: 10px; }
    .asym { stroke: #ef5350; stroke-width: 1.4; stroke-dasharray: 5 4; }
    .asym-t { fill: #ef9a9a; font-size: 10px; font-family: Consolas, monospace; }
    .marker { fill: #ffd54f; stroke: #0d1117; stroke-width: 1.5; }
    .marker-t { fill: #ffd54f; font-size: 11px; font-weight: 700; font-family: Consolas, monospace; }

    .readouts { display: flex; gap: 10px; margin-top: 12px; flex-wrap: wrap; align-items: center; }
    .ro { background: #10151f; border: 1px solid var(--border); border-radius: 9px; padding: 8px 14px; display: flex; flex-direction: column; }
    .ro-label { font-size: 0.68rem; color: var(--text-dim); }
    .ro-val { font-family: Consolas, monospace; font-weight: 800; font-size: 1.15rem; color: #7ee787; }
    .ro-val.bad-v { color: #ef9a9a; }
    .ro-val.hot { color: #ef9a9a; }
    .ro-note { flex: 1; min-width: 200px; font-size: 0.8rem; color: var(--text-dim); line-height: 1.5; }
    .ro-note strong { color: #ffd54f; font-family: Consolas, monospace; }
  `,
})
export class AmdahlDetail {
  readonly W = 640;
  readonly H = 320;
  readonly PAD = 44;
  readonly PAD_B = 34;
  readonly X_TICKS = [1, 2, 4, 8, 16, 32, 64];

  readonly s = signal(0.05);
  readonly n = signal(8);

  log2n(): number {
    return Math.round(Math.log2(this.n()));
  }

  setS(ev: Event): void {
    this.s.set(+(ev.target as HTMLInputElement).value / 100);
  }
  setN(ev: Event): void {
    this.n.set(2 ** +(ev.target as HTMLInputElement).value);
  }

  speedupAt(nn: number): number {
    const s = this.s();
    return 1 / (s + (1 - s) / nn);
  }

  readonly limit = computed(() => 1 / this.s());
  readonly efficiency = computed(() => (this.speedupAt(this.n()) / this.n()) * 100);
  readonly marginalGain = computed(() => {
    const cur = this.speedupAt(this.n());
    const dbl = this.speedupAt(Math.min(this.n() * 2, 128));
    return ((dbl - cur) / cur) * 100;
  });

  /** techo del eje y: potencia de 2 que cubra la curva y (si entra) la asíntota */
  readonly yMax = computed(() => {
    const top = Math.max(this.speedupAt(64) * 1.25, 4);
    return Math.min(64, 2 ** Math.ceil(Math.log2(top)));
  });

  readonly yTicks = computed(() => {
    const out: number[] = [];
    for (let v = 1; v <= this.yMax(); v *= 2) out.push(v);
    return out;
  });

  xPos(nn: number): number {
    const t = Math.log2(nn) / 6; // 1..64 → 0..1
    return this.PAD + t * (this.W - 12 - this.PAD);
  }
  yPos(sp: number): number {
    const t = sp / this.yMax();
    return this.H - this.PAD_B - t * (this.H - this.PAD_B - 12);
  }

  readonly curvePts = computed(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 60; i++) {
      const nn = 2 ** ((i / 60) * 6);
      pts.push(`${this.xPos(nn).toFixed(1)},${this.yPos(this.speedupAt(nn)).toFixed(1)}`);
    }
    return pts.join(' ');
  });

  readonly idealPts = computed(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 60; i++) {
      const nn = 2 ** ((i / 60) * 6);
      if (nn > this.yMax()) break;
      pts.push(`${this.xPos(nn).toFixed(1)},${this.yPos(nn).toFixed(1)}`);
    }
    return pts.join(' ');
  });

  readonly asymptoteVisible = computed(() => this.limit() <= this.yMax());

  idealLabelX(): number {
    return this.xPos(Math.min(this.yMax(), 64)) - 8;
  }
  idealLabelY(): number {
    return this.yPos(Math.min(this.yMax(), 64)) + 12;
  }
  markerAnchor(): string {
    return this.n() >= 32 ? 'end' : 'start';
  }
  markerLabelX(): number {
    return this.xPos(this.n()) + (this.n() >= 32 ? -8 : 8);
  }
}
