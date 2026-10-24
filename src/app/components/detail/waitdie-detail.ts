import { ChangeDetectionStrategy, Component, OnDestroy, computed, signal } from '@angular/core';
import { SteppedAnim } from './stepped';

type Algo = 'wait-die' | 'wound-wait';
type Who = 'old' | 'young'; // quién pide el recurso que tiene el otro

const TS = { old: 5, young: 10 };

interface Phase {
  /** estado de cada transacción en esta fase */
  old: 'tiene' | 'pide' | 'espera' | 'muere' | 'herida' | 'obtiene' | 'idle';
  young: 'tiene' | 'pide' | 'espera' | 'muere' | 'herida' | 'obtiene' | 'idle';
  holder: Who | null; // quién tiene el recurso
  arrow: boolean; // flecha "pide" del solicitante al recurso
  msg: string;
}

/** el desenlace de cada una de las 4 combinaciones */
function outcome(algo: Algo, who: Who): 'wait' | 'die' | 'wound' {
  if (algo === 'wait-die') return who === 'old' ? 'wait' : 'die';
  return who === 'old' ? 'wound' : 'wait';
}

function phases(algo: Algo, who: Who): Phase[] {
  const other: Who = who === 'old' ? 'young' : 'old';
  const name = (w: Who) => (w === 'old' ? `T<sub>vieja</sub> (ts ${TS.old})` : `T<sub>joven</sub> (ts ${TS.young})`);
  const base = (o: Phase['old'], y: Phase['young'], holder: Who | null, arrow: boolean, msg: string): Phase => ({
    old: o,
    young: y,
    holder,
    arrow,
    msg,
  });
  const st = (w: Who, mine: Phase['old'], theirs: Phase['old']) =>
    who === w ? mine : theirs;

  const p0 = base(st('old', 'idle', 'tiene'), st('young', 'idle', 'tiene'), other, false,
    `${name(other)} tiene tomado el recurso <strong>R</strong>. Cada transacción recibió un timestamp único y global al iniciar (Lamport): <strong>menor timestamp = más vieja</strong>.`);
  const p1 = base(st('old', 'pide', 'tiene'), st('young', 'pide', 'tiene'), other, true,
    `${name(who)} quiere R y está por bloquearse esperándolo. Antes de esperar, se <strong>comparan los timestamps</strong>: ${TS[who]} contra ${TS[other]}.`);

  const res = outcome(algo, who);
  let p2: Phase;
  let p3: Phase | null = null;
  if (res === 'wait') {
    p2 = base(st('old', 'espera', 'tiene'), st('young', 'espera', 'tiene'), other, true,
      algo === 'wait-die'
        ? `<strong>Wait-die</strong>: el que pide es <strong>más viejo</strong> (${TS[who]} &lt; ${TS[other]}) → <strong>WAIT</strong>, espera a que el joven libere R.`
        : `<strong>Wound-wait</strong>: el que pide es <strong>más joven</strong> (${TS[who]} &gt; ${TS[other]}) → <strong>WAIT</strong>, espera a que el viejo libere R.`);
    p3 = base(st('old', 'obtiene', 'idle'), st('young', 'obtiene', 'idle'), who, false,
      `${name(other)} termina y libera R → ${name(who)} lo obtiene. Nadie abortó.`);
  } else if (res === 'die') {
    p2 = base(st('old', 'muere', 'tiene'), st('young', 'muere', 'tiene'), other, false,
      `<strong>Wait-die</strong>: el que pide es <strong>más joven</strong> (${TS[who]} &gt; ${TS[other]}) → <strong>DIE</strong>: la joven <strong>aborta</strong>. El nuevo no espera al viejo.`);
    p3 = base(st('old', 'pide', 'tiene'), st('young', 'pide', 'tiene'), other, false,
      `La joven se <strong>reinicia más tarde con su MISMO timestamp</strong> (${TS[who]}). Con el tiempo pasa a ser la más vieja del sistema y deja de morir: no hay starvation.`);
  } else {
    p2 = base(st('old', 'pide', 'herida'), st('young', 'pide', 'herida'), other, true,
      `<strong>Wound-wait</strong>: el que pide es <strong>más viejo</strong> (${TS[who]} &lt; ${TS[other]}) → <strong>WOUND</strong>: "hiere" a la joven, que <strong>aborta</strong> y suelta R.`);
    p3 = base(st('old', 'obtiene', 'idle'), st('young', 'obtiene', 'idle'), who, false,
      `${name(who)} se queda con R y sigue. La joven se reinicia después, conservando su timestamp.`);
  }
  return p3 ? [p0, p1, p2, p3] : [p0, p1, p2];
}

/**
 * Prevención de deadlock con timestamps: wait-die vs wound-wait.
 * Elegís algoritmo y quién pide; se ve la comparación y el desenlace,
 * con la tabla 2×2 resaltando el caso actual.
 */
@Component({
  selector: 'app-waitdie-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="anim">
      <div class="head">
        <div class="titles">
          <div class="title">⏳ Wait-die vs wound-wait: ¿quién espera y quién aborta?</div>
          <div class="caption">Dos transacciones, un recurso. El timestamp decide; la que aborta es siempre la más joven.</div>
        </div>
        <div class="controls">
          <button class="ctl" (click)="prev()" [disabled]="index() < 0">⏮</button>
          <button class="ctl play" (click)="toggle()">
            {{ playing() ? '⏸ Pausa' : finished() ? '↺ Repetir' : '▶ Play' }}
          </button>
          <button class="ctl" (click)="next()" [disabled]="finished()">⏭</button>
        </div>
      </div>

      <div class="pickers">
        <div class="modes">
          <span class="pk">algoritmo</span>
          <button class="mode" [class.on]="algo() === 'wait-die'" (click)="set('wait-die', who())">wait-die</button>
          <button class="mode" [class.on]="algo() === 'wound-wait'" (click)="set('wound-wait', who())">wound-wait</button>
        </div>
        <div class="modes">
          <span class="pk">quién pide</span>
          <button class="mode" [class.on]="who() === 'old'" (click)="set(algo(), 'old')">la vieja pide</button>
          <button class="mode" [class.on]="who() === 'young'" (click)="set(algo(), 'young')">la joven pide</button>
        </div>
      </div>

      <div class="board">
        <div class="stage">
          <div class="tx old" [class]="'tx old s-' + cur().old">
            <div class="tx-name">T vieja</div>
            <div class="tx-ts">ts = {{ ts.old }}</div>
            <div class="tx-st">{{ label(cur().old) }}</div>
          </div>

          <div class="res" [class.held-old]="cur().holder === 'old'" [class.held-young]="cur().holder === 'young'">
            <div class="res-name">R</div>
            <div class="res-by">
              @if (cur().holder === 'old') { ← de la vieja }
              @else if (cur().holder === 'young') { de la joven → }
              @else { libre }
            </div>
            @if (cur().arrow) {
              <div class="req" [class.from-old]="who() === 'old'" [class.from-young]="who() === 'young'">pide</div>
            }
          </div>

          <div class="tx young" [class]="'tx young s-' + cur().young">
            <div class="tx-name">T joven</div>
            <div class="tx-ts">ts = {{ ts.young }}</div>
            <div class="tx-st">{{ label(cur().young) }}</div>
          </div>
        </div>

        <div class="side">
          <div class="p-title">las 4 combinaciones</div>
          <table class="mx">
            <tr><th></th><th>la vieja pide</th><th>la joven pide</th></tr>
            <tr [class.row-on]="algo() === 'wait-die'">
              <td>wait-die</td>
              <td [class.on]="isCell('wait-die', 'old')"><span class="w">espera</span></td>
              <td [class.on]="isCell('wait-die', 'young')"><span class="d">la joven muere</span></td>
            </tr>
            <tr [class.row-on]="algo() === 'wound-wait'">
              <td>wound-wait</td>
              <td [class.on]="isCell('wound-wait', 'old')"><span class="d">hiere a la joven</span></td>
              <td [class.on]="isCell('wound-wait', 'young')"><span class="w">espera</span></td>
            </tr>
          </table>
          <div class="p-note">
            En los dos, las esperas van <strong>en un solo sentido</strong> (wait-die: solo viejo espera a joven;
            wound-wait: solo joven espera a viejo) → <strong>no puede cerrarse un ciclo</strong>.
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
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
    .title { font-weight: 700; font-size: 1.02rem; color: #fff; }
    .caption { color: var(--text-dim); font-size: 0.85rem; margin-top: 2px; }
    .controls { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .ctl { background: var(--panel-2); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 7px 12px; cursor: pointer; font-size: 0.9rem; }
    .ctl:hover:not(:disabled) { background: #2d3750; }
    .ctl:disabled { opacity: 0.35; cursor: default; }
    .ctl.play { background: #1f6feb; border-color: #1f6feb; color: #fff; font-weight: 700; min-width: 96px; }
    .pickers { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
    .modes { display: flex; align-items: center; background: var(--panel-2); border: 1px solid var(--border); border-radius: 8px; padding: 2px; gap: 2px; }
    .pk { font-size: 0.66rem; color: #5c6a8e; text-transform: uppercase; letter-spacing: 1px; padding: 0 8px; }
    .mode { background: transparent; border: none; color: var(--text-dim); border-radius: 6px; padding: 6px 10px; cursor: pointer; font-size: 0.78rem; font-weight: 600; }
    .mode.on { background: #1f6feb; color: #fff; }

    .board { display: flex; gap: 12px; align-items: stretch; }
    .stage { flex: 1; min-width: 0; display: grid; grid-template-columns: 1fr 0.9fr 1fr; gap: 12px; align-items: center; background: radial-gradient(ellipse at 50% 45%, #202a40 0%, #171e2e 80%); border: 1px solid var(--border); border-radius: 10px; padding: 22px 14px; }
    .tx { background: #10151f; border: 2px solid #39445f; border-radius: 12px; padding: 12px; text-align: center; transition: all 0.3s; }
    .tx-name { font-weight: 800; color: #fff; font-size: 0.95rem; }
    .tx-ts { font-family: Consolas, monospace; color: #ffd54f; font-size: 0.85rem; margin: 2px 0 6px; }
    .tx-st { font-size: 0.8rem; color: var(--text-dim); min-height: 20px; }
    .tx.s-tiene { border-color: #58a6ff; }
    .tx.s-pide { border-color: #ffd54f; }
    .tx.s-espera { border-color: #f0883e; border-style: dashed; }
    .tx.s-espera .tx-st { color: #ffab70; font-weight: 700; }
    .tx.s-muere, .tx.s-herida { border-color: #ef5350; background: rgba(239, 83, 80, 0.12); opacity: 0.85; }
    .tx.s-muere .tx-st, .tx.s-herida .tx-st { color: #ef9a9a; font-weight: 700; }
    .tx.s-obtiene { border-color: #2ea043; background: rgba(46, 160, 67, 0.1); }
    .tx.s-obtiene .tx-st { color: #7ee787; font-weight: 700; }

    .res { position: relative; background: #0b0f19; border: 2px solid #39445f; border-radius: 10px; padding: 14px 8px; text-align: center; transition: border-color 0.3s; }
    .res.held-old, .res.held-young { border-color: #58a6ff; }
    .res-name { font-family: Consolas, monospace; font-size: 1.6rem; font-weight: 800; color: #fff; }
    .res-by { font-size: 0.72rem; color: var(--text-dim); }
    .req { position: absolute; top: -12px; font-size: 0.68rem; font-weight: 800; color: #0d1117; background: #ffd54f; border-radius: 6px; padding: 1px 8px; }
    .req.from-old { left: -10px; }
    .req.from-young { right: -10px; }

    .side { width: 290px; flex-shrink: 0; background: #10151f; border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
    .p-title { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 1px; color: #5c6a8e; font-weight: 700; margin-bottom: 6px; }
    .mx { width: 100%; border-collapse: collapse; font-size: 0.74rem; }
    .mx th { color: #5c6a8e; font-weight: 700; text-align: left; padding: 4px; font-size: 0.66rem; }
    .mx td { padding: 6px 4px; border-top: 1px solid var(--border); color: var(--text-dim); }
    .mx td:first-child { font-family: Consolas, monospace; color: var(--text); }
    .mx td.on { background: rgba(255, 213, 79, 0.12); outline: 1.5px solid #ffd54f; border-radius: 4px; }
    .w { color: #ffab70; font-weight: 700; }
    .d { color: #ef9a9a; font-weight: 700; }
    .p-note { margin-top: 9px; font-size: 0.72rem; color: var(--text-dim); line-height: 1.5; }
    .p-note strong { color: var(--text); }

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

    @media (max-width: 720px) {
      .board { flex-direction: column; }
      .side { width: 100%; }
      .stage { grid-template-columns: 1fr; }
    }
  `,
})
export class WaitdieDetail extends SteppedAnim implements OnDestroy {
  readonly ts = TS;
  readonly algo = signal<Algo>('wait-die');
  readonly who = signal<Who>('young');

  readonly steps = computed(() => phases(this.algo(), this.who()));

  protected stepCount(): number {
    return this.steps().length;
  }
  protected override stepTravel(_i: number): number {
    return 450;
  }
  protected override stepDwell(_i: number): number {
    return 3800;
  }

  readonly cur = computed<Phase>(() => {
    const s = this.steps();
    if (this.finished()) return s[s.length - 1];
    return s[Math.max(this.index(), 0)];
  });

  set(a: Algo, w: Who): void {
    this.algo.set(a);
    this.who.set(w);
    this.reset();
  }

  isCell(a: Algo, w: Who): boolean {
    return this.algo() === a && this.who() === w;
  }

  label(s: Phase['old']): string {
    switch (s) {
      case 'tiene': return '🔒 tiene R';
      case 'pide': return 'quiere R';
      case 'espera': return '⏳ WAIT: espera';
      case 'muere': return '💀 DIE: aborta';
      case 'herida': return '🩸 WOUNDED: aborta';
      case 'obtiene': return '✔ obtiene R';
      default: return '—';
    }
  }

  readonly statusMsg = computed(() => {
    const s = this.steps();
    if (this.finished()) {
      return 'En los dos algoritmos <strong>la que aborta es siempre la más joven</strong>: la vieja estadísticamente lleva más trabajo hecho, y abortarla saldría más caro. La diferencia es <strong>quién toma la iniciativa</strong>: en wait-die la joven "se muere sola" al pedir; en wound-wait la vieja "la hiere" para quitarle el recurso.';
    }
    const i = this.index();
    if (i < 0) return 'Elegí el algoritmo y quién pide el recurso, y presioná ▶ Play. Probá las 4 combinaciones.';
    return s[i].msg;
  });

  ngOnDestroy(): void {
    this.destroy();
  }
}
