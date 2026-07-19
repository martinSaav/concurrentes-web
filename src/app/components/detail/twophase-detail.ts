import { ChangeDetectionStrategy, Component, OnDestroy, computed, signal } from '@angular/core';

type PState = 'init' | 'ready' | 'committed' | 'aborted';
type MsgType = 'PREPARE' | 'VOTE-YES' | 'VOTE-NO' | 'COMMIT' | 'ABORT' | 'ACK';

interface Part {
  id: number; // 1..3
  alive: boolean;
  voteNo: boolean;
  state: PState;
  log: string[];
}

interface Wire {
  from: number; // 0 = coordinador
  to: number;
  t: number;
  dur: number;
  type: MsgType;
}

interface Timer {
  t: number;
  fn: () => void;
}

const PX = [50, 16, 50, 84]; // 0 = coord, 1..3 participantes
const PY = [16, 74, 82, 74];

/**
 * Two-phase commit (twophase_coordinator.rs / twophase_stakeholder.rs):
 * PREPARE/votos + COMMIT/ABORT. Inyectá fallas: voto NO, participante caído,
 * o matá al coordinador tras los votos para ver el problema del BLOQUEO.
 */
@Component({
  selector: 'app-twophase-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="anim">
      <div class="head">
        <div class="titles">
          <div class="title">🤝 Two-Phase Commit: todos o ninguno</div>
          <div class="caption">
            Configurá fallas en los participantes y lanzá la transacción. Lo interesante es cuando falla.
          </div>
        </div>
        <div class="controls">
          <button class="ctl play" (click)="start()" [disabled]="phase() === 'prepare' || !coordAlive()">
            🚀 iniciar transacción
          </button>
          <button class="ctl" [class.badon]="killAfterVotes()" (click)="toggleKill()"
                  title="El coordinador muere después de recibir los votos, antes de mandar la decisión">
            {{ killAfterVotes() ? '💀 coord. morirá tras los votos' : 'matar coord. tras los votos' }}
          </button>
          <button class="ctl" (click)="reset()">↺ Reset</button>
        </div>
      </div>

      <div class="board">
        <div class="arena">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            @for (i of [1, 2, 3]; track i) {
              <line [attr.x1]="px[0]" [attr.y1]="py[0]" [attr.x2]="px[i]" [attr.y2]="py[i]" class="edge" />
            }
          </svg>

          @for (w of wires(); track $index) {
            <div class="msg" [style.left.%]="wx(w)" [style.top.%]="wy(w)"
                 [style.border-color]="wireColor(w)" [style.color]="wireColor(w)">
              {{ w.type }}
            </div>
          }

          <!-- coordinador -->
          <div class="cnode" [class.dead]="!coordAlive()" [style.left.%]="px[0]" [style.top.%]="py[0]">
            <div class="n-name">🎖 Coordinador {{ coordAlive() ? '' : '💀' }}</div>
            <div class="n-state">
              @if (!coordAlive()) { caído }
              @else {
                @switch (phase()) {
                  @case ('idle') { esperando }
                  @case ('prepare') { fase 1: juntando votos ({{ votesIn() }}/{{ aliveParts() }}) }
                  @case ('done') { transacción terminada }
                }
              }
            </div>
            <div class="wal">
              <span class="wal-t">log:</span>
              @for (l of coordLog(); track $index) { <span class="wal-e">{{ l }}</span> }
              @if (coordLog().length === 0) { <span class="wal-empty">vacío</span> }
            </div>
            @if (!coordAlive()) {
              <button class="revive" (click)="reviveCoord()">💚 recuperar coordinador</button>
            }
          </div>

          <!-- participantes -->
          @for (p of parts(); track p.id) {
            <div class="pnode" [class.dead]="!p.alive" [class.uncertain]="isUncertain(p)"
                 [class.committed]="p.state === 'committed'" [class.aborted]="p.state === 'aborted'"
                 [style.left.%]="px[p.id]" [style.top.%]="py[p.id]">
              <div class="n-name">🗄 P{{ p.id }} {{ p.alive ? '' : '💀' }}</div>
              <div class="n-state">
                @if (!p.alive) { caído — no vota }
                @else {
                  @switch (p.state) {
                    @case ('init') { esperando PREPARE }
                    @case ('ready') { READY — <strong>incierto</strong> 🔒 }
                    @case ('committed') { ✔ COMMIT aplicado }
                    @case ('aborted') { ✘ abortado / rollback }
                  }
                }
              </div>
              <div class="wal">
                <span class="wal-t">log:</span>
                @for (l of p.log; track $index) { <span class="wal-e">{{ l }}</span> }
                @if (p.log.length === 0) { <span class="wal-empty">vacío</span> }
              </div>
              <div class="pbtns">
                <button class="pb" [class.no]="p.voteNo" (click)="toggleVote(p.id)" [disabled]="phase() === 'prepare'">
                  {{ p.voteNo ? 'votará NO' : 'votará SÍ' }}
                </button>
                <button class="pb" (click)="togglePart(p.id)" [disabled]="phase() === 'prepare' && p.alive">
                  {{ p.alive ? '💀 matar' : '💚 revivir' }}
                </button>
              </div>
            </div>
          }

        </div>

        <div class="side">
          <div class="panel">
            <div class="p-title">el protocolo</div>
            <ol class="proto">
              <li [class.now]="phase() === 'prepare'">
                <strong>Fase 1 (votación):</strong> PREPARE → cada participante escribe en su log y vota SÍ/NO.
                Votar SÍ = promesa: "puedo commitear aunque me caiga".
              </li>
              <li>
                <strong>Fase 2 (decisión):</strong> todos SÍ → COMMIT; algún NO o timeout → ABORT.
                La decisión se escribe en el log ANTES de enviarse.
              </li>
            </ol>
          </div>
          <div class="panel">
            <div class="p-title">reglas de oro</div>
            <div class="p-note">
              · El que vota NO puede abortar solo.<br />
              · El que votó SÍ queda <strong>INCIERTO</strong>: no puede ni commitear ni abortar
              hasta saber la decisión — con los locks tomados.<br />
              · Un caído sin votar = NO (timeout).
            </div>
          </div>
        </div>
      </div>

      @if (result(); as r) {
        <div class="result" [class.ok]="r === 'commit'">
          {{ r === 'commit' ? '✔ COMMIT global: los 3 aplicaron los cambios' : '✘ ABORT global: nadie aplicó nada' }}
          — atomicidad preservada
        </div>
      }

      @if (blocked()) {
        <div class="blocked">
          🔒 <strong>El problema del BLOQUEO de 2PC</strong>: los participantes votaron SÍ y quedaron
          READY, pero el coordinador murió antes de comunicar la decisión. No pueden abortar (quizá
          la decisión fue COMMIT) ni commitear (quizá fue ABORT) → quedan <strong>bloqueados con los
          locks tomados</strong> hasta que el coordinador vuelva. Esta es LA debilidad de 2PC
          (3PC y los protocolos de consenso existen por esto). Tocá "recuperar coordinador".
        </div>
      }

      <div class="status" [class.idle]="events().length === 0">
        @if (events().length === 0) {
          Probá primero la transacción feliz. Después: un participante que vota NO, uno caído,
          y el gran final: matar al coordinador tras los votos.
        }
        @for (e of lastEvents(); track $index) {
          <div [innerHTML]="e"></div>
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
    .ctl { background: var(--panel-2); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 7px 12px; cursor: pointer; font-size: 0.86rem; }
    .ctl:hover:not(:disabled) { background: #2d3750; }
    .ctl:disabled { opacity: 0.4; cursor: default; }
    .ctl.play { background: #1f6feb; border-color: #1f6feb; color: #fff; font-weight: 700; }
    .ctl.badon { background: #c73e3a; border-color: #c73e3a; color: #fff; font-weight: 700; }

    .board { display: flex; gap: 12px; align-items: stretch; }
    .arena { position: relative; flex: 1; min-height: 380px; background: radial-gradient(ellipse at 50% 45%, #202a40 0%, #171e2e 80%); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
    .arena svg { position: absolute; inset: 0; width: 100%; height: 100%; }
    .edge { stroke: #39445f; stroke-width: 0.5; stroke-dasharray: 1 1.6; vector-effect: non-scaling-stroke; }
    .msg { position: absolute; transform: translate(-50%, -50%); z-index: 3; background: rgba(8, 12, 22, 0.95); border: 1.5px solid; border-radius: 7px; padding: 2px 8px; font-family: Consolas, monospace; font-size: 0.62rem; font-weight: 700; white-space: nowrap; }

    .cnode, .pnode { position: absolute; transform: translate(-50%, -50%); z-index: 2; background: #10151f; border: 1.5px solid var(--border); border-radius: 10px; padding: 7px 10px; width: 190px; display: flex; flex-direction: column; gap: 4px; transition: border-color 0.25s, opacity 0.25s; }
    .cnode { border-color: #f0883e; }
    .cnode.dead, .pnode.dead { opacity: 0.7; border-color: #5c3a3e; background: #1c1216; }
    .pnode.uncertain { border-color: #ffd54f; box-shadow: 0 0 14px rgba(255, 213, 79, 0.25); }
    .pnode.committed { border-color: #2ea043; }
    .pnode.aborted { border-color: #ef5350; }
    .n-name { font-weight: 800; font-size: 0.78rem; color: #fff; }
    .n-state { font-size: 0.68rem; color: var(--text-dim); min-height: 16px; }
    .n-state strong { color: #ffd54f; }
    .wal { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; background: #0b0f19; border: 1px solid var(--border); border-radius: 6px; padding: 3px 6px; min-height: 22px; }
    .wal-t { font-size: 0.58rem; color: #5c6a8e; font-weight: 700; }
    .wal-e { font-family: Consolas, monospace; font-size: 0.6rem; color: #7ee787; background: #1a2132; border-radius: 4px; padding: 0 5px; }
    .wal-empty { font-size: 0.6rem; color: #5c6a8e; font-style: italic; }
    .pbtns { display: flex; gap: 4px; }
    .pb { flex: 1; background: var(--panel-2); color: var(--text-dim); border: 1px solid var(--border); border-radius: 6px; padding: 3px 6px; cursor: pointer; font-size: 0.62rem; font-weight: 700; }
    .pb:hover:not(:disabled) { color: var(--text); }
    .pb:disabled { opacity: 0.4; cursor: default; }
    .pb.no { background: #c73e3a; border-color: #c73e3a; color: #fff; }
    .revive { background: #2ea043; border: none; color: #fff; border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 0.66rem; font-weight: 700; }

    .result { margin-top: 12px; background: rgba(239, 83, 80, 0.1); border: 1px solid #ef5350; color: #ef9a9a; border-radius: 10px; padding: 9px 14px; font-size: 0.88rem; font-weight: 700; text-align: center; }
    .result.ok { background: rgba(46, 160, 67, 0.1); border-color: #2ea043; color: #7ee787; }

    .side { width: 250px; flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; }
    .panel { background: #10151f; border: 1px solid var(--border); border-radius: 10px; padding: 9px 12px; }
    .p-title { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 1px; color: #5c6a8e; font-weight: 700; margin-bottom: 5px; }
    .proto { margin: 0; padding-left: 16px; font-size: 0.72rem; color: var(--text-dim); line-height: 1.5; }
    .proto li { margin-bottom: 6px; padding: 2px 4px; border-radius: 5px; }
    .proto li.now { background: rgba(255, 213, 79, 0.08); color: var(--text); }
    .proto strong { color: var(--text); }
    .p-note { font-size: 0.7rem; color: var(--text-dim); line-height: 1.6; }
    .p-note strong { color: #ffd54f; }

    .blocked { margin-top: 12px; background: rgba(255, 213, 79, 0.08); border: 1px solid #ffd54f; border-radius: 10px; padding: 12px 14px; font-size: 0.88rem; line-height: 1.55; }

    .status { margin-top: 12px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; min-height: 46px; font-size: 0.85rem; line-height: 1.55; }
    .status.idle { color: var(--text-dim); font-style: italic; }

    @media (max-width: 720px) {
      .board { flex-direction: column; }
      .side { width: 100%; }
      .cnode, .pnode { width: 150px; }
    }
  `,
})
export class TwophaseDetail implements OnDestroy {
  readonly px = PX;
  readonly py = PY;

  readonly running = signal(false);
  readonly phase = signal<'idle' | 'prepare' | 'done'>('idle');
  readonly coordAlive = signal(true);
  readonly killAfterVotes = signal(false);
  readonly coordLog = signal<string[]>([]);
  readonly parts = signal<Part[]>(this.fresh());
  readonly wires = signal<Wire[]>([]);
  readonly result = signal<'commit' | 'abort' | null>(null);
  readonly events = signal<string[]>([]);

  readonly lastEvents = computed(() => this.events().slice(-3));
  readonly aliveParts = computed(() => this.parts().filter((p) => p.alive).length);
  readonly votesIn = computed(() => {
    this._votesTick(); // dependencia reactiva: votes es un campo plano
    return Object.keys(this.votes).length;
  });
  readonly blocked = computed(
    () => !this.coordAlive() && this.parts().some((p) => p.alive && p.state === 'ready'),
  );

  private readonly _votesTick = signal(0);
  private votes: Record<number, boolean> = {};
  private acks = 0;
  private timers: Timer[] = [];
  private rafId = 0;
  private lastTs = 0;

  private fresh(): Part[] {
    return [1, 2, 3].map((id) => ({ id, alive: true, voteNo: false, state: 'init' as PState, log: [] }));
  }

  isUncertain(p: Part): boolean {
    return p.alive && p.state === 'ready';
  }

  wx(w: Wire): number {
    const p = Math.min(w.t / w.dur, 1);
    return PX[w.from] + (PX[w.to] - PX[w.from]) * p;
  }
  wy(w: Wire): number {
    const p = Math.min(w.t / w.dur, 1);
    return PY[w.from] + (PY[w.to] - PY[w.from]) * p;
  }
  wireColor(w: Wire): string {
    if (w.type === 'PREPARE') return '#ffd54f';
    if (w.type === 'VOTE-YES' || w.type === 'ACK') return '#7ee787';
    if (w.type === 'VOTE-NO') return '#ef5350';
    if (w.type === 'COMMIT') return '#2ea043';
    return '#ef5350';
  }

  toggleVote(id: number): void {
    const ps = this.parts().map((p) => (p.id === id ? { ...p, voteNo: !p.voteNo } : p));
    this.parts.set(ps);
  }

  togglePart(id: number): void {
    const ps = this.parts().map((p) => (p.id === id ? { ...p, alive: !p.alive } : p));
    this.parts.set(ps);
    const p = ps.find((x) => x.id === id)!;
    this.logEv(p.alive ? `💚 P${id} revive.` : `💀 P${id} se cae: no va a responder al PREPARE.`);
  }

  toggleKill(): void {
    this.killAfterVotes.update((v) => !v);
  }

  start(): void {
    if (this.phase() === 'prepare' || !this.coordAlive()) return;
    // limpiar la transacción anterior
    this.parts.update((ps) => ps.map((p) => ({ ...p, state: 'init' as PState, log: [] })));
    this.coordLog.set(['begin ✍']);
    this.result.set(null);
    this.votes = {};
    this.acks = 0;
    this.phase.set('prepare');
    this.logEv('📤 <strong>Fase 1</strong>: el coordinador escribe <code>begin</code> en su log y manda PREPARE a los 3.');
    for (const p of this.parts()) {
      this.send(0, p.id, 'PREPARE');
    }
    // timeout de votos: un caído cuenta como NO
    this.timers.push({
      t: 3200,
      fn: () => {
        if (this.phase() !== 'prepare' || !this.coordAlive()) return;
        const missing = this.parts().filter((p) => this.votes[p.id] === undefined);
        if (missing.length > 0) {
          this.logEv(
            `⏰ Timeout: ${missing.map((p) => 'P' + p.id).join(', ')} no votó. El coordinador lo cuenta como <strong>NO</strong>.`,
          );
          for (const m of missing) this.votes[m.id] = false;
          this.decide();
        }
      },
    });
    if (!this.running()) this.toggleRun();
  }

  reviveCoord(): void {
    if (this.coordAlive()) return;
    this.coordAlive.set(true);
    // recovery: el log no tiene decisión → abortar es lo único seguro
    this.coordLog.update((l) => [...l, 'recovery', 'abort ✍']);
    this.logEv(
      '💚 El coordinador vuelve y lee su log: hay <code>begin</code> pero NO hay decisión escrita → ' +
        'lo único seguro es <strong>ABORT</strong>. Avisa a los participantes bloqueados.',
    );
    for (const p of this.parts()) {
      if (p.alive && p.state === 'ready') this.send(0, p.id, 'ABORT');
    }
    this.result.set('abort');
    this.phase.set('done');
    if (!this.running()) this.toggleRun();
  }

  private send(from: number, to: number, type: MsgType): void {
    this.wires.update((ws) => [...ws, { from, to, t: 0, dur: 900, type }]);
  }

  private deliver(w: Wire): void {
    if (w.to === 0) {
      // llega al coordinador
      if (!this.coordAlive()) return;
      if (w.type === 'VOTE-YES' || w.type === 'VOTE-NO') {
        this.votes[w.from] = w.type === 'VOTE-YES';
        this._votesTick.update((v) => v + 1);
        if (Object.keys(this.votes).length === this.parts().length) this.decide();
      } else if (w.type === 'ACK') {
        this.acks++;
      }
      return;
    }
    const ps = this.parts().map((p) => ({ ...p, log: [...p.log] }));
    const p = ps.find((x) => x.id === w.to)!;
    if (!p.alive) return;
    if (w.type === 'PREPARE') {
      if (p.voteNo) {
        p.log.push('abort ✍');
        p.state = 'aborted';
        this.send(p.id, 0, 'VOTE-NO');
        this.logEv(`🗳 P${p.id} vota <strong>NO</strong> y aborta local: el que vota NO puede abortar solo.`);
      } else {
        p.log.push('prepared ✍');
        p.state = 'ready';
        this.send(p.id, 0, 'VOTE-YES');
      }
    } else if (w.type === 'COMMIT') {
      p.log.push('commit ✍');
      p.state = 'committed';
      this.send(p.id, 0, 'ACK');
    } else if (w.type === 'ABORT') {
      if (p.state === 'ready') {
        p.log.push('rollback');
        p.state = 'aborted';
      }
    }
    this.parts.set(ps);
  }

  private decide(): void {
    if (this.phase() !== 'prepare') return;
    if (this.killAfterVotes()) {
      this.coordAlive.set(false);
      this.killAfterVotes.set(false);
      this.logEv(
        '💥 <strong>El coordinador MUERE</strong> justo después de juntar los votos, ANTES de escribir ' +
          'y comunicar la decisión. Mirá a los que votaron SÍ…',
      );
      return;
    }
    const allYes = this.parts().every((p) => this.votes[p.id] === true);
    if (allYes) {
      this.coordLog.update((l) => [...l, 'commit ✍']);
      this.logEv('✅ <strong>Fase 2</strong>: todos votaron SÍ → el coordinador escribe <code>commit</code> y lo comunica.');
      for (const p of this.parts()) {
        if (p.alive && p.state === 'ready') this.send(0, p.id, 'COMMIT');
      }
      this.result.set('commit');
    } else {
      this.coordLog.update((l) => [...l, 'abort ✍']);
      this.logEv('🛑 <strong>Fase 2</strong>: hubo al menos un NO (o timeout) → ABORT global. Los READY hacen rollback.');
      for (const p of this.parts()) {
        if (p.alive && p.state === 'ready') this.send(0, p.id, 'ABORT');
      }
      this.result.set('abort');
    }
    this.phase.set('done');
  }

  toggleRun(): void {
    if (this.running()) {
      this.running.set(false);
      cancelAnimationFrame(this.rafId);
    } else {
      this.running.set(true);
      this.lastTs = performance.now();
      this.rafId = requestAnimationFrame(this.tick);
    }
  }

  private readonly tick = (now: number): void => {
    if (!this.running()) return;
    const dt = Math.min(now - this.lastTs, 100);
    this.lastTs = now;

    const ws = this.wires().map((w) => ({ ...w, t: w.t + dt }));
    const arrived = ws.filter((w) => w.t >= w.dur);
    this.wires.set(ws.filter((w) => w.t < w.dur));
    for (const w of arrived) this.deliver(w);

    const due: Timer[] = [];
    this.timers = this.timers.filter((tm) => {
      tm.t -= dt;
      if (tm.t <= 0) {
        due.push(tm);
        return false;
      }
      return true;
    });
    for (const tm of due) tm.fn();

    this.rafId = requestAnimationFrame(this.tick);
  };

  private logEv(html: string): void {
    this.events.update((e) => [...e.slice(-30), html]);
  }

  reset(): void {
    this.running.set(false);
    cancelAnimationFrame(this.rafId);
    this.phase.set('idle');
    this.coordAlive.set(true);
    this.killAfterVotes.set(false);
    this.coordLog.set([]);
    this.parts.set(this.fresh());
    this.wires.set([]);
    this.result.set(null);
    this.events.set([]);
    this.votes = {};
    this.acks = 0;
    this.timers = [];
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.rafId);
  }
}
