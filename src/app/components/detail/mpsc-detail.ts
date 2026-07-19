import { ChangeDetectionStrategy, Component, OnDestroy, computed, signal } from '@angular/core';

interface Producer {
  id: number;
  alive: boolean;
  blocked: boolean; // canal acotado lleno
  t: number;
  dur: number;
  sent: number;
}

interface Item {
  emoji: string;
  from: number;
}

const EMOJIS = ['📦', '📨', '🧮', '🎁', '🔧', '🍕'];
const COLORS = ['#58a6ff', '#7ee787', '#a78bfa'];
const CAP = 3;

/**
 * Canal mpsc: 3 productores clonan el Sender, un único Receiver consume.
 * Click en un productor lo "dropea"; cuando caen todos y se vacía el canal,
 * recv() devuelve Err y el consumidor termina. Toggle de canal acotado.
 */
@Component({
  selector: 'app-mpsc-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="anim">
      <div class="head">
        <div class="titles">
          <div class="title">📬 Canal mpsc: múltiples productores, un consumidor</div>
          <div class="caption">
            Click en un productor para <strong>dropear su Sender</strong>. ¿Qué pasa cuando caen los tres?
          </div>
        </div>
        <div class="controls">
          <button class="ctl play" (click)="toggleRun()">{{ running() ? '⏸ Pausa' : '▶ Correr' }}</button>
          <button class="ctl" [class.on]="bounded()" (click)="toggleBounded()">
            {{ bounded() ? 'sync_channel(' + cap + ') ON' : 'probar canal acotado' }}
          </button>
          <button class="ctl" (click)="reset()">↺ Reset</button>
        </div>
      </div>

      <div class="sliders">
        <label>
          🏭 velocidad productores
          <input type="range" min="1" max="10" [value]="prodSpeed()" (input)="setProdSpeed($event)" />
        </label>
        <label>
          📥 velocidad consumidor
          <input type="range" min="1" max="10" [value]="consSpeed()" (input)="setConsSpeed($event)" />
        </label>
      </div>

      <div class="board">
        <!-- productores -->
        <div class="col">
          @for (p of producers(); track p.id) {
            <button class="prod" [style.--tc]="colors[p.id]" [class.dead]="!p.alive"
                    [class.blocked]="p.blocked" (click)="dropProducer(p.id)">
              <div class="p-head">
                <span class="p-name">🏭 P{{ p.id + 1 }}</span>
                <span class="p-state">
                  @if (!p.alive) { 💀 Sender dropeado }
                  @else if (p.blocked) { ⛔ canal lleno }
                  @else { tx.send(…) · {{ p.sent }} }
                </span>
              </div>
              @if (p.alive) {
                <div class="bar-track">
                  <div class="bar" [class.blockbar]="p.blocked"
                       [style.width.%]="p.blocked ? 100 : (p.t / p.dur) * 100"></div>
                </div>
              }
            </button>
          }
        </div>

        <!-- canal -->
        <div class="chan" [class.closed]="channelClosed()">
          <div class="chan-label">
            canal {{ bounded() ? '· cap ' + cap : '(sin límite)' }} · en cola: {{ queue().length }}
          </div>
          <div class="chan-body">
            @if (queue().length === 0) {
              <span class="chan-empty">{{ channelClosed() ? '⛔ cerrado' : 'vacío' }}</span>
            }
            @for (it of queue(); track $index) {
              <span class="item" [style.border-color]="colors[it.from]">{{ it.emoji }}</span>
            }
          </div>
          <div class="chan-note">
            los ítems <strong>se mueven</strong> (ownership): el productor ya no los puede tocar
          </div>
        </div>

        <!-- consumidor -->
        <div class="col">
          <div class="cons" [class.done]="consumerDone()">
            <div class="p-head">
              <span class="p-name">📥 Consumidor</span>
              <span class="p-state">
                @if (consumerDone()) { ✔ terminó }
                @else if (processing()) { procesando {{ processing()!.emoji }} }
                @else { rx.recv() — bloqueado }
              </span>
            </div>
            @if (processing()) {
              <div class="bar-track">
                <div class="bar consbar" [style.width.%]="(consT() / consDur()) * 100"></div>
              </div>
            }
            <div class="cons-count">recibidos: <strong>{{ received() }}</strong></div>
          </div>
          @if (consumerDone()) {
            <div class="err-box">
              <code>rx.recv()</code> → <code>Err(RecvError)</code><br />
              <span>todos los Senders fueron dropeados y el canal se vació: así se detecta el FIN sin ningún flag compartido.</span>
            </div>
          }
        </div>
      </div>

      <div class="status" [class.idle]="events().length === 0">
        @if (events().length === 0) {
          Presioná ▶. El <code>Sender</code> se clona (P1, P2, P3); el <code>Receiver</code> es único —
          por eso "mpsc". Después probá dropear productores de a uno.
        }
        @for (e of lastEvents(); track $index) {
          <div [innerHTML]="e"></div>
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
    .ctl { background: var(--panel-2); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 7px 12px; cursor: pointer; font-size: 0.86rem; }
    .ctl:hover { background: #2d3750; }
    .ctl.play { background: #1f6feb; border-color: #1f6feb; color: #fff; font-weight: 700; min-width: 96px; }
    .ctl.on { background: #f68c1f; border-color: #f68c1f; color: #0d1117; font-weight: 700; }

    .sliders { display: flex; gap: 22px; flex-wrap: wrap; margin-bottom: 12px; }
    .sliders label { display: flex; align-items: center; gap: 10px; font-size: 0.8rem; color: var(--text-dim); }
    .sliders input { accent-color: var(--accent); width: 140px; }

    .board { display: grid; grid-template-columns: 1fr 1.3fr 1fr; gap: 12px; align-items: start; }
    .col { display: flex; flex-direction: column; gap: 8px; }
    .prod { text-align: left; background: #10151f; border: 1px solid var(--border); border-left: 4px solid var(--tc); border-radius: 9px; padding: 8px 10px; cursor: pointer; color: var(--text); width: 100%; }
    .prod:hover:not(.dead) { border-color: #ef5350; }
    .prod.dead { opacity: 0.45; cursor: default; }
    .prod.blocked { border-color: #ef535066; }
    .p-head { display: flex; justify-content: space-between; gap: 6px; font-size: 0.78rem; margin-bottom: 5px; flex-wrap: wrap; }
    .p-name { font-weight: 800; }
    .p-state { color: var(--text-dim); font-size: 0.7rem; font-family: Consolas, monospace; }
    .bar-track { height: 6px; background: #0b0f19; border-radius: 4px; overflow: hidden; }
    .bar { height: 100%; background: var(--tc, #58a6ff); }
    .bar.blockbar { background: repeating-linear-gradient(45deg, #3a2224, #3a2224 6px, #55282b 6px, #55282b 12px); }
    .bar.consbar { background: #ffab70; }

    .chan { background: radial-gradient(ellipse at 50% 40%, #202a40 0%, #171e2e 80%); border: 1px solid var(--border); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 8px; min-height: 130px; }
    .chan.closed { border-color: #ef535088; }
    .chan-label { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 1px; color: #5c6a8e; font-weight: 700; text-align: center; }
    .chan-body { display: flex; gap: 5px; align-items: center; justify-content: flex-start; flex-wrap: wrap; min-height: 44px; }
    .chan-empty { color: #5c6a8e; font-style: italic; font-size: 0.8rem; margin: 0 auto; }
    .item { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; background: #0b0f19; border: 2px solid; border-radius: 8px; font-size: 1.1rem; }
    .chan-note { font-size: 0.68rem; color: #5c6a8e; text-align: center; }
    .chan-note strong { color: #8b95b5; }

    .cons { background: #10151f; border: 1px solid var(--border); border-left: 4px solid #ffab70; border-radius: 9px; padding: 8px 10px; }
    .cons.done { border-color: #2ea043; }
    .cons-count { margin-top: 6px; font-size: 0.74rem; color: var(--text-dim); }
    .cons-count strong { color: var(--text); font-family: Consolas, monospace; }
    .err-box { background: rgba(46, 160, 67, 0.08); border: 1px solid #2ea04366; border-radius: 9px; padding: 8px 10px; font-size: 0.74rem; line-height: 1.5; color: var(--text-dim); }

    .status { margin-top: 12px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; min-height: 46px; font-size: 0.85rem; line-height: 1.55; }
    .status.idle { color: var(--text-dim); font-style: italic; }

    @media (max-width: 720px) {
      .board { grid-template-columns: 1fr; }
    }
  `,
})
export class MpscDetail implements OnDestroy {
  readonly colors = COLORS;
  readonly cap = CAP;

  readonly running = signal(false);
  readonly bounded = signal(false);
  readonly prodSpeed = signal(5);
  readonly consSpeed = signal(7);
  readonly producers = signal<Producer[]>(this.fresh());
  readonly queue = signal<Item[]>([]);
  readonly processing = signal<Item | null>(null);
  readonly consT = signal(0);
  readonly consDur = signal(1);
  readonly received = signal(0);
  readonly consumerDone = signal(false);
  readonly events = signal<string[]>([]);

  readonly channelClosed = computed(() => this.producers().every((p) => !p.alive));
  readonly lastEvents = computed(() => this.events().slice(-3));

  private rafId = 0;
  private lastTs = 0;
  private seq = 0;

  private fresh(): Producer[] {
    return [0, 1, 2].map((id) => ({
      id,
      alive: true,
      blocked: false,
      t: 0,
      dur: this.prodDur(),
      sent: 0,
    }));
  }

  private prodDur(): number {
    return 2600 - this.prodSpeed() * 210 + Math.random() * 500;
  }
  private procDur(): number {
    return 1300 - this.consSpeed() * 100 + Math.random() * 200;
  }

  setProdSpeed(ev: Event): void {
    this.prodSpeed.set(+(ev.target as HTMLInputElement).value);
  }
  setConsSpeed(ev: Event): void {
    this.consSpeed.set(+(ev.target as HTMLInputElement).value);
  }

  toggleBounded(): void {
    this.bounded.update((v) => !v);
    this.logEv(
      this.bounded()
        ? `📏 Canal acotado <code>sync_channel(${CAP})</code>: si está lleno, <code>send()</code> BLOQUEA al productor (backpressure).`
        : '♾ Canal sin límite: send() nunca bloquea… y la cola puede crecer sin control si el consumidor no da abasto.',
    );
  }

  dropProducer(id: number): void {
    const ps = this.producers().map((p) => ({ ...p }));
    if (!ps[id].alive) return;
    ps[id].alive = false;
    this.producers.set(ps);
    const left = ps.filter((p) => p.alive).length;
    this.logEv(
      left > 0
        ? `💀 P${id + 1} dropea su <code>Sender</code>. Quedan ${left} — el canal sigue abierto.`
        : `💀 P${id + 1} era el último: <strong>no quedan Senders</strong>. El consumidor va a drenar la cola y recv() devolverá Err.`,
    );
  }

  toggleRun(): void {
    if (this.running()) {
      this.running.set(false);
      cancelAnimationFrame(this.rafId);
    } else {
      if (this.consumerDone()) return;
      this.running.set(true);
      this.lastTs = performance.now();
      this.rafId = requestAnimationFrame(this.tick);
    }
  }

  private readonly tick = (now: number): void => {
    if (!this.running()) return;
    const dt = Math.min(now - this.lastTs, 100);
    this.lastTs = now;

    // productores
    const ps = this.producers().map((p) => ({ ...p }));
    for (const p of ps) {
      if (!p.alive) continue;
      const full = this.bounded() && this.queue().length >= CAP;
      if (p.t >= p.dur) {
        if (full) {
          if (!p.blocked) {
            p.blocked = true;
            this.logEv(`P${p.id + 1} quiere mandar pero el canal está lleno → <code>send()</code> lo bloquea.`);
          }
        } else {
          const item: Item = { emoji: EMOJIS[this.seq++ % EMOJIS.length], from: p.id };
          this.queue.update((q) => [...q, item]);
          p.sent++;
          p.blocked = false;
          p.t = 0;
          p.dur = this.prodDur();
        }
      } else {
        p.t += dt;
      }
    }
    this.producers.set(ps);

    // consumidor
    if (!this.consumerDone()) {
      if (this.processing()) {
        this.consT.update((t) => t + dt);
        if (this.consT() >= this.consDur()) {
          this.received.update((r) => r + 1);
          this.processing.set(null);
        }
      }
      if (!this.processing()) {
        const q = this.queue();
        if (q.length > 0) {
          this.processing.set(q[0]);
          this.queue.set(q.slice(1));
          this.consT.set(0);
          this.consDur.set(this.procDur());
        } else if (this.channelClosed()) {
          this.consumerDone.set(true);
          this.running.set(false);
          this.logEv(
            `🏁 <code>rx.recv()</code> devolvió <code>Err</code>: canal cerrado y vacío. El consumidor procesó <strong>${this.received()}</strong> mensajes y termina limpiamente.`,
          );
          return;
        }
      }
    }

    this.rafId = requestAnimationFrame(this.tick);
  };

  private logEv(html: string): void {
    this.events.update((e) => [...e.slice(-30), html]);
  }

  reset(): void {
    this.running.set(false);
    cancelAnimationFrame(this.rafId);
    this.producers.set(this.fresh());
    this.queue.set([]);
    this.processing.set(null);
    this.consT.set(0);
    this.received.set(0);
    this.consumerDone.set(false);
    this.events.set([]);
    this.seq = 0;
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.rafId);
  }
}
