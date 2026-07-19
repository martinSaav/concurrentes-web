import { ChangeDetectionStrategy, Component, OnDestroy, computed, signal } from '@angular/core';

interface Msg {
  emoji: string;
  from: string; // 'vos' o nombre de actor
}

interface Actor {
  id: number;
  name: string;
  emoji: string;
  mailbox: Msg[];
  processing: Msg | null;
  t: number;
  dur: number;
  processed: number; // estado interno: muta SIN locks
}

const COLORS = ['#58a6ff', '#7ee787', '#a78bfa'];
const MSG_EMOJIS = ['✉️', '📩', '📮'];

/**
 * Modelo de actores: 3 actores con mailbox. Cada actor procesa DE A UN
 * mensaje y puede mandar mensajes a otros al procesar. Click en un actor
 * para inyectarle un mensaje. Sin locks: la exclusión sale de la secuencialidad.
 */
@Component({
  selector: 'app-actors-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="anim">
      <div class="head">
        <div class="titles">
          <div class="title">🎭 Actores: mailbox + procesamiento secuencial</div>
          <div class="caption">
            Click en un actor para mandarle un mensaje. Al procesar, a veces le escribe a otro actor.
          </div>
        </div>
        <div class="controls">
          <button class="ctl play" (click)="toggleRun()">{{ running() ? '⏸ Pausa' : '▶ Correr' }}</button>
          <button class="ctl" [class.on]="auto()" (click)="toggleAuto()">
            {{ auto() ? '🌊 tráfico auto ON' : 'tráfico auto' }}
          </button>
          <button class="ctl" (click)="reset()">↺ Reset</button>
        </div>
      </div>

      <div class="board">
        @for (a of actors(); track a.id) {
          <button class="actor" [style.--tc]="colors[a.id]" (click)="inject(a.id, 'vos')">
            <div class="a-top">
              <span class="a-name">{{ a.emoji }} {{ a.name }}</span>
              <span class="a-count">procesados: {{ a.processed }}</span>
            </div>

            <div class="mailbox">
              <div class="mb-label">mailbox ({{ a.mailbox.length }})</div>
              <div class="mb-body">
                @if (a.mailbox.length === 0) {
                  <span class="mb-empty">vacío</span>
                }
                @for (m of mailboxPreview(a); track $index) {
                  <span class="msg">{{ m.emoji }}</span>
                }
                @if (a.mailbox.length > 6) {
                  <span class="mb-more">+{{ a.mailbox.length - 6 }}</span>
                }
              </div>
            </div>

            <div class="proc">
              @if (a.processing; as m) {
                <div class="proc-label">procesando {{ m.emoji }} <em>de {{ m.from }}</em></div>
                <div class="bar-track">
                  <div class="bar" [style.width.%]="(a.t / a.dur) * 100"></div>
                </div>
              } @else {
                <div class="proc-label idle-t">😴 esperando mensajes</div>
              }
            </div>

            <div class="state">
              estado interno: <code>contador = {{ a.processed }}</code>
              <span class="nolock">sin lock 🔓</span>
            </div>
          </button>
        }
      </div>

      <div class="invariant">
        <strong>El invariante clave:</strong> cada actor procesa <strong>un mensaje a la vez</strong> —
        su estado interno jamás lo tocan dos "manos" a la vez, aunque le lleguen 100 mensajes juntos.
        La exclusión mutua no viene de un lock: viene de la <strong>secuencialidad del mailbox</strong>.
      </div>

      <div class="status" [class.idle]="events().length === 0">
        @if (events().length === 0) {
          Presioná ▶ y clickeá actores para cargarles el mailbox. Activá el tráfico auto para ver
          actores mandándose mensajes entre ellos.
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
    .ctl:hover { background: #2d3750; }
    .ctl.play { background: #1f6feb; border-color: #1f6feb; color: #fff; font-weight: 700; min-width: 96px; }
    .ctl.on { background: #f68c1f; border-color: #f68c1f; color: #0d1117; font-weight: 700; }

    .board { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .actor { text-align: left; background: radial-gradient(ellipse at 50% 30%, #202a40 0%, #171e2e 90%); border: 1.5px solid var(--border); border-top: 4px solid var(--tc); border-radius: 10px; padding: 10px 12px; cursor: pointer; color: var(--text); display: flex; flex-direction: column; gap: 8px; transition: border-color 0.15s, transform 0.15s; }
    .actor:hover { border-color: var(--tc); transform: translateY(-2px); }
    .a-top { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; flex-wrap: wrap; }
    .a-name { font-weight: 800; font-size: 0.9rem; color: var(--tc); }
    .a-count { font-size: 0.66rem; color: var(--text-dim); font-family: Consolas, monospace; }

    .mailbox { background: #10151f; border: 1px solid var(--border); border-radius: 8px; padding: 6px 8px; }
    .mb-label { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 1px; color: #5c6a8e; font-weight: 700; margin-bottom: 4px; }
    .mb-body { display: flex; gap: 3px; align-items: center; min-height: 24px; flex-wrap: wrap; }
    .mb-empty { color: #5c6a8e; font-style: italic; font-size: 0.72rem; }
    .msg { font-size: 0.95rem; }
    .mb-more { font-size: 0.68rem; color: var(--text-dim); font-family: Consolas, monospace; }

    .proc { min-height: 34px; }
    .proc-label { font-size: 0.72rem; color: var(--text); margin-bottom: 4px; }
    .proc-label em { color: var(--text-dim); font-style: normal; font-size: 0.66rem; }
    .proc-label.idle-t { color: #5c6a8e; font-style: italic; }
    .bar-track { height: 6px; background: #0b0f19; border-radius: 4px; overflow: hidden; }
    .bar { height: 100%; background: var(--tc); }

    .state { font-size: 0.68rem; color: var(--text-dim); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .nolock { color: #7ee787; font-size: 0.62rem; font-weight: 700; }

    .invariant { margin-top: 12px; background: rgba(240, 136, 62, 0.07); border-left: 3px solid var(--accent); border-radius: 0 8px 8px 0; padding: 10px 14px; font-size: 0.85rem; line-height: 1.55; color: var(--text); }

    .status { margin-top: 12px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; min-height: 46px; font-size: 0.85rem; line-height: 1.55; }
    .status.idle { color: var(--text-dim); font-style: italic; }

    @media (max-width: 720px) {
      .board { grid-template-columns: 1fr; }
    }
  `,
})
export class ActorsDetail implements OnDestroy {
  readonly colors = COLORS;

  readonly running = signal(false);
  readonly auto = signal(false);
  readonly actors = signal<Actor[]>(this.fresh());
  readonly events = signal<string[]>([]);

  readonly lastEvents = computed(() => this.events().slice(-3));

  private rafId = 0;
  private lastTs = 0;
  private autoAcc = 0;

  private fresh(): Actor[] {
    const specs = [
      { name: 'Contador', emoji: '🧮' },
      { name: 'Logger', emoji: '📋' },
      { name: 'Notificador', emoji: '🔔' },
    ];
    return specs.map((s, id) => ({
      id,
      name: s.name,
      emoji: s.emoji,
      mailbox: [],
      processing: null,
      t: 0,
      dur: 1,
      processed: 0,
    }));
  }

  mailboxPreview(a: Actor): Msg[] {
    return a.mailbox.slice(0, 6);
  }

  toggleAuto(): void {
    this.auto.update((v) => !v);
    if (this.auto() && !this.running()) this.toggleRun();
  }

  inject(id: number, from: string): void {
    const as = this.actors().map((a) => ({ ...a, mailbox: [...a.mailbox] }));
    const emoji = MSG_EMOJIS[Math.floor(Math.random() * MSG_EMOJIS.length)];
    as[id].mailbox.push({ emoji, from });
    this.actors.set(as);
    if (from === 'vos') {
      this.logEv(`${emoji} Mensaje tuyo al mailbox de <strong>${as[id].name}</strong> (send es asincrónico: no espera respuesta).`);
      if (!this.running()) this.toggleRun();
    }
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

    const as = this.actors().map((a) => ({ ...a, mailbox: [...a.mailbox] }));
    const outbox: { to: number; from: string }[] = [];

    for (const a of as) {
      if (a.processing) {
        a.t += dt;
        if (a.t >= a.dur) {
          a.processed++;
          // al procesar, a veces le manda un mensaje a otro actor
          if (Math.random() < 0.45) {
            const to = (a.id + 1 + Math.floor(Math.random() * 2)) % 3;
            outbox.push({ to, from: a.name });
          }
          a.processing = null;
        }
      }
      if (!a.processing && a.mailbox.length > 0) {
        a.processing = a.mailbox.shift()!;
        a.t = 0;
        a.dur = 700 + Math.random() * 800;
      }
    }

    for (const o of outbox) {
      const emoji = MSG_EMOJIS[Math.floor(Math.random() * MSG_EMOJIS.length)];
      as[o.to].mailbox.push({ emoji, from: o.from });
      this.logEv(`${emoji} <strong>${o.from}</strong> → mailbox de <strong>${as[o.to].name}</strong> (los actores colaboran mandándose mensajes).`);
    }

    // tráfico automático
    if (this.auto()) {
      this.autoAcc += dt;
      if (this.autoAcc > 900) {
        this.autoAcc = 0;
        const to = Math.floor(Math.random() * 3);
        const emoji = MSG_EMOJIS[Math.floor(Math.random() * MSG_EMOJIS.length)];
        as[to].mailbox.push({ emoji, from: 'red' });
      }
    }

    this.actors.set(as);
    this.rafId = requestAnimationFrame(this.tick);
  };

  private logEv(html: string): void {
    this.events.update((e) => [...e.slice(-30), html]);
  }

  reset(): void {
    this.running.set(false);
    this.auto.set(false);
    cancelAnimationFrame(this.rafId);
    this.actors.set(this.fresh());
    this.events.set([]);
    this.autoAcc = 0;
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.rafId);
  }
}
