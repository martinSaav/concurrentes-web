import { ChangeDetectionStrategy, Component, OnDestroy, computed } from '@angular/core';
import { SteppedAnim } from './stepped';

interface NodeSpec {
  id: string;
  x: number; // %
  y: number; // %
  parent?: string;
  /** contenido por rango de pasos: [desdePaso, texto] — se usa el último que aplique */
  content: [number, string][];
  /** paso desde el cual el nodo existe */
  appears: number;
  /** pasos en los que el nodo está activo (resaltado) */
  activeAt: number[];
  /** color del worker que lo procesa */
  color: string;
}

const NODES: NodeSpec[] = [
  {
    id: 'root', x: 50, y: 12, appears: 0, activeAt: [0, 5],
    content: [[0, '7 3 9 1 8 2 6 4'], [5, '1 2 3 4 6 7 8 9']],
    color: '#f0883e',
  },
  {
    id: 'l', x: 27, y: 42, parent: 'root', appears: 1, activeAt: [1, 4],
    content: [[1, '7 3 9 1'], [4, '1 3 7 9']],
    color: '#58a6ff',
  },
  {
    id: 'r', x: 73, y: 42, parent: 'root', appears: 1, activeAt: [1, 4],
    content: [[1, '8 2 6 4'], [4, '2 4 6 8']],
    color: '#ef5350',
  },
  {
    id: 'll', x: 14, y: 72, parent: 'l', appears: 2, activeAt: [2, 3],
    content: [[2, '7 3'], [3, '3 7']],
    color: '#7ee787',
  },
  {
    id: 'lr', x: 38, y: 72, parent: 'l', appears: 2, activeAt: [2, 3],
    content: [[2, '9 1'], [3, '1 9']],
    color: '#ffd54f',
  },
  {
    id: 'rl', x: 62, y: 72, parent: 'r', appears: 2, activeAt: [2, 3],
    content: [[2, '8 2'], [3, '2 8']],
    color: '#a78bfa',
  },
  {
    id: 'rr', x: 86, y: 72, parent: 'r', appears: 2, activeAt: [2, 3],
    content: [[2, '6 4'], [3, '4 6']],
    color: '#4dd0e1',
  },
];

interface FjStep {
  msg: string;
  threads: number;
  phase: 'fork' | 'work' | 'join' | 'done';
}

const STEPS: FjStep[] = [
  {
    phase: 'fork', threads: 1,
    msg: '<code>mergesort(v)</code> recibe el array completo. Es demasiado grande para ordenarlo directo → <strong>FORK</strong>: lo vamos a partir.',
  },
  {
    phase: 'fork', threads: 2,
    msg: '<strong>FORK</strong>: se divide en dos mitades y se hace <code>thread::spawn</code> para cada una. Las mitades son <strong>independientes</strong>: no comparten nada mutable → no hay carreras posibles.',
  },
  {
    phase: 'fork', threads: 4,
    msg: 'Cada mitad vuelve a dividirse (recursión) → <strong>4 tareas hoja</strong>. En la práctica se corta por un umbral: crear hilos infinitos cuesta más que ordenar (por eso existe rayon con su pool).',
  },
  {
    phase: 'work', threads: 4,
    msg: 'El caso base: las 4 hojas se ordenan <strong>EN PARALELO</strong>, cada una en su hilo. Este es el momento de máximo paralelismo: 4 cores trabajando a la vez.',
  },
  {
    phase: 'join', threads: 2,
    msg: '<strong>JOIN</strong>: cada padre hace <code>handle.join()</code> — se <strong>bloquea</strong> hasta que sus hijos terminan — y <strong>mergea</strong> las dos mitades ordenadas. El join es el punto de sincronización: acá se espera y se combina.',
  },
  {
    phase: 'join', threads: 1,
    msg: 'JOIN final: el hilo original mergea las dos mitades. Notá la forma del paralelismo: mucho al fondo del árbol, poco arriba — el merge final es <strong>secuencial</strong> (hola, Amdahl 👋).',
  },
  {
    phase: 'done', threads: 1,
    msg: '<strong>Array ordenado.</strong> Fork-join en una frase: dividir en subproblemas independientes (fork), resolver en paralelo, esperar y combinar (join). Sin locks: la única sincronización es el join.',
  },
];

/**
 * Fork-join paso a paso con mergesort (el ejemplo de la materia):
 * árbol de spawns, máximo paralelismo en las hojas, joins que combinan.
 */
@Component({
  selector: 'app-forkjoin-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="anim">
      <div class="head">
        <div class="titles">
          <div class="title">🔱 Fork-Join: mergesort en paralelo</div>
          <div class="caption">spawn al bajar, join al subir. El paralelismo vive en las hojas.</div>
        </div>
        <div class="controls">
          <button class="ctl" (click)="prev()" [disabled]="index() < 0">⏮</button>
          <button class="ctl play" (click)="toggle()">
            {{ playing() ? '⏸ Pausa' : finished() ? '↺ Repetir' : '▶ Play' }}
          </button>
          <button class="ctl" (click)="next()" [disabled]="finished()">⏭</button>
          <div class="speeds">
            @for (s of speedOptions; track s) {
              <button class="spd" [class.on]="speed() === s" (click)="setSpeed(s)">{{ s }}×</button>
            }
          </div>
        </div>
      </div>

      <div class="canvas">
        <svg class="wires" viewBox="0 0 100 100" preserveAspectRatio="none">
          @for (n of visibleNodes(); track n.id) {
            @if (n.parent; as p) {
              <line
                [attr.x1]="nodeX(p)" [attr.y1]="nodeY(p) + 6"
                [attr.x2]="n.x" [attr.y2]="n.y - 6"
                [class.hot]="isActive(n)"
              />
            }
          }
        </svg>

        @for (n of visibleNodes(); track n.id) {
          <div
            class="node"
            [class.active]="isActive(n)"
            [style.left.%]="n.x"
            [style.top.%]="n.y"
            [style.--nc]="n.color"
          >
            {{ nodeContent(n) }}
          </div>
        }

        <div class="badge" [class.max]="curThreads() === 4">
          🧵 hilos activos: <strong>{{ curThreads() }}</strong>
          @if (curThreads() === 4) { · máximo paralelismo }
        </div>
        <div class="phase">
          @switch (curPhase()) {
            @case ('fork') { <span class="ph fork">FORK ↓</span> }
            @case ('work') { <span class="ph work">WORK ∥</span> }
            @case ('join') { <span class="ph join">JOIN ↑</span> }
            @case ('done') { <span class="ph done">✔ LISTO</span> }
          }
        </div>
      </div>

      <div class="status" [class.done]="finished()" [class.idle]="index() < 0">
        @if (index() >= 0 && !finished()) {
          <span class="stepno">{{ index() + 1 }}/{{ steps.length }}</span>
        }
        @if (finished()) {
          <span class="stepno ok">✔</span>
        }
        <span [innerHTML]="statusMsg()"></span>
      </div>

      <div class="dots">
        @for (st of steps; track $index; let i = $index) {
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
    .speeds { display: flex; gap: 2px; margin-left: 6px; background: var(--panel-2); border-radius: 8px; padding: 2px; border: 1px solid var(--border); }
    .spd { background: transparent; color: var(--text-dim); border: none; border-radius: 6px; padding: 5px 8px; cursor: pointer; font-size: 0.78rem; }
    .spd.on { background: #1f6feb; color: #fff; font-weight: 700; }

    .canvas { position: relative; min-height: 300px; background: radial-gradient(ellipse at 50% 45%, #202a40 0%, #171e2e 80%); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
    .wires { position: absolute; inset: 0; width: 100%; height: 100%; }
    .wires line { stroke: #39445f; stroke-width: 0.5; stroke-dasharray: 1 1.6; vector-effect: non-scaling-stroke; transition: stroke 0.3s; }
    .wires line.hot { stroke: #ffd54f; stroke-dasharray: none; }

    .node {
      position: absolute; transform: translate(-50%, -50%); z-index: 2;
      background: #0b0f19; border: 1.5px solid var(--nc); border-radius: 8px;
      padding: 5px 10px; font-family: Consolas, monospace; font-size: 0.78rem; color: var(--text);
      white-space: nowrap; transition: box-shadow 0.25s, transform 0.25s;
    }
    .node.active { box-shadow: 0 0 14px color-mix(in srgb, var(--nc) 60%, transparent); color: #fff; transform: translate(-50%, -50%) scale(1.08); }

    .badge { position: absolute; top: 10px; left: 10px; background: rgba(8, 12, 22, 0.9); border: 1px solid var(--border); border-radius: 9px; padding: 4px 12px; font-size: 0.74rem; color: var(--text-dim); }
    .badge strong { color: #fff; font-family: Consolas, monospace; }
    .badge.max { border-color: #7ee787; color: #7ee787; }
    .badge.max strong { color: #7ee787; }
    .phase { position: absolute; top: 10px; right: 10px; }
    .ph { font-size: 0.7rem; font-weight: 800; letter-spacing: 1px; border-radius: 9px; padding: 4px 12px; background: rgba(8, 12, 22, 0.9); border: 1px solid; }
    .ph.fork { color: #58a6ff; border-color: #58a6ff66; }
    .ph.work { color: #7ee787; border-color: #7ee78766; }
    .ph.join { color: #ffd54f; border-color: #ffd54f66; }
    .ph.done { color: #7ee787; border-color: #2ea043; }

    .status { display: flex; align-items: center; gap: 10px; margin-top: 12px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 11px 14px; min-height: 50px; font-size: 0.95rem; line-height: 1.45; }
    .status.done { border-color: #2ea04366; background: rgba(46, 160, 67, 0.1); }
    .status.idle { color: var(--text-dim); font-style: italic; }
    .stepno { flex-shrink: 0; background: #1f6feb; color: #fff; border-radius: 6px; font-size: 0.75rem; font-weight: 700; padding: 2px 8px; }
    .stepno.ok { background: #2ea043; }
    .dots { display: flex; gap: 6px; margin-top: 10px; justify-content: center; flex-wrap: wrap; }
    .dot { width: 12px; height: 12px; border-radius: 50%; border: 1px solid var(--border); background: var(--panel-2); cursor: pointer; padding: 0; transition: transform 0.15s; }
    .dot:hover { transform: scale(1.3); }
    .dot.past { background: #1f6feb; border-color: #1f6feb; }
    .dot.now { background: #ffd54f; border-color: #ffd54f; }
  `,
})
export class ForkjoinDetail extends SteppedAnim implements OnDestroy {
  readonly steps = STEPS;
  readonly nodes = NODES;

  protected stepCount(): number {
    return STEPS.length;
  }
  protected override stepTravel(_i: number): number {
    return 700;
  }
  protected override stepDwell(_i: number): number {
    return 3400;
  }

  private curIndex(): number {
    if (this.finished()) return STEPS.length - 1;
    return this.index();
  }

  readonly visibleNodes = computed(() => {
    const i = this.curIndex();
    return NODES.filter((n) => n.appears <= i);
  });

  readonly curThreads = computed(() => {
    const i = this.curIndex();
    return i < 0 ? 0 : STEPS[i].threads;
  });

  readonly curPhase = computed(() => {
    const i = this.curIndex();
    return i < 0 ? 'fork' : STEPS[i].phase;
  });

  isActive(n: NodeSpec): boolean {
    const i = this.curIndex();
    return i >= 0 && n.activeAt.includes(i);
  }

  nodeContent(n: NodeSpec): string {
    const i = this.curIndex();
    let out = n.content[0][1];
    for (const [from, text] of n.content) {
      if (i >= from) out = text;
    }
    return out;
  }

  nodeX(id: string): number {
    return NODES.find((n) => n.id === id)!.x;
  }
  nodeY(id: string): number {
    return NODES.find((n) => n.id === id)!.y;
  }

  readonly statusMsg = computed(() => {
    if (this.finished()) {
      return '<strong>Para fijar:</strong> ¿dónde está la sincronización en fork-join? SOLO en el join. ¿Por qué no hay carreras? Porque los subproblemas no comparten estado mutable. ¿Qué limita el speedup? La parte secuencial (el merge final) + el costo de crear/coordinar hilos.';
    }
    const i = this.index();
    if (i < 0) return 'Presioná ▶ Play. Vamos a ordenar [7 3 9 1 8 2 6 4] con mergesort paralelo, como en <code>mergesort.rs</code>.';
    return STEPS[i].msg;
  });

  ngOnDestroy(): void {
    this.destroy();
  }
}
