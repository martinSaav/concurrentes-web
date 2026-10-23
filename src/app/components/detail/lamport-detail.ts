import { ChangeDetectionStrategy, Component, OnDestroy, computed, signal } from '@angular/core';
import { SteppedAnim } from './stepped';

interface Msg {
  id: string;
  from: number;
  sendRow: number;
  to: number;
  recvRow: number;
}

/** el ejemplo de Tanenbaum: tres procesos con relojes que avanzan a ritmos distintos */
const RATES = [6, 8, 10];
const ROWS = 11;
const MSGS: Msg[] = [
  { id: 'A', from: 0, sendRow: 1, to: 1, recvRow: 2 },
  { id: 'B', from: 1, sendRow: 3, to: 2, recvRow: 4 },
  { id: 'C', from: 2, sendRow: 6, to: 1, recvRow: 7 },
  { id: 'D', from: 1, sendRow: 8, to: 0, recvRow: 9 },
];
const NAMES = ['P1', 'P2', 'P3'];
const COLORS = ['#58a6ff', '#7ee787', '#ffd54f'];

/** valores de reloj de cada proceso en cada fila; con lamport=true aplica la regla de recepción */
function clocks(lamport: boolean): number[][] {
  const c = RATES.map(() => new Array<number>(ROWS).fill(0));
  for (let r = 1; r < ROWS; r++) {
    for (let p = 0; p < RATES.length; p++) {
      let v = c[p][r - 1] + RATES[p];
      if (lamport) {
        const m = MSGS.find((x) => x.to === p && x.recvRow === r);
        if (m) v = Math.max(v, c[m.from][m.sendRow] + 1);
      }
      c[p][r] = v;
    }
  }
  return c;
}

const PHYS = clocks(false);
const LAMP = clocks(true);

interface Step {
  upTo: number; // mensajes visibles: MSGS[0..upTo)
  msg: (lamport: boolean) => string;
}

const STEPS: Step[] = [
  {
    upTo: 0,
    msg: () =>
      'Tres procesos en máquinas distintas, <strong>sin reloj global</strong>. Cada reloj local avanza a su propio ritmo: P1 de a 6, P2 de a 8, P3 de a 10. Ninguno está "mal": simplemente no hay forma de que coincidan.',
  },
  {
    upTo: 1,
    msg: () =>
      '<strong>Mensaje A</strong>: P1 lo envía en su tiempo 6 y P2 lo recibe en su tiempo 16. Llega "después" de salir: todo bien.',
  },
  {
    upTo: 2,
    msg: () => '<strong>Mensaje B</strong>: sale de P2 en 24 y llega a P3 en 40. También consistente.',
  },
  {
    upTo: 3,
    msg: (l) =>
      l
        ? '<strong>Mensaje C</strong> con Lamport: viaja con el timestamp <strong>60</strong>. Al recibirlo, P2 adelanta su reloj a <span class="formula">max(56, 60) + 1 = 61</span>. Ahora la recepción queda <strong>después</strong> del envío.'
        : '<strong>Mensaje C</strong>: sale de P3 en <strong>60</strong> y llega a P2 en <strong>56</strong>. ¡Según los relojes, <strong>llegó antes de salir</strong>! Imposible: el orden causal quedó roto.',
  },
  {
    upTo: 4,
    msg: (l) =>
      l
        ? '<strong>Mensaje D</strong>: sale de P2 en 69 (su reloj ya venía corregido) y P1 lo recibe ajustando a <span class="formula">max(54, 69) + 1 = 70</span>. Consistente de nuevo.'
        : '<strong>Mensaje D</strong>: sale de P2 en <strong>64</strong> y llega a P1 en <strong>54</strong>. Otra vez el efecto antes que la causa.',
  },
];

/**
 * Relojes lógicos de Lamport sobre el ejemplo clásico de Tanenbaum:
 * con relojes físicos hay mensajes que "llegan antes de salir";
 * con la regla de recepción max(C, ts) + 1 el orden causal se respeta.
 */
@Component({
  selector: 'app-lamport-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="anim">
      <div class="head">
        <div class="titles">
          <div class="title">🕰 Relojes de Lamport: que el efecto nunca preceda a la causa</div>
          <div class="caption">Cada columna es el reloj de un proceso; las flechas, mensajes.</div>
        </div>
        <div class="controls">
          <button class="ctl" (click)="prev()" [disabled]="index() < 0">⏮</button>
          <button class="ctl play" (click)="toggle()">
            {{ playing() ? '⏸ Pausa' : finished() ? '↺ Repetir' : '▶ Play' }}
          </button>
          <button class="ctl" (click)="next()" [disabled]="finished()">⏭</button>
          <div class="modes">
            <button class="mode bad" [class.on]="!lamport()" (click)="lamport.set(false)">relojes físicos</button>
            <button class="mode good" [class.on]="lamport()" (click)="lamport.set(true)">con Lamport</button>
          </div>
        </div>
      </div>

      <div class="canvas">
        <svg viewBox="0 0 100 96">
          <defs>
            <marker id="lok" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 z" fill="#8b95b5" />
            </marker>
            <marker id="lbad" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 z" fill="#ef5350" />
            </marker>
          </defs>

          @for (p of procs; track p) {
            <text [attr.x]="colX(p)" y="5" text-anchor="middle" class="ph" [attr.fill]="colors[p]">{{ names[p] }}</text>
            <line [attr.x1]="colX(p)" y1="7" [attr.x2]="colX(p)" y2="94" class="life" />
            @for (r of rows; track r) {
              <rect [attr.x]="colX(p) - 6" [attr.y]="rowY(r) - 3" width="12" height="6" rx="1"
                    class="cell" [class.fixed]="isFixed(p, r)" [class.bad]="isBadRecv(p, r)" />
              <text [attr.x]="colX(p)" [attr.y]="rowY(r) + 1.2" text-anchor="middle" class="cv"
                    [class.fixed-t]="isFixed(p, r)" [class.bad-t]="isBadRecv(p, r)">{{ value(p, r) }}</text>
            }
          }

          @for (m of shown(); track m.id) {
            <line [attr.x1]="ax(m, true)" [attr.y1]="rowY(m.sendRow)" [attr.x2]="ax(m, false)" [attr.y2]="rowY(m.recvRow)"
                  class="msg" [class.badm]="isBad(m)" [attr.marker-end]="isBad(m) ? 'url(#lbad)' : 'url(#lok)'" />
            <text [attr.x]="(ax(m, true) + ax(m, false)) / 2" [attr.y]="(rowY(m.sendRow) + rowY(m.recvRow)) / 2 - 1.4"
                  text-anchor="middle" class="ml" [class.badl]="isBad(m)">{{ m.id }}</text>
          }
        </svg>
      </div>

      <div class="legend">
        <span class="lg"><span class="sw bad-sw"></span> recepción con reloj ≤ envío (causalidad rota)</span>
        <span class="lg"><span class="sw fix-sw"></span> reloj adelantado por la regla de Lamport</span>
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
        @for (s of steps; track $index; let i = $index) {
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
    .mode.bad.on { background: #c73e3a; color: #fff; }
    .mode.good.on { background: #2ea043; color: #fff; }

    .canvas { background: radial-gradient(ellipse at 50% 45%, #202a40 0%, #171e2e 80%); border: 1px solid var(--border); border-radius: 10px; padding: 8px; }
    svg { width: 100%; max-width: 520px; height: auto; display: block; margin: 0 auto; }
    svg text { paint-order: stroke; stroke: #1b2336; stroke-width: 0.8px; stroke-linejoin: round; }
    .ph { font-size: 3.4px; font-weight: 800; }
    .life { stroke: #39445f; stroke-width: 0.3; }
    .cell { fill: #10151f; stroke: #39445f; stroke-width: 0.3; }
    .cell.fixed { fill: #16281c; stroke: #2ea043; }
    .cell.bad { fill: #3a2224; stroke: #ef5350; }
    .cv { fill: #c8d0e4; font-size: 3px; font-family: Consolas, monospace; }
    .cv.fixed-t { fill: #7ee787; font-weight: 700; }
    .cv.bad-t { fill: #ef9a9a; font-weight: 700; }
    .msg { stroke: #8b95b5; stroke-width: 0.5; }
    .msg.badm { stroke: #ef5350; }
    .ml { fill: #c8d0e4; font-size: 3.2px; font-weight: 800; }
    .ml.badl { fill: #ef9a9a; }

    .legend { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 10px; font-size: 0.74rem; color: var(--text-dim); }
    .lg { display: flex; align-items: center; gap: 6px; }
    .sw { width: 12px; height: 12px; border-radius: 3px; border: 1.5px solid; }
    .bad-sw { background: #3a2224; border-color: #ef5350; }
    .fix-sw { background: #16281c; border-color: #2ea043; }

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
  `,
})
export class LamportDetail extends SteppedAnim implements OnDestroy {
  readonly steps = STEPS;
  readonly procs = [0, 1, 2];
  readonly rows = Array.from({ length: ROWS }, (_, i) => i);
  readonly names = NAMES;
  readonly colors = COLORS;

  readonly lamport = signal(false);

  protected stepCount(): number {
    return STEPS.length;
  }
  protected override stepTravel(_i: number): number {
    return 500;
  }
  protected override stepDwell(_i: number): number {
    return 4200;
  }

  /** cantidad de mensajes visibles en el paso actual (al terminar, todos) */
  private readonly upTo = computed(() => {
    if (this.finished()) return MSGS.length;
    const i = this.index();
    return i < 0 ? 0 : STEPS[i].upTo;
  });

  readonly shown = computed(() => MSGS.slice(0, this.upTo()));

  colX(p: number): number {
    return 20 + p * 30;
  }
  rowY(r: number): number {
    return 12 + r * 8.1;
  }
  /** las flechas salen y llegan al borde de la celda, no a su centro */
  ax(m: Msg, start: boolean): number {
    const dir = Math.sign(m.to - m.from);
    return start ? this.colX(m.from) + dir * 6 : this.colX(m.to) - dir * 6;
  }

  private table(): number[][] {
    return this.lamport() ? LAMP : PHYS;
  }

  value(p: number, r: number): number {
    return this.table()[p][r];
  }

  /** un mensaje está mal si se recibe con un reloj menor o igual al del envío */
  isBad(m: Msg): boolean {
    const t = this.table();
    return t[m.to][m.recvRow] <= t[m.from][m.sendRow];
  }

  isBadRecv(p: number, r: number): boolean {
    return this.shown().some((m) => m.to === p && m.recvRow === r && this.isBad(m));
  }

  /** celda cuyo valor cambió por la regla de Lamport (solo cuenta si su mensaje ya se mostró) */
  isFixed(p: number, r: number): boolean {
    if (!this.lamport() || LAMP[p][r] === PHYS[p][r]) return false;
    // la corrección nace en una recepción visible y se arrastra hacia abajo
    return this.shown().some((m) => m.to === p && m.recvRow <= r);
  }

  readonly statusMsg = computed(() => {
    const l = this.lamport();
    if (this.finished()) {
      return l
        ? '<strong>Con Lamport, todo envío precede a su recepción.</strong> Las reglas: (1) cada evento incrementa el reloj local; (2) el mensaje viaja con el reloj del emisor; (3) al recibir, <span class="formula">C = max(C, ts) + 1</span>. No se sincroniza la hora real: se garantiza el <strong>orden causal</strong>.'
        : 'Con relojes físicos no sincronizados, <strong>C y D llegan "antes" de salir</strong>. Cambiá a <strong>con Lamport</strong> para ver cómo la regla de recepción lo corrige.';
    }
    const i = this.index();
    if (i < 0) {
      return 'Presioná ▶ Play. Primero miralo con <strong>relojes físicos</strong>; después repetilo <strong>con Lamport</strong>.';
    }
    return STEPS[i].msg(l);
  });

  ngOnDestroy(): void {
    this.destroy();
  }
}
