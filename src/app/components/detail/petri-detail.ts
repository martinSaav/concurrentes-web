import { ChangeDetectionStrategy, Component, OnDestroy, computed, signal } from '@angular/core';

interface PPlace {
  id: string;
  label: string;
  x: number;
  y: number;
  tokens: number;
}

interface PTrans {
  id: string;
  label: string;
  x: number;
  y: number;
}

interface PArc {
  from: string; // id de lugar o transición
  to: string;
  w: number;
}

interface PNet {
  id: string;
  name: string;
  desc: string;
  places: PPlace[];
  trans: PTrans[];
  arcs: PArc[];
}

/** mutex de la práctica: dos procesos y un lugar-lock (P2) */
const NET_MUTEX: PNet = {
  id: 'mutex',
  name: '🔒 Mutex',
  desc: 'P2 es el lock: un solo token. T0/T1 lo consumen para entrar a la CS (P3/P4); T2/T3 lo devuelven. Es la red mutex.xml de la práctica.',
  places: [
    { id: 'P0', label: 'P0 · A afuera', x: 22, y: 18, tokens: 1 },
    { id: 'P1', label: 'P1 · B afuera', x: 78, y: 18, tokens: 1 },
    { id: 'P2', label: 'P2 · lock libre', x: 50, y: 50, tokens: 1 },
    { id: 'P3', label: 'P3 · A en CS', x: 22, y: 62, tokens: 0 },
    { id: 'P4', label: 'P4 · B en CS', x: 78, y: 62, tokens: 0 },
  ],
  trans: [
    { id: 'T0', label: 'T0 · A entra', x: 22, y: 40 },
    { id: 'T1', label: 'T1 · B entra', x: 78, y: 40 },
    { id: 'T2', label: 'T2 · A sale', x: 22, y: 84 },
    { id: 'T3', label: 'T3 · B sale', x: 78, y: 84 },
  ],
  arcs: [
    { from: 'P0', to: 'T0', w: 1 },
    { from: 'P2', to: 'T0', w: 1 },
    { from: 'T0', to: 'P3', w: 1 },
    { from: 'P3', to: 'T2', w: 1 },
    { from: 'T2', to: 'P0', w: 1 },
    { from: 'T2', to: 'P2', w: 1 },
    { from: 'P1', to: 'T1', w: 1 },
    { from: 'P2', to: 'T1', w: 1 },
    { from: 'T1', to: 'P4', w: 1 },
    { from: 'P4', to: 'T3', w: 1 },
    { from: 'T3', to: 'P1', w: 1 },
    { from: 'T3', to: 'P2', w: 1 },
  ],
};

/** productor-consumidor con buffer acotado (N=3), como en la teórica */
const NET_PRODCONS: PNet = {
  id: 'prodcons',
  name: '📦 Prod-Cons acotado',
  desc: 'p5 = ítems en el buffer, p6 = lugares libres (N=3). Buffer lleno → p6=0 → t2 se deshabilita (productor bloqueado). Vacío → p5=0 → t3 muerta.',
  places: [
    { id: 'p1', label: 'p1 · prod. listo', x: 14, y: 24, tokens: 1 },
    { id: 'p2', label: 'p2 · produjo', x: 14, y: 70, tokens: 0 },
    { id: 'p5', label: 'p5 · buffer', x: 50, y: 34, tokens: 0 },
    { id: 'p6', label: 'p6 · libres', x: 50, y: 66, tokens: 3 },
    { id: 'p3', label: 'p3 · cons. listo', x: 86, y: 24, tokens: 1 },
    { id: 'p4', label: 'p4 · consumió', x: 86, y: 70, tokens: 0 },
  ],
  trans: [
    { id: 't1', label: 't1 · producir', x: 14, y: 47 },
    { id: 't2', label: 't2 · depositar', x: 32, y: 88 },
    { id: 't3', label: 't3 · retirar', x: 68, y: 12 },
    { id: 't4', label: 't4 · consumir', x: 86, y: 47 },
  ],
  arcs: [
    { from: 'p1', to: 't1', w: 1 },
    { from: 't1', to: 'p2', w: 1 },
    { from: 'p2', to: 't2', w: 1 },
    { from: 'p6', to: 't2', w: 1 },
    { from: 't2', to: 'p1', w: 1 },
    { from: 't2', to: 'p5', w: 1 },
    { from: 'p5', to: 't3', w: 1 },
    { from: 'p3', to: 't3', w: 1 },
    { from: 't3', to: 'p4', w: 1 },
    { from: 't3', to: 'p6', w: 1 },
    { from: 'p4', to: 't4', w: 1 },
    { from: 't4', to: 'p3', w: 1 },
  ],
};

/** red general con pesos, como el ejemplo de la teórica */
const NET_PESOS: PNet = {
  id: 'pesos',
  name: '⚖ Red con pesos',
  desc: 'Red GENERAL: t1 necesita 2 tokens de p1 y 1 de p2, y produce 2 en p3. Habilitada sii M(p) ≥ W(p,t) en TODAS sus entradas. t0 repone materia prima.',
  places: [
    { id: 'p1', label: 'p1', x: 28, y: 26, tokens: 2 },
    { id: 'p2', label: 'p2', x: 28, y: 70, tokens: 1 },
    { id: 'p3', label: 'p3', x: 88, y: 48, tokens: 0 },
  ],
  trans: [
    { id: 't1', label: 't1 · combinar', x: 58, y: 48 },
    { id: 't0', label: 't0 · reponer', x: 8, y: 48 },
  ],
  arcs: [
    { from: 'p1', to: 't1', w: 2 },
    { from: 'p2', to: 't1', w: 1 },
    { from: 't1', to: 'p3', w: 2 },
    { from: 't0', to: 'p1', w: 1 },
    { from: 't0', to: 'p2', w: 1 },
  ],
};

const NETS = [NET_MUTEX, NET_PRODCONS, NET_PESOS];

/**
 * Simulador de redes de Petri: la red se dibuja en SVG, las transiciones
 * habilitadas (M(p) ≥ W(p,t) en todas las entradas) se iluminan y se
 * disparan con click. Redes de la materia: mutex, prod-cons acotado, pesos.
 */
@Component({
  selector: 'app-petri-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="anim">
      <div class="head">
        <div class="titles">
          <div class="title">⚪ Simulador: disparo de transiciones</div>
          <div class="caption">
            Click en una transición <span class="hab">verde</span> (habilitada) para dispararla.
            Las grises no cumplen M(p) ≥ W(p,t).
          </div>
        </div>
        <div class="controls">
          <button class="ctl" [class.on]="auto()" (click)="toggleAuto()">
            {{ auto() ? '🎲 auto ON' : '🎲 disparo auto' }}
          </button>
          <button class="ctl" (click)="resetNet()">↺ Reset</button>
        </div>
      </div>

      <div class="nets">
        @for (n of nets; track n.id) {
          <button class="netbtn" [class.on]="netId() === n.id" (click)="selectNet(n.id)">{{ n.name }}</button>
        }
      </div>
      <div class="netdesc">{{ net().desc }}</div>

      <div class="board">
        <div class="arena" [class.dead]="deadlocked()">
          <svg viewBox="0 0 100 100">
            <defs>
              <marker id="parrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 z" fill="#5c6a8e" />
              </marker>
            </defs>

            <!-- arcos -->
            @for (a of net().arcs; track $index) {
              <line
                [attr.x1]="arcX1(a)" [attr.y1]="arcY1(a)"
                [attr.x2]="arcX2(a)" [attr.y2]="arcY2(a)"
                class="arc" marker-end="url(#parrow)"
              />
              @if (a.w > 1) {
                <text [attr.x]="(arcX1(a) + arcX2(a)) / 2 + 1.5" [attr.y]="(arcY1(a) + arcY2(a)) / 2 - 1.5"
                      font-size="3.6" fill="#ffd54f" font-weight="800">{{ a.w }}</text>
              }
            }

            <!-- lugares -->
            @for (p of places(); track p.id) {
              <g>
                <circle [attr.cx]="p.x" [attr.cy]="p.y" r="6" fill="#1a2132"
                        [attr.stroke]="p.tokens > 0 ? '#e8b4b8' : '#39445f'" stroke-width="0.8" />
                @if (p.tokens >= 1 && p.tokens <= 4) {
                  @for (d of dots(p.tokens); track $index; let i = $index) {
                    <circle [attr.cx]="p.x + tokDx(p.tokens, i)" [attr.cy]="p.y + tokDy(p.tokens, i)"
                            r="1.3" fill="#e8b4b8" />
                  }
                } @else if (p.tokens > 4) {
                  <text [attr.x]="p.x" [attr.y]="p.y + 1.8" text-anchor="middle" font-size="4.6"
                        fill="#e8b4b8" font-weight="800">{{ p.tokens }}</text>
                }
                <text [attr.x]="p.x" [attr.y]="p.y - 8.2" text-anchor="middle" font-size="3.1" fill="#9aa4bf">
                  {{ p.label }}
                </text>
              </g>
            }

            <!-- transiciones -->
            @for (t of net().trans; track t.id) {
              <g class="tr" (click)="fire(t.id)">
                <rect [attr.x]="t.x - 1.6" [attr.y]="t.y - 5" width="3.2" height="10" rx="0.6"
                      [attr.fill]="enabledIds().includes(t.id) ? '#2ea043' : '#39445f'"
                      [attr.stroke]="flash() === t.id ? '#fff' : (enabledIds().includes(t.id) ? '#7ee787' : 'none')"
                      stroke-width="0.7" />
                <text [attr.x]="t.x" [attr.y]="t.y + 9" text-anchor="middle" font-size="3.1"
                      [attr.fill]="enabledIds().includes(t.id) ? '#7ee787' : '#5c6a8e'">
                  {{ t.label }}
                </text>
              </g>
            }
          </svg>
          @if (deadlocked()) {
            <div class="dead-banner">💀 marcado muerto: ninguna transición habilitada (deadlock)</div>
          }
        </div>

        <div class="side">
          <div class="panel">
            <div class="p-title">marcado actual M</div>
            <div class="marking">( {{ markingStr() }} )</div>
            <div class="p-note">M : P → ℕ∪0 — cuántos tokens tiene cada lugar. ESTE vector es el estado del sistema.</div>
          </div>
          <div class="panel">
            <div class="p-title">disparos</div>
            <div class="hist">
              @if (history().length === 0) {
                <span class="h-empty">todavía no disparaste nada</span>
              }
              @for (h of lastHistory(); track $index) {
                <div class="h-row">{{ h }}</div>
              }
            </div>
            <div class="p-note">total: {{ history().length }}</div>
          </div>
        </div>
      </div>

      <div class="status" [class.idle]="statusMsg() === null">
        @if (statusMsg(); as m) {
          <span [innerHTML]="m"></span>
        } @else {
          Regla de disparo: t habilitada ⟺ M(p) ≥ W(p,t) para TODO lugar de entrada. Al disparar,
          resta W(p,t) de cada entrada y suma W(t,p') a cada salida — atómicamente.
        }
      </div>
    </div>
  `,
  styles: `
    .anim { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin: 18px 0; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
    .title { font-weight: 700; font-size: 1.02rem; color: #fff; }
    .caption { color: var(--text-dim); font-size: 0.85rem; margin-top: 2px; }
    .hab { color: #7ee787; font-weight: 700; }
    .controls { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .ctl { background: var(--panel-2); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 7px 12px; cursor: pointer; font-size: 0.86rem; }
    .ctl:hover { background: #2d3750; }
    .ctl.on { background: #f68c1f; border-color: #f68c1f; color: #0d1117; font-weight: 700; }

    .nets { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
    .netbtn { background: var(--panel-2); border: 1px solid var(--border); color: var(--text-dim); border-radius: 8px; padding: 6px 12px; cursor: pointer; font-size: 0.8rem; font-weight: 600; }
    .netbtn.on { background: #1f6feb; border-color: #1f6feb; color: #fff; }
    .netdesc { color: var(--text-dim); font-size: 0.78rem; margin-bottom: 10px; line-height: 1.5; }

    .board { display: flex; gap: 12px; align-items: stretch; }
    .arena { position: relative; flex: 1; min-height: 360px; background: radial-gradient(ellipse at 50% 45%, #202a40 0%, #171e2e 80%); border: 1px solid var(--border); border-radius: 10px; transition: border-color 0.3s; }
    .arena.dead { border-color: #ef5350; }
    .arena svg { position: absolute; inset: 0; width: 100%; height: 100%; }
    .arc { stroke: #5c6a8e; stroke-width: 0.35; }
    .tr { cursor: pointer; }
    .dead-banner { position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); background: rgba(8, 12, 22, 0.95); border: 1.5px solid #ef5350; color: #ef9a9a; border-radius: 9px; padding: 4px 12px; font-size: 0.74rem; font-weight: 700; white-space: nowrap; }

    .side { width: 240px; flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; }
    .panel { background: #10151f; border: 1px solid var(--border); border-radius: 10px; padding: 9px 12px; }
    .p-title { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 1px; color: #5c6a8e; font-weight: 700; margin-bottom: 5px; }
    .marking { font-family: Consolas, monospace; font-weight: 800; font-size: 1rem; color: #e8b4b8; }
    .p-note { font-size: 0.68rem; color: var(--text-dim); line-height: 1.5; margin-top: 5px; }
    .hist { display: flex; flex-direction: column; gap: 2px; max-height: 130px; overflow: hidden; }
    .h-empty { color: #5c6a8e; font-style: italic; font-size: 0.72rem; }
    .h-row { font-family: Consolas, monospace; font-size: 0.68rem; color: var(--text); }

    .status { margin-top: 12px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; min-height: 46px; font-size: 0.85rem; line-height: 1.55; }
    .status.idle { color: var(--text-dim); }

    @media (max-width: 720px) {
      .board { flex-direction: column; }
      .side { width: 100%; }
    }
  `,
})
export class PetriDetail implements OnDestroy {
  readonly nets = NETS;

  readonly netId = signal('mutex');
  readonly places = signal<PPlace[]>(structuredClone(NET_MUTEX.places));
  readonly history = signal<string[]>([]);
  readonly flash = signal<string | null>(null);
  readonly auto = signal(false);
  readonly statusMsg = signal<string | null>(null);

  readonly net = computed(() => NETS.find((n) => n.id === this.netId())!);
  readonly lastHistory = computed(() => this.history().slice(-7));
  readonly markingStr = computed(() => this.places().map((p) => p.tokens).join(', '));

  readonly enabledIds = computed(() => {
    const net = this.net();
    const tok = new Map(this.places().map((p) => [p.id, p.tokens]));
    return net.trans
      .filter((t) =>
        net.arcs
          .filter((a) => a.to === t.id)
          .every((a) => (tok.get(a.from) ?? 0) >= a.w),
      )
      .map((t) => t.id);
  });

  readonly deadlocked = computed(() => this.enabledIds().length === 0);

  private rafId = 0;
  private lastTs = 0;
  private acc = 0;

  selectNet(id: string): void {
    this.netId.set(id);
    this.resetNet();
  }

  resetNet(): void {
    this.places.set(structuredClone(this.net().places));
    this.history.set([]);
    this.statusMsg.set(null);
  }

  dots(n: number): unknown[] {
    return Array.from({ length: Math.min(n, 4) });
  }
  tokDx(n: number, i: number): number {
    if (n === 1) return 0;
    if (n === 2) return i === 0 ? -2 : 2;
    if (n === 3) return [0, -2.2, 2.2][i];
    return [-2, 2, -2, 2][i];
  }
  tokDy(n: number, i: number): number {
    if (n === 1) return 0;
    if (n === 2) return 0;
    if (n === 3) return [-2, 1.8, 1.8][i];
    return [-2, -2, 2, 2][i];
  }

  /* --- geometría de arcos: recortados en los bordes de los nodos --- */
  private nodePos(id: string): { x: number; y: number; r: number } {
    const p = this.net().places.find((x) => x.id === id);
    if (p) return { x: p.x, y: p.y, r: 6.6 };
    const t = this.net().trans.find((x) => x.id === id)!;
    return { x: t.x, y: t.y, r: 3.4 };
  }
  arcX1(a: PArc): number {
    const f = this.nodePos(a.from);
    const t = this.nodePos(a.to);
    const d = Math.hypot(t.x - f.x, t.y - f.y) || 1;
    return f.x + ((t.x - f.x) / d) * f.r;
  }
  arcY1(a: PArc): number {
    const f = this.nodePos(a.from);
    const t = this.nodePos(a.to);
    const d = Math.hypot(t.x - f.x, t.y - f.y) || 1;
    return f.y + ((t.y - f.y) / d) * f.r;
  }
  arcX2(a: PArc): number {
    const f = this.nodePos(a.from);
    const t = this.nodePos(a.to);
    const d = Math.hypot(t.x - f.x, t.y - f.y) || 1;
    return t.x - ((t.x - f.x) / d) * t.r;
  }
  arcY2(a: PArc): number {
    const f = this.nodePos(a.from);
    const t = this.nodePos(a.to);
    const d = Math.hypot(t.x - f.x, t.y - f.y) || 1;
    return t.y - ((t.y - f.y) / d) * t.r;
  }

  fire(tid: string): void {
    if (!this.enabledIds().includes(tid)) {
      const net = this.net();
      const missing = net.arcs
        .filter((a) => a.to === tid)
        .filter((a) => (this.places().find((p) => p.id === a.from)?.tokens ?? 0) < a.w)
        .map((a) => `${a.from} (tiene ${this.places().find((p) => p.id === a.from)?.tokens}, necesita ${a.w})`);
      this.statusMsg.set(
        `⛔ <strong>${tid}</strong> NO está habilitada: le falta token en ${missing.join(' y ')}.`,
      );
      return;
    }
    const net = this.net();
    const ps = this.places().map((p) => ({ ...p }));
    const consumed: string[] = [];
    const produced: string[] = [];
    for (const a of net.arcs) {
      if (a.to === tid) {
        const p = ps.find((x) => x.id === a.from)!;
        p.tokens -= a.w;
        consumed.push(a.w > 1 ? `${a.w}×${a.from}` : a.from);
      } else if (a.from === tid) {
        const p = ps.find((x) => x.id === a.to)!;
        p.tokens += a.w;
        produced.push(a.w > 1 ? `${a.w}×${a.to}` : a.to);
      }
    }
    this.places.set(ps);
    this.history.update((h) => [...h, `${tid}: −[${consumed.join(', ')}] +[${produced.join(', ')}]`]);
    this.statusMsg.set(
      `⚡ Disparó <strong>${tid}</strong>: consumió de ${consumed.join(', ')} y produjo en ${produced.join(', ')}. Nuevo marcado: (${ps.map((p) => p.tokens).join(', ')}).`,
    );
    this.flash.set(tid);
    setTimeout(() => this.flash.set(null), 250);
  }

  toggleAuto(): void {
    this.auto.update((v) => !v);
    if (this.auto()) {
      this.lastTs = performance.now();
      this.acc = 0;
      this.rafId = requestAnimationFrame(this.tick);
    } else {
      cancelAnimationFrame(this.rafId);
    }
  }

  private readonly tick = (now: number): void => {
    if (!this.auto()) return;
    const dt = Math.min(now - this.lastTs, 100);
    this.lastTs = now;
    this.acc += dt;
    if (this.acc >= 900) {
      this.acc = 0;
      const en = this.enabledIds();
      if (en.length > 0) {
        this.fire(en[Math.floor(Math.random() * en.length)]);
      }
    }
    this.rafId = requestAnimationFrame(this.tick);
  };

  ngOnDestroy(): void {
    cancelAnimationFrame(this.rafId);
  }
}
