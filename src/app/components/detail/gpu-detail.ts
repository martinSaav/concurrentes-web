import { ChangeDetectionStrategy, Component, OnDestroy, computed, signal } from '@angular/core';

const IMG_W = 16;
const IMG_H = 8;
const WG = 4; // @workgroup_size(4, 4)
const WG_X = IMG_W / WG; // dispatch_workgroups(4, 2, 1)
const WG_Y = IMG_H / WG;
const SLOTS = 4; // workgroups que la GPU ejecuta a la vez (unidades de cómputo)
const WG_MS = 700; // lo que tarda un workgroup completo
const CPU_PX_MS = 45; // lo que tarda la CPU por píxel

/** una "imagen" de colores: degradé con una flor al centro */
function color(x: number, y: number): [number, number, number] {
  const dx = x - 7.5;
  const dy = (y - 3.5) * 1.6;
  const d = Math.hypot(dx, dy);
  if (d < 1.6) return [250, 210, 70];
  if (d < 3.6) return [240, 236, 228];
  return [40 + y * 12, 110 + x * 6, 70 + (16 - x) * 5];
}
const gray = (c: [number, number, number]) => Math.round(c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114);

type Mode = 'gpu' | 'cpu';

/**
 * GPU: jerarquía grid → workgroup → thread sobre una imagen chica.
 * Click en un píxel: sus ids como en threadindexing.wgsl. "Ejecutar"
 * corre el kernel de escala de grises en GPU (workgroups enteros en paralelo)
 * o en CPU (un hilo, píxel por píxel) para comparar.
 */
@Component({
  selector: 'app-gpu-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="anim">
      <div class="head">
        <div class="titles">
          <div class="title">🟩 GPU: grid → workgroups → threads</div>
          <div class="caption">Un thread por píxel. Click en un píxel para ver sus índices; ▶ para correr el kernel.</div>
        </div>
        <div class="controls">
          <button class="ctl play" (click)="run()" [disabled]="running()">▶ Ejecutar</button>
          <div class="modes">
            <button class="mode" [class.on]="mode() === 'gpu'" (click)="setMode('gpu')">GPU</button>
            <button class="mode" [class.on]="mode() === 'cpu'" (click)="setMode('cpu')">CPU (1 hilo)</button>
          </div>
          <button class="ctl" (click)="reset()">↺ Reset</button>
        </div>
      </div>

      <div class="board">
        <div class="imgwrap">
          <div class="img">
            @for (p of cells; track p.i) {
              <button
                class="px"
                [class.wr]="p.x % wg === wg - 1 && p.x < imgW - 1"
                [class.wb]="p.y % wg === wg - 1 && p.y < imgH - 1"
                [class.sel]="sel() === p.i"
                [class.selwg]="wgOf(p.i) === wgOf(sel()) && sel() !== p.i"
                [class.busy]="isBusy(p.i)"
                [style.background]="done()[p.i] ? p.gray : p.color"
                (click)="sel.set(p.i)"
              ></button>
            }
          </div>
          <div class="dispatch">
            grid = <code>dispatch_workgroups({{ wgX }}, {{ wgY }}, 1)</code> ·
            workgroup = <code>&#64;workgroup_size({{ wg }}, {{ wg }})</code> · {{ imgW * imgH }} threads
          </div>
        </div>

        <div class="side">
          <div class="p-title">el thread del píxel elegido</div>
          <div class="ids">
            <div class="id"><span>workgroup_id</span><b class="c-wg">({{ info().wgx }}, {{ info().wgy }}, 0)</b></div>
            <div class="id"><span>local_invocation_id</span><b class="c-lo">({{ info().lx }}, {{ info().ly }}, 0)</b></div>
            <div class="id"><span>global_invocation_id</span><b class="c-gl">({{ info().gx }}, {{ info().gy }}, 0)</b></div>
          </div>
          <div class="formula-box">
            <code>global = workgroup_id × {{ wg }} + local</code><br />
            x: {{ info().wgx }}×{{ wg }} + {{ info().lx }} = <b>{{ info().gx }}</b> ·
            y: {{ info().wgy }}×{{ wg }} + {{ info().ly }} = <b>{{ info().gy }}</b>
            <br />
            <code>lineal = x + y × {{ imgW }}</code> = <b>{{ info().lin }}</b>
          </div>
          <div class="p-title t2">tiempo</div>
          <div class="time" [class.fast]="mode() === 'gpu'">{{ (elapsed() / 1000).toFixed(2) }} s</div>
          <div class="p-note">
            @if (lastGpu() !== null && lastCpu() !== null) {
              GPU <b>{{ (lastGpu()! / 1000).toFixed(2) }} s</b> vs CPU <b>{{ (lastCpu()! / 1000).toFixed(2) }} s</b>
            } @else {
              Corré los dos modos para comparar.
            }
          </div>
        </div>
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
    .controls { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .ctl { background: var(--panel-2); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 7px 12px; cursor: pointer; font-size: 0.86rem; }
    .ctl:hover:not(:disabled) { background: #2d3750; }
    .ctl:disabled { opacity: 0.4; cursor: default; }
    .ctl.play { background: #1f6feb; border-color: #1f6feb; color: #fff; font-weight: 700; min-width: 96px; }
    .modes { display: flex; background: var(--panel-2); border: 1px solid var(--border); border-radius: 8px; padding: 2px; gap: 2px; }
    .mode { background: transparent; border: none; color: var(--text-dim); border-radius: 6px; padding: 6px 10px; cursor: pointer; font-size: 0.78rem; font-weight: 600; }
    .mode.on { background: #2ea043; color: #fff; }

    .board { display: flex; gap: 12px; align-items: stretch; }
    .imgwrap { flex: 1; min-width: 0; background: radial-gradient(ellipse at 50% 45%, #202a40 0%, #171e2e 80%); border: 1px solid var(--border); border-radius: 10px; padding: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; }
    .img { display: grid; grid-template-columns: repeat(16, 1fr); width: 100%; max-width: 560px; border: 2px solid #ffd54f; border-radius: 4px; overflow: hidden; }
    .px { aspect-ratio: 1; border: none; padding: 0; cursor: pointer; border-right: 1px solid rgba(0, 0, 0, 0.25); border-bottom: 1px solid rgba(0, 0, 0, 0.25); transition: background 0.35s; position: relative; }
    .px.wr { border-right: 2px solid #ffd54f; }
    .px.wb { border-bottom: 2px solid #ffd54f; }
    .px.selwg::after { content: ''; position: absolute; inset: 0; background: rgba(88, 166, 255, 0.28); }
    .px.sel { outline: 3px solid #fff; outline-offset: -3px; z-index: 1; }
    .px.busy::after { content: ''; position: absolute; inset: 0; background: rgba(46, 160, 67, 0.45); }
    .dispatch { font-size: 0.72rem; color: var(--text-dim); text-align: center; }

    .side { width: 270px; flex-shrink: 0; background: #10151f; border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
    .p-title { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 1px; color: #5c6a8e; font-weight: 700; margin-bottom: 6px; }
    .p-title.t2 { margin-top: 12px; }
    .ids { display: flex; flex-direction: column; gap: 4px; }
    .id { display: flex; justify-content: space-between; gap: 6px; font-size: 0.74rem; font-family: Consolas, monospace; color: var(--text-dim); }
    .id b { font-weight: 800; }
    .c-wg { color: #79c0ff; }
    .c-lo { color: #d2b9ff; }
    .c-gl { color: #ffd54f; }
    .formula-box { margin-top: 8px; background: #0b0f19; border: 1px solid var(--border); border-radius: 7px; padding: 7px 9px; font-size: 0.7rem; color: var(--text-dim); line-height: 1.7; }
    .formula-box b { color: #ffd54f; }
    .time { font-family: Consolas, monospace; font-size: 1.6rem; font-weight: 800; color: #ef9a9a; }
    .time.fast { color: #7ee787; }
    .p-note { font-size: 0.72rem; color: var(--text-dim); }
    .p-note b { color: var(--text); font-family: Consolas, monospace; }

    .status { margin-top: 12px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 11px 14px; min-height: 50px; font-size: 0.9rem; line-height: 1.5; }

    @media (max-width: 720px) {
      .board { flex-direction: column; }
      .side { width: 100%; }
    }
  `,
})
export class GpuDetail implements OnDestroy {
  readonly imgW = IMG_W;
  readonly imgH = IMG_H;
  readonly wg = WG;
  readonly wgX = WG_X;
  readonly wgY = WG_Y;

  readonly cells = Array.from({ length: IMG_W * IMG_H }, (_, i) => {
    const x = i % IMG_W;
    const y = Math.floor(i / IMG_W);
    const c = color(x, y);
    const g = gray(c);
    return { i, x, y, color: `rgb(${c[0]}, ${c[1]}, ${c[2]})`, gray: `rgb(${g}, ${g}, ${g})` };
  });

  readonly mode = signal<Mode>('gpu');
  readonly sel = signal(5 + 6 * IMG_W); // píxel (5, 6): workgroup (1, 1), local (1, 2)
  readonly done = signal<boolean[]>(new Array(IMG_W * IMG_H).fill(false));
  readonly running = signal(false);
  readonly busyWg = signal<number[]>([]); // workgroups ejecutándose (modo GPU)
  readonly busyPx = signal(-1); // píxel ejecutándose (modo CPU)
  readonly elapsed = signal(0);
  readonly lastGpu = signal<number | null>(null);
  readonly lastCpu = signal<number | null>(null);
  readonly msg = signal<string | null>(null);

  private rafId = 0;
  private lastTs = 0;
  private nextWg = 0;
  private wgT = 0;
  private cpuAcc = 0;

  /** índice lineal del workgroup al que pertenece un píxel */
  wgOf(i: number): number {
    const x = i % IMG_W;
    const y = Math.floor(i / IMG_W);
    return Math.floor(y / WG) * WG_X + Math.floor(x / WG);
  }

  isBusy(i: number): boolean {
    return this.mode() === 'gpu' ? this.busyWg().includes(this.wgOf(i)) : this.busyPx() === i;
  }

  readonly info = computed(() => {
    const i = this.sel();
    const gx = i % IMG_W;
    const gy = Math.floor(i / IMG_W);
    return { gx, gy, wgx: Math.floor(gx / WG), wgy: Math.floor(gy / WG), lx: gx % WG, ly: gy % WG, lin: gx + gy * IMG_W };
  });

  setMode(m: Mode): void {
    if (this.mode() === m) return;
    this.mode.set(m);
    this.reset();
  }

  run(): void {
    this.resetRun();
    this.running.set(true);
    this.msg.set(
      this.mode() === 'gpu'
        ? `🟩 La GPU lanza los workgroups. Puede ejecutar <strong>${SLOTS} a la vez</strong>; dentro de cada uno, los ${WG * WG} threads corren <strong>en paralelo, en lockstep</strong> (como los lanes de un registro SIMD).`
        : '🐢 Un solo hilo de CPU recorre la imagen <strong>píxel por píxel</strong>, como el doble <code>for</code> de <code>base.rs</code>.',
    );
    this.lastTs = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number): void => {
    if (!this.running()) return;
    const dt = Math.min(now - this.lastTs, 100);
    this.lastTs = now;
    this.elapsed.update((e) => e + dt);
    const total = IMG_W * IMG_H;

    if (this.mode() === 'gpu') {
      if (this.busyWg().length === 0) {
        const wave = [];
        for (let k = 0; k < SLOTS && this.nextWg < WG_X * WG_Y; k++) wave.push(this.nextWg++);
        this.busyWg.set(wave);
        this.wgT = 0;
      }
      this.wgT += dt;
      if (this.wgT >= WG_MS) {
        const wave = this.busyWg();
        this.done.update((d) => d.map((v, i) => v || wave.includes(this.wgOf(i))));
        this.busyWg.set([]);
      }
    } else {
      this.cpuAcc += dt;
      while (this.cpuAcc >= CPU_PX_MS) {
        this.cpuAcc -= CPU_PX_MS;
        const next = this.done().indexOf(false);
        if (next < 0) break;
        this.done.update((d) => d.map((v, i) => v || i === next));
        this.busyPx.set(next + 1 < total ? next + 1 : -1);
      }
    }

    if (this.done().every(Boolean)) {
      this.running.set(false);
      this.busyWg.set([]);
      this.busyPx.set(-1);
      const t = this.elapsed();
      if (this.mode() === 'gpu') this.lastGpu.set(t);
      else this.lastCpu.set(t);
      this.msg.set(
        this.mode() === 'gpu'
          ? `✅ Listo en <strong>${(t / 1000).toFixed(2)} s</strong>: ${WG_X * WG_Y} workgroups en ${Math.ceil((WG_X * WG_Y) / SLOTS)} tandas. Cada thread hizo el cálculo de <strong>un</strong> píxel. Ojo: en la realidad hay que sumar el costo de <strong>copiar la imagen a la GPU y traerla de vuelta</strong>, que muchas veces domina.`
          : `🐢 Listo en <strong>${(t / 1000).toFixed(2)} s</strong>: ${total} píxeles, uno detrás del otro. Cada uno es independiente: es exactamente el tipo de trabajo que se paraleliza sin sincronizar nada.`,
      );
      return;
    }
    this.rafId = requestAnimationFrame(this.tick);
  };

  private resetRun(): void {
    cancelAnimationFrame(this.rafId);
    this.done.set(new Array(IMG_W * IMG_H).fill(false));
    this.busyWg.set([]);
    this.busyPx.set(-1);
    this.elapsed.set(0);
    this.nextWg = 0;
    this.wgT = 0;
    this.cpuAcc = 0;
  }

  reset(): void {
    this.running.set(false);
    this.resetRun();
    this.msg.set(null);
  }

  readonly statusMsg = computed(() => {
    const m = this.msg();
    if (m) return m;
    const f = this.info();
    return `El programa se divide en un <strong>grid</strong> de ${WG_X}×${WG_Y} <strong>workgroups</strong> independientes (bordes amarillos), cada uno con ${WG}×${WG} <strong>threads</strong>. El píxel elegido lo procesa el thread <strong>local (${f.lx}, ${f.ly})</strong> del workgroup <strong>(${f.wgx}, ${f.wgy})</strong>: su id global es (${f.gx}, ${f.gy}), y con eso sabe <strong>qué píxel le toca</strong>.`;
  });

  ngOnDestroy(): void {
    cancelAnimationFrame(this.rafId);
  }
}
