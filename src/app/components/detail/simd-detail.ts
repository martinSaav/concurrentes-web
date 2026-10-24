import { ChangeDetectionStrategy, Component, OnDestroy, computed, signal } from '@angular/core';
import { SteppedAnim } from './stepped';

/** 8 píxeles RGB de muestra (como los de totk.jpg del repo) */
const PIXELS: [number, number, number][] = [
  [214, 180, 72],
  [96, 158, 66],
  [240, 236, 228],
  [62, 110, 190],
  [190, 70, 60],
  [140, 120, 210],
  [30, 60, 40],
  [250, 210, 120],
];
const W = [0.299, 0.587, 0.114, 0];

const gray = (p: [number, number, number]) => Math.round(p[0] * W[0] + p[1] * W[1] + p[2] * W[2]);

interface Step {
  /** qué se muestra en los registros: 0 nada, 1 cargado, 2 multiplicado, 3 reducido */
  stage: number;
  /** cuántos píxeles de salida ya están calculados */
  done: number;
  /** instrucciones acumuladas hasta este paso */
  instr: number;
  /** en escalar: qué lane se está procesando (-1 ninguno) */
  lane: number;
  msg: string;
}

const SIMD_STEPS: Step[] = [
  { stage: 0, done: 0, instr: 0, lane: -1, msg: 'Queremos pasar una imagen a <strong>escala de grises</strong>: para cada píxel, <span class="formula">gris = 0.299·R + 0.587·G + 0.114·B</span>. Es el ejemplo de la práctica, y es ideal para vectorizar: el mismo cómputo simple sobre millones de datos independientes.' },
  { stage: 1, done: 0, instr: 1, lane: -1, msg: '<code>vld1q_f32</code>: se <strong>carga el píxel en un registro vectorial</strong> de 128 bits, dividido en <strong>4 lanes</strong> de un float de 32 bits cada uno: R, G, B y A. El registro de pesos ya está cargado de antes.' },
  { stage: 2, done: 0, instr: 2, lane: -1, msg: '<code>vmulq_f32</code>: <strong>una sola instrucción multiplica los 4 lanes a la vez</strong>, cada uno contra su peso. Es una operación <strong>vertical</strong>: entre dos registros, lane por lane (R con 0.299, G con 0.587…).' },
  { stage: 3, done: 1, instr: 3, lane: -1, msg: '<code>vaddvq_f32</code>: una operación <strong>horizontal</strong> que reduce el vector a un escalar sumando sus lanes. Las horizontales son <strong>más lentas</strong> que las verticales, pero siguen siendo una sola instrucción.' },
  { stage: 3, done: 8, instr: 24, lane: -1, msg: 'Así para cada píxel: <strong>3 instrucciones por píxel</strong> (cargar, multiplicar, reducir) contra las 6 de la versión escalar. El código del repo va más lejos: carga <strong>8 píxeles por iteración</strong> con <code>vld1q_f32_x4</code> y escribe los 8 resultados juntos con <code>vst1_u8</code>.' },
];

const SCALAR_STEPS: Step[] = [
  { stage: 0, done: 0, instr: 0, lane: -1, msg: 'La versión <strong>escalar</strong> (<code>base.rs</code>): la CPU opera <strong>un número por instrucción</strong>, en registros comunes.' },
  { stage: 1, done: 0, instr: 1, lane: 0, msg: '<strong>R × 0.299</strong>: una instrucción para un solo valor.' },
  { stage: 1, done: 0, instr: 2, lane: 1, msg: '<strong>G × 0.587</strong>: otra instrucción.' },
  { stage: 1, done: 0, instr: 3, lane: 2, msg: '<strong>B × 0.114</strong>: otra más.' },
  { stage: 3, done: 1, instr: 6, lane: -1, msg: 'Y <strong>dos sumas</strong> para juntar los productos (más la carga de los valores): ~<strong>6 instrucciones por píxel</strong>, procesando un valor por vez.' },
  { stage: 3, done: 8, instr: 48, lane: -1, msg: 'Para 8 píxeles, <strong>~48 instrucciones</strong>. La SIMD hace el mismo trabajo con la mitad, y con registros de 512 bits (AVX-512) entran 16 floats por instrucción.' },
];

/**
 * Vectorización SIMD sobre el ejemplo de la práctica (escala de grises):
 * registro de 4 lanes, multiplicación vertical y reducción horizontal,
 * contra la versión escalar que opera de a un valor.
 */
@Component({
  selector: 'app-simd-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="anim">
      <div class="head">
        <div class="titles">
          <div class="title">🧮 SIMD: una instrucción, varios datos</div>
          <div class="caption">Escala de grises como en <code>simd.rs</code>: el mismo cómputo sobre los 4 canales de un píxel a la vez.</div>
        </div>
        <div class="controls">
          <button class="ctl" (click)="prev()" [disabled]="index() < 0">⏮</button>
          <button class="ctl play" (click)="toggle()">
            {{ playing() ? '⏸ Pausa' : finished() ? '↺ Repetir' : '▶ Play' }}
          </button>
          <button class="ctl" (click)="next()" [disabled]="finished()">⏭</button>
          <div class="modes">
            <button class="mode" [class.on]="!simd()" (click)="setSimd(false)">escalar</button>
            <button class="mode" [class.on]="simd()" (click)="setSimd(true)">SIMD</button>
          </div>
        </div>
      </div>

      <div class="board">
        <!-- imagen de entrada / salida -->
        <div class="imgs">
          <div class="img-row">
            <span class="il">entrada</span>
            @for (p of pixels; track $index; let i = $index) {
              <span class="px" [class.cur]="i === 0 && cur().stage > 0 && cur().done < 8" [style.background]="rgb(p)"></span>
            }
          </div>
          <div class="img-row">
            <span class="il">salida</span>
            @for (p of pixels; track $index; let i = $index) {
              <span class="px out" [style.background]="i < cur().done ? grayCss(p) : null"></span>
            }
          </div>
        </div>

        <!-- registros -->
        <div class="regs">
          <div class="reg-row">
            <span class="rl">{{ simd() ? 'v0 (píxel)' : 'valores' }}</span>
            @for (v of lanesIn(); track $index; let i = $index) {
              <span class="lane" [class.on]="cur().stage >= 1" [class.hot]="!simd() && cur().lane === i"
                    [class.dim]="!simd() && cur().stage >= 1 && cur().lane !== i && cur().lane !== -1">{{ cur().stage >= 1 ? v : '·' }}</span>
            }
            @if (simd()) { <span class="bits">128 bits = 4 × f32</span> }
          </div>
          <div class="op">{{ simd() ? '× (vertical, lane por lane)' : '× (de a uno)' }}</div>
          <div class="reg-row">
            <span class="rl">{{ simd() ? 'v1 (pesos)' : 'pesos' }}</span>
            @for (w of weights; track $index; let i = $index) {
              <span class="lane w" [class.on]="true" [class.hot]="!simd() && cur().lane === i">{{ w }}</span>
            }
          </div>
          <div class="op">=</div>
          <div class="reg-row">
            <span class="rl">{{ simd() ? 'v2 (productos)' : 'productos' }}</span>
            @for (v of products(); track $index; let i = $index) {
              <span class="lane prod" [class.on]="showProd(i)">{{ showProd(i) ? v : '·' }}</span>
            }
          </div>
          <div class="op">{{ simd() ? 'Σ (horizontal: reduce a un escalar)' : '+ + (dos sumas)' }}</div>
          <div class="reg-row">
            <span class="rl">gris</span>
            <span class="lane result" [class.on]="cur().stage >= 3">{{ cur().stage >= 3 ? g0 : '·' }}</span>
          </div>
        </div>

        <!-- contador -->
        <div class="side">
          <div class="p-title">instrucciones</div>
          <div class="big" [class.good]="simd()">{{ cur().instr }}</div>
          <div class="p-note">para <strong>{{ cur().done }}</strong> de 8 píxeles</div>
          <div class="cmp">
            <div class="cmp-row"><span>escalar</span><span class="bar"><span class="fill sc" style="width: 100%"></span></span><b>48</b></div>
            <div class="cmp-row"><span>SIMD</span><span class="bar"><span class="fill sd" style="width: 50%"></span></span><b>24</b></div>
          </div>
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

    .board { display: grid; grid-template-columns: auto 1fr 170px; gap: 12px; align-items: stretch; }
    .board > * { min-width: 0; }
    .imgs { background: #10151f; border: 1px solid var(--border); border-radius: 10px; padding: 10px; display: flex; flex-direction: column; justify-content: center; gap: 10px; }
    .img-row { display: flex; align-items: center; gap: 4px; }
    .il { font-size: 0.64rem; color: #5c6a8e; width: 46px; text-transform: uppercase; letter-spacing: 1px; }
    .px { width: 20px; height: 20px; border-radius: 3px; border: 1px solid #0b0f19; }
    .px.cur { outline: 2px solid #ffd54f; outline-offset: 1px; }
    .px.out { background: #1a2132; border: 1px dashed #39445f; transition: background 0.3s; }

    .regs { background: radial-gradient(ellipse at 50% 45%, #202a40 0%, #171e2e 80%); border: 1px solid var(--border); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 4px; }
    .reg-row { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
    .rl { font-size: 0.66rem; color: var(--text-dim); width: 96px; font-family: Consolas, monospace; }
    .lane { min-width: 56px; text-align: center; padding: 5px 4px; background: #0b0f19; border: 1px solid #2d3750; border-radius: 4px; font-family: Consolas, monospace; font-size: 0.74rem; color: #5c6a8e; transition: all 0.3s; }
    .lane.on { color: var(--text); border-color: #58a6ff88; }
    .lane.w.on { border-color: #a78bfa88; color: #d2b9ff; }
    .lane.prod.on { border-color: #ffd54f88; color: #ffd54f; }
    .lane.result.on { border-color: #2ea043; color: #7ee787; font-weight: 800; }
    .lane.hot { background: #2a2a1a; border-color: #ffd54f; color: #fff; }
    .lane.dim { opacity: 0.35; }
    .bits { font-size: 0.6rem; color: #5c6a8e; margin-left: 4px; }
    .op { font-size: 0.66rem; color: #8b95b5; padding-left: 100px; }

    .side { background: #10151f; border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
    .p-title { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 1px; color: #5c6a8e; font-weight: 700; }
    .big { font-family: Consolas, monospace; font-size: 2rem; font-weight: 800; color: #ef9a9a; line-height: 1.2; }
    .big.good { color: #7ee787; }
    .p-note { font-size: 0.72rem; color: var(--text-dim); }
    .p-note strong { color: var(--text); }
    .cmp { margin-top: 10px; display: flex; flex-direction: column; gap: 5px; }
    .cmp-row { display: grid; grid-template-columns: 44px 1fr 22px; gap: 6px; align-items: center; font-size: 0.66rem; color: var(--text-dim); }
    .cmp-row b { font-family: Consolas, monospace; color: var(--text); text-align: right; }
    .bar { height: 7px; background: #0b0f19; border-radius: 4px; overflow: hidden; display: block; }
    .fill { display: block; height: 100%; }
    .fill.sc { background: #ef5350; }
    .fill.sd { background: #2ea043; }

    .status { display: flex; align-items: center; gap: 10px; margin-top: 12px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 11px 14px; min-height: 50px; font-size: 0.92rem; line-height: 1.5; }
    .status.done { border-color: #2ea04366; background: rgba(46, 160, 67, 0.1); }
    .status.idle { color: var(--text-dim); font-style: italic; }
    .stepno { flex-shrink: 0; background: #1f6feb; color: #fff; border-radius: 6px; font-size: 0.75rem; font-weight: 700; padding: 2px 8px; }
    .stepno.ok { background: #2ea043; }
    .dots { display: flex; gap: 6px; margin-top: 10px; justify-content: center; flex-wrap: wrap; }
    .dot { width: 12px; height: 12px; border-radius: 50%; border: 1px solid var(--border); background: var(--panel-2); cursor: pointer; padding: 0; transition: transform 0.15s; }
    .dot:hover { transform: scale(1.3); }
    .dot.past { background: #1f6feb; border-color: #1f6feb; }
    .dot.now { background: #ffd54f; border-color: #ffd54f; }

    @media (max-width: 900px) {
      .board { grid-template-columns: 1fr; }
      .op { padding-left: 0; }
    }
  `,
})
export class SimdDetail extends SteppedAnim implements OnDestroy {
  readonly pixels = PIXELS;
  readonly weights = W.map((w) => w.toFixed(3));
  readonly g0 = gray(PIXELS[0]);

  readonly simd = signal(true);
  readonly steps = computed(() => (this.simd() ? SIMD_STEPS : SCALAR_STEPS));

  protected stepCount(): number {
    return this.steps().length;
  }
  protected override stepTravel(_i: number): number {
    return 450;
  }
  protected override stepDwell(_i: number): number {
    return 4000;
  }

  readonly cur = computed<Step>(() => {
    const s = this.steps();
    if (this.finished()) return s[s.length - 1];
    return s[Math.max(this.index(), 0)];
  });

  /** los 4 lanes del píxel 0: R, G, B y A (A = 255, su peso es 0) */
  readonly lanesIn = computed(() => [...PIXELS[0], 255].map((v) => v.toFixed(0)));
  readonly products = computed(() => [...PIXELS[0], 255].map((v, i) => (v * W[i]).toFixed(1)));

  /** en SIMD los 4 productos aparecen juntos; en escalar, de a uno */
  showProd(i: number): boolean {
    const c = this.cur();
    if (this.simd()) return c.stage >= 2;
    if (c.stage >= 3) return i < 3;
    return c.lane >= i && i < 3;
  }

  setSimd(v: boolean): void {
    if (this.simd() === v) return;
    this.simd.set(v);
    this.reset();
  }

  rgb(p: [number, number, number]): string {
    return `rgb(${p[0]}, ${p[1]}, ${p[2]})`;
  }
  grayCss(p: [number, number, number]): string {
    const g = gray(p);
    return `rgb(${g}, ${g}, ${g})`;
  }

  readonly statusMsg = computed(() => {
    const s = this.steps();
    if (this.finished()) return s[s.length - 1].msg;
    const i = this.index();
    if (i < 0) return 'Presioná ▶ Play. Mirá primero la versión <strong>escalar</strong> y después la <strong>SIMD</strong>: el resultado es idéntico, cambia cuántas instrucciones hacen falta.';
    return s[i].msg;
  });

  ngOnDestroy(): void {
    this.destroy();
  }
}
