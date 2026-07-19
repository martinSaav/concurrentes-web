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
  /** posición de la etiqueta: abajo (default), derecha o izquierda */
  lp?: 'r' | 'l';
}

interface PArc {
  from: string; // id de lugar o transición
  to: string;
  w: number;
  /** arco inhibidor (lugar → transición): habilita solo si M(p) < w */
  inhib?: boolean;
  /** curvatura perpendicular (para los arcos de retorno, como en las láminas) */
  bend?: number;
}

interface PNet {
  id: string;
  name: string;
  desc: string;
  /** click en un lugar cicla sus tokens (solo redes demo) */
  editable?: boolean;
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
    { id: 'P0', label: 'P0 · A afuera', x: 22, y: 16, tokens: 1 },
    { id: 'P1', label: 'P1 · B afuera', x: 78, y: 16, tokens: 1 },
    { id: 'P2', label: 'P2 · lock libre', x: 50, y: 48, tokens: 1 },
    { id: 'P3', label: 'P3 · A en CS', x: 22, y: 60, tokens: 0 },
    { id: 'P4', label: 'P4 · B en CS', x: 78, y: 60, tokens: 0 },
  ],
  trans: [
    { id: 'T0', label: 'T0 · A entra', x: 22, y: 38 },
    { id: 'T1', label: 'T1 · B entra', x: 78, y: 38 },
    { id: 'T2', label: 'T2 · A sale', x: 22, y: 84 },
    { id: 'T3', label: 'T3 · B sale', x: 78, y: 84 },
  ],
  arcs: [
    { from: 'P0', to: 'T0', w: 1 },
    { from: 'P2', to: 'T0', w: 1 },
    { from: 'T0', to: 'P3', w: 1 },
    { from: 'P3', to: 'T2', w: 1 },
    { from: 'T2', to: 'P0', w: 1, bend: -16 },
    { from: 'T2', to: 'P2', w: 1 },
    { from: 'P1', to: 'T1', w: 1 },
    { from: 'P2', to: 'T1', w: 1 },
    { from: 'T1', to: 'P4', w: 1 },
    { from: 'P4', to: 'T3', w: 1 },
    { from: 'T3', to: 'P1', w: 1, bend: 16 },
    { from: 'T3', to: 'P2', w: 1 },
  ],
};

/** productor-consumidor con buffer acotado (N=3), layout de la teórica */
const NET_PRODCONS: PNet = {
  id: 'prodcons',
  name: '📦 Prod-Cons acotado',
  desc: 'El de la teórica: p5 = ítems en el buffer, p6 = lugares libres (N=3). Buffer lleno → p6=0 → t2 muere (productor bloqueado). Vacío → p5=0 → t3 muere. p5+p6 = N siempre.',
  places: [
    { id: 'p1', label: 'p1 · prod. listo', x: 16, y: 14, tokens: 1 },
    { id: 'p2', label: 'p2 · produjo', x: 16, y: 62, tokens: 0 },
    { id: 'p6', label: 'p6 · libres (N)', x: 50, y: 24, tokens: 3 },
    { id: 'p5', label: 'p5 · buffer', x: 50, y: 60, tokens: 0 },
    { id: 'p3', label: 'p3 · cons. listo', x: 84, y: 14, tokens: 1 },
    { id: 'p4', label: 'p4 · consumió', x: 84, y: 62, tokens: 0 },
  ],
  trans: [
    { id: 't1', label: 't1 · producir', x: 16, y: 38 },
    { id: 't2', label: 't2 · depositar', x: 16, y: 86 },
    { id: 't3', label: 't3 · retirar', x: 84, y: 38 },
    { id: 't4', label: 't4 · consumir', x: 84, y: 86 },
  ],
  arcs: [
    { from: 'p1', to: 't1', w: 1 },
    { from: 't1', to: 'p2', w: 1 },
    { from: 'p2', to: 't2', w: 1 },
    { from: 't2', to: 'p1', w: 1, bend: -16 },
    { from: 't2', to: 'p5', w: 1, bend: -6 },
    { from: 'p6', to: 't2', w: 1, bend: -8 },
    { from: 'p5', to: 't3', w: 1, bend: -6 },
    { from: 't3', to: 'p6', w: 1, bend: -8 },
    { from: 'p3', to: 't3', w: 1 },
    { from: 't3', to: 'p4', w: 1 },
    { from: 'p4', to: 't4', w: 1 },
    { from: 't4', to: 'p3', w: 1, bend: 16 },
  ],
};

/** cliente-servidor de la teórica: pedidos por p4, respuestas por p5 */
const NET_CLISERV: PNet = {
  id: 'cliserv',
  name: '🖥 Cliente-Servidor',
  desc: 'El de la teórica: el cliente manda pedidos por p4 y espera respuestas por p5; el servidor los procesa. t3 solo se habilita cuando llegó la respuesta: la ESPERA es un lugar vacío.',
  places: [
    { id: 'p1', label: 'p1 · cli. listo', x: 22, y: 12, tokens: 1 },
    { id: 'p2', label: 'p2 · esperando', x: 22, y: 48, tokens: 0 },
    { id: 'p3', label: 'p3 · respondido', x: 22, y: 84, tokens: 0 },
    { id: 'p4', label: 'p4 · pedidos', x: 50, y: 22, tokens: 0 },
    { id: 'p5', label: 'p5 · respuestas', x: 50, y: 70, tokens: 0 },
    { id: 'p6', label: 'p6 · srv. listo', x: 78, y: 12, tokens: 1 },
    { id: 'p7', label: 'p7 · procesando', x: 78, y: 48, tokens: 0 },
    { id: 'p8', label: 'p8 · respondió', x: 78, y: 84, tokens: 0 },
  ],
  trans: [
    { id: 't2', label: 't2 · pedir', x: 22, y: 30, lp: 'l' },
    { id: 't3', label: 't3 · recibir', x: 22, y: 66, lp: 'l' },
    { id: 't1', label: 't1', x: 7, y: 48 },
    { id: 't4', label: 't4 · atender', x: 78, y: 30, lp: 'r' },
    { id: 't5', label: 't5 · responder', x: 78, y: 66, lp: 'r' },
    { id: 't6', label: 't6', x: 93, y: 48 },
  ],
  arcs: [
    { from: 'p1', to: 't2', w: 1 },
    { from: 't2', to: 'p2', w: 1 },
    { from: 't2', to: 'p4', w: 1 },
    { from: 'p2', to: 't3', w: 1 },
    { from: 'p5', to: 't3', w: 1 },
    { from: 't3', to: 'p3', w: 1 },
    { from: 'p3', to: 't1', w: 1 },
    { from: 't1', to: 'p1', w: 1 },
    { from: 'p4', to: 't4', w: 1 },
    { from: 'p6', to: 't4', w: 1 },
    { from: 't4', to: 'p7', w: 1 },
    { from: 'p7', to: 't5', w: 1 },
    { from: 't5', to: 'p8', w: 1 },
    { from: 't5', to: 'p5', w: 1 },
    { from: 'p8', to: 't6', w: 1 },
    { from: 't6', to: 'p6', w: 1 },
  ],
};

/** demo del arco inhibidor (práctica): T1 dispara solo si P2 está VACÍO */
const NET_INHIB: PNet = {
  id: 'inhib',
  name: '🚫 Arco inhibidor',
  desc: 'La lámina de la práctica. El arco con circulito (P2 ─○ T1) INVIERTE la condición: T1 se habilita solo si P2 está VACÍO. Click en los lugares para poner/sacar tokens y probalo.',
  editable: true,
  places: [
    { id: 'P1', label: 'P1', x: 32, y: 22, tokens: 1 },
    { id: 'P2', label: 'P2 (inhibidor)', x: 68, y: 22, tokens: 0 },
    { id: 'P3', label: 'P3', x: 50, y: 78, tokens: 0 },
  ],
  trans: [{ id: 'T1', label: 'T1', x: 50, y: 48 }],
  arcs: [
    { from: 'P1', to: 'T1', w: 1 },
    { from: 'P2', to: 'T1', w: 1, inhib: true },
    { from: 'T1', to: 'P3', w: 1 },
  ],
};

/** lector-escritor con arcos inhibidores (práctica) */
const NET_RW: PNet = {
  id: 'rw',
  name: '📖 Lector-Escritor',
  desc: 'El lector-escritor de la práctica: T0 (entra lector) está inhibida por P4 (hay escritor); T2 (entra escritor) está inhibida por P1 (hay lectores) y por P4 (ya hay escritor). Varios lectores O un escritor.',
  places: [
    { id: 'P0', label: 'P0 · lectores', x: 30, y: 12, tokens: 3 },
    { id: 'P1', label: 'P1 · leyendo', x: 30, y: 58, tokens: 0 },
    { id: 'P3', label: 'P3 · escritores', x: 70, y: 12, tokens: 2 },
    { id: 'P4', label: 'P4 · escribiendo', x: 70, y: 58, tokens: 0 },
  ],
  trans: [
    { id: 'T0', label: 'T0 · entra lector', x: 30, y: 34, lp: 'l' },
    { id: 'T1', label: 'T1 · sale lector', x: 30, y: 84, lp: 'l' },
    { id: 'T2', label: 'T2 · entra escritor', x: 70, y: 34, lp: 'r' },
    { id: 'T3', label: 'T3 · sale escritor', x: 70, y: 84, lp: 'r' },
  ],
  arcs: [
    { from: 'P0', to: 'T0', w: 1 },
    { from: 'T0', to: 'P1', w: 1 },
    { from: 'P1', to: 'T1', w: 1 },
    { from: 'T1', to: 'P0', w: 1, bend: -16 },
    { from: 'P3', to: 'T2', w: 1 },
    { from: 'T2', to: 'P4', w: 1 },
    { from: 'P4', to: 'T3', w: 1 },
    { from: 'T3', to: 'P3', w: 1, bend: 16 },
    { from: 'P4', to: 'T0', w: 1, inhib: true, bend: -8 },
    { from: 'P1', to: 'T2', w: 1, inhib: true, bend: -8 },
    { from: 'P4', to: 'T2', w: 1, inhib: true, bend: 14 },
  ],
};

/** barbero dormilón (práctica) */
const NET_BARBERO: PNet = {
  id: 'barbero',
  name: '💈 Barbero',
  desc: 'El barbero de la práctica: duerme hasta que hay un cliente esperando (T0 necesita ambos tokens). Al terminar (T2), vuelve a dormir y el cliente vuelve a la calle.',
  places: [
    { id: 'D', label: 'duermiendo', x: 16, y: 22, tokens: 1 },
    { id: 'C', label: 'cortando', x: 62, y: 22, tokens: 0 },
    { id: 'E', label: 'cliente esperando', x: 39, y: 54, tokens: 0 },
    { id: 'K', label: 'clientes', x: 39, y: 88, tokens: 4 },
  ],
  trans: [
    { id: 'T0', label: 'T0 · empieza corte', x: 39, y: 22 },
    { id: 'T2', label: 'T2 · termina', x: 86, y: 22 },
    { id: 'TE', label: 'TE · entra cliente', x: 39, y: 71, lp: 'l' },
  ],
  arcs: [
    { from: 'D', to: 'T0', w: 1 },
    { from: 'E', to: 'T0', w: 1 },
    { from: 'T0', to: 'C', w: 1 },
    { from: 'C', to: 'T2', w: 1 },
    { from: 'T2', to: 'D', w: 1, bend: -22 },
    { from: 'T2', to: 'K', w: 1, bend: 22 },
    { from: 'K', to: 'TE', w: 1 },
    { from: 'TE', to: 'E', w: 1 },
  ],
};

/** banquero (versión legible): recursos limitados prestados con pesos */
const NET_BANQUERO: PNet = {
  id: 'banquero',
  name: '🏦 Banquero',
  desc: 'La idea del banquero de la práctica, legible: el banco tiene 4 unidades; C1 necesita 3 y C2 necesita 2 (pesos). Nunca pueden tener crédito A LA VEZ: pedir todo junto = estado siempre seguro, sin deadlock.',
  places: [
    { id: 'B', label: 'banco (4)', x: 50, y: 14, tokens: 4 },
    { id: 'C1e', label: 'C1 espera', x: 16, y: 40, tokens: 1 },
    { id: 'C1c', label: 'C1 con crédito', x: 16, y: 78, tokens: 0 },
    { id: 'C2e', label: 'C2 espera', x: 84, y: 40, tokens: 1 },
    { id: 'C2c', label: 'C2 con crédito', x: 84, y: 78, tokens: 0 },
  ],
  trans: [
    { id: 't1', label: 't1 · C1 pide', x: 16, y: 58, lp: 'l' },
    { id: 't2', label: 't2 · C1 devuelve', x: 40, y: 92, lp: 'l' },
    { id: 't3', label: 't3 · C2 pide', x: 84, y: 58, lp: 'r' },
    { id: 't4', label: 't4 · C2 devuelve', x: 60, y: 92, lp: 'r' },
  ],
  arcs: [
    { from: 'B', to: 't1', w: 3, bend: -10 },
    { from: 'C1e', to: 't1', w: 1 },
    { from: 't1', to: 'C1c', w: 1 },
    { from: 'C1c', to: 't2', w: 1 },
    { from: 't2', to: 'C1e', w: 1, bend: -22 },
    { from: 't2', to: 'B', w: 3, bend: 14 },
    { from: 'B', to: 't3', w: 2, bend: 10 },
    { from: 'C2e', to: 't3', w: 1 },
    { from: 't3', to: 'C2c', w: 1 },
    { from: 'C2c', to: 't4', w: 1 },
    { from: 't4', to: 'C2e', w: 1, bend: 22 },
    { from: 't4', to: 'B', w: 2, bend: -14 },
  ],
};

/** red general con pesos, como el ejemplo de la teórica */
const NET_PESOS: PNet = {
  id: 'pesos',
  name: '⚖ Red con pesos',
  desc: 'Red GENERAL: t1 necesita 2 tokens de p1 y 1 de p2, y produce 2 en p3. Habilitada sii M(p) ≥ W(p,t) en TODAS sus entradas. t0 repone materia prima.',
  places: [
    { id: 'p1', label: 'p1', x: 30, y: 24, tokens: 2 },
    { id: 'p2', label: 'p2', x: 30, y: 72, tokens: 1 },
    { id: 'p3', label: 'p3', x: 86, y: 48, tokens: 0 },
  ],
  trans: [
    { id: 't1', label: 't1 · combinar', x: 58, y: 48 },
    { id: 't0', label: 't0 · reponer', x: 10, y: 48 },
  ],
  arcs: [
    { from: 'p1', to: 't1', w: 2 },
    { from: 'p2', to: 't1', w: 1 },
    { from: 't1', to: 'p3', w: 2 },
    { from: 't0', to: 'p1', w: 1 },
    { from: 't0', to: 'p2', w: 1 },
  ],
};

const NETS = [NET_MUTEX, NET_PRODCONS, NET_CLISERV, NET_RW, NET_INHIB, NET_BARBERO, NET_BANQUERO, NET_PESOS];

/**
 * Simulador de redes de Petri: transiciones habilitadas en verde, click para
 * disparar. Soporta pesos, arcos curvos y arcos inhibidores (─○). Redes de la
 * teórica y la práctica: mutex, prod-cons, cliente-servidor, lector-escritor,
 * barbero, banquero, pesos.
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
            El arco con circulito ─○ es <strong>inhibidor</strong>: exige el lugar VACÍO.
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
              <marker id="pinhib" markerWidth="8" markerHeight="8" refX="6.4" refY="3.2" orient="auto">
                <circle cx="3.2" cy="3.2" r="2.4" fill="#171e2e" stroke="#ef9a9a" stroke-width="1" />
              </marker>
            </defs>

            <!-- arcos -->
            @for (a of net().arcs; track $index) {
              <path
                [attr.d]="arcPath(a)"
                class="arc" [class.inh]="a.inhib"
                [attr.marker-end]="a.inhib ? 'url(#pinhib)' : 'url(#parrow)'"
              />
              @if (a.w > 1) {
                <text [attr.x]="arcLabelX(a)" [attr.y]="arcLabelY(a)"
                      font-size="3.6" fill="#ffd54f" font-weight="800" text-anchor="middle">{{ a.w }}</text>
              }
            }

            <!-- lugares -->
            @for (p of places(); track p.id) {
              <g [class.editable]="net().editable" (click)="clickPlace(p.id)">
                <circle [attr.cx]="p.x" [attr.cy]="p.y" r="4.8" fill="#1a2132"
                        [attr.stroke]="p.tokens > 0 ? '#e8b4b8' : '#39445f'" stroke-width="0.7" />
                @if (p.tokens >= 1 && p.tokens <= 4) {
                  @for (d of dots(p.tokens); track $index; let i = $index) {
                    <circle [attr.cx]="p.x + tokDx(p.tokens, i)" [attr.cy]="p.y + tokDy(p.tokens, i)"
                            r="1.05" fill="#e8b4b8" />
                  }
                } @else if (p.tokens > 4) {
                  <text [attr.x]="p.x" [attr.y]="p.y + 1.5" text-anchor="middle" font-size="3.9"
                        fill="#e8b4b8" font-weight="800">{{ p.tokens }}</text>
                }
                <text [attr.x]="p.x" [attr.y]="p.y - 6.6" text-anchor="middle" font-size="2.9" fill="#9aa4bf">
                  {{ p.label }}
                </text>
              </g>
            }

            <!-- transiciones -->
            @for (t of net().trans; track t.id) {
              <g class="tr" (click)="fire(t.id)">
                <rect [attr.x]="t.x - 1.3" [attr.y]="t.y - 4" width="2.6" height="8" rx="0.5"
                      [attr.fill]="enabledIds().includes(t.id) ? '#2ea043' : '#39445f'"
                      [attr.stroke]="flash() === t.id ? '#fff' : (enabledIds().includes(t.id) ? '#7ee787' : 'none')"
                      stroke-width="0.6" />
                <text [attr.x]="tlx(t)" [attr.y]="tly(t)" [attr.text-anchor]="tanchor(t)" font-size="2.9"
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
          @if (net().editable) {
            <div class="panel edit-hint">
              ✏️ Esta red es editable: <strong>click en un lugar</strong> agrega un token (cicla 0→4→0).
            </div>
          }
        </div>
      </div>

      <div class="status" [class.idle]="statusMsg() === null">
        @if (statusMsg(); as m) {
          <span [innerHTML]="m"></span>
        } @else {
          Regla de disparo: t habilitada ⟺ M(p) ≥ W(p,t) en todo lugar de entrada, Y M(p) &lt; W en
          todo arco inhibidor. Al disparar resta de las entradas y suma en las salidas — atómicamente.
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
    .netdesc { color: var(--text-dim); font-size: 0.78rem; margin-bottom: 10px; line-height: 1.5; min-height: 34px; }

    .board { display: flex; gap: 12px; align-items: stretch; }
    .arena { position: relative; flex: 1; min-height: 560px; background: radial-gradient(ellipse at 50% 45%, #202a40 0%, #171e2e 80%); border: 1px solid var(--border); border-radius: 10px; transition: border-color 0.3s; }
    .arena.dead { border-color: #ef5350; }
    .arena svg { position: absolute; inset: 0; width: 100%; height: 100%; }
    .arc { fill: none; stroke: #5c6a8e; stroke-width: 0.35; }
    .arc.inh { stroke: #ef9a9a; stroke-dasharray: 1.2 1.2; }
    .tr { cursor: pointer; }
    .editable { cursor: pointer; }
    .dead-banner { position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); background: rgba(8, 12, 22, 0.95); border: 1.5px solid #ef5350; color: #ef9a9a; border-radius: 9px; padding: 4px 12px; font-size: 0.74rem; font-weight: 700; white-space: nowrap; }

    .side { width: 240px; flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; }
    .panel { background: #10151f; border: 1px solid var(--border); border-radius: 10px; padding: 9px 12px; }
    .p-title { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 1px; color: #5c6a8e; font-weight: 700; margin-bottom: 5px; }
    .marking { font-family: Consolas, monospace; font-weight: 800; font-size: 1rem; color: #e8b4b8; }
    .p-note { font-size: 0.68rem; color: var(--text-dim); line-height: 1.5; margin-top: 5px; }
    .hist { display: flex; flex-direction: column; gap: 2px; max-height: 150px; overflow: hidden; }
    .h-empty { color: #5c6a8e; font-style: italic; font-size: 0.72rem; }
    .h-row { font-family: Consolas, monospace; font-size: 0.68rem; color: var(--text); }
    .edit-hint { border-color: #ffd54f66; font-size: 0.72rem; color: var(--text-dim); line-height: 1.5; }
    .edit-hint strong { color: #ffd54f; }

    .status { margin-top: 12px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; min-height: 46px; font-size: 0.85rem; line-height: 1.55; }
    .status.idle { color: var(--text-dim); }

    @media (max-width: 720px) {
      .board { flex-direction: column; }
      .side { width: 100%; }
      .arena { min-height: 420px; }
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
  readonly lastHistory = computed(() => this.history().slice(-8));
  readonly markingStr = computed(() => this.places().map((p) => p.tokens).join(', '));

  readonly enabledIds = computed(() => {
    const net = this.net();
    const tok = new Map(this.places().map((p) => [p.id, p.tokens]));
    return net.trans
      .filter((t) =>
        net.arcs
          .filter((a) => a.to === t.id)
          .every((a) => {
            const m = tok.get(a.from) ?? 0;
            return a.inhib ? m < a.w : m >= a.w;
          }),
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

  clickPlace(pid: string): void {
    if (!this.net().editable) return;
    const ps = this.places().map((p) => ({ ...p }));
    const p = ps.find((x) => x.id === pid)!;
    p.tokens = (p.tokens + 1) % 5;
    this.places.set(ps);
    this.statusMsg.set(
      `✏️ ${pid} ahora tiene <strong>${p.tokens}</strong> token${p.tokens === 1 ? '' : 's'}. Mirá qué transiciones quedaron habilitadas.`,
    );
  }

  dots(n: number): unknown[] {
    return Array.from({ length: Math.min(n, 4) });
  }
  tokDx(n: number, i: number): number {
    if (n === 1) return 0;
    if (n === 2) return i === 0 ? -1.7 : 1.7;
    if (n === 3) return [0, -1.8, 1.8][i];
    return [-1.7, 1.7, -1.7, 1.7][i];
  }
  tokDy(n: number, i: number): number {
    if (n === 1) return 0;
    if (n === 2) return 0;
    if (n === 3) return [-1.7, 1.5, 1.5][i];
    return [-1.7, -1.7, 1.7, 1.7][i];
  }

  /* --- etiquetas de transiciones: abajo, o al costado en layouts de columna --- */
  tlx(t: PTrans): number {
    if (t.lp === 'r') return t.x + 3;
    if (t.lp === 'l') return t.x - 3;
    return t.x;
  }
  tly(t: PTrans): number {
    return t.lp ? t.y + 1 : t.y + 7;
  }
  tanchor(t: PTrans): string {
    if (t.lp === 'r') return 'start';
    if (t.lp === 'l') return 'end';
    return 'middle';
  }

  /* --- geometría de arcos: curvos opcionales, recortados en los nodos --- */
  private nodePos(id: string): { x: number; y: number; r: number } {
    const p = this.net().places.find((x) => x.id === id);
    if (p) return { x: p.x, y: p.y, r: 5.4 };
    const t = this.net().trans.find((x) => x.id === id)!;
    return { x: t.x, y: t.y, r: 3 };
  }

  /** punto de control de la curva (o punto medio si es recta) */
  private ctrl(a: PArc): { x: number; y: number } {
    const f = this.nodePos(a.from);
    const t = this.nodePos(a.to);
    const mx = (f.x + t.x) / 2;
    const my = (f.y + t.y) / 2;
    if (!a.bend) return { x: mx, y: my };
    const d = Math.hypot(t.x - f.x, t.y - f.y) || 1;
    // perpendicular al segmento
    return { x: mx + (-(t.y - f.y) / d) * a.bend, y: my + ((t.x - f.x) / d) * a.bend };
  }

  arcPath(a: PArc): string {
    const f = this.nodePos(a.from);
    const t = this.nodePos(a.to);
    const c = this.ctrl(a);
    // recorte: los extremos apuntan hacia el control
    const df = Math.hypot(c.x - f.x, c.y - f.y) || 1;
    const dt = Math.hypot(c.x - t.x, c.y - t.y) || 1;
    const sx = f.x + ((c.x - f.x) / df) * f.r;
    const sy = f.y + ((c.y - f.y) / df) * f.r;
    const ex = t.x + ((c.x - t.x) / dt) * t.r;
    const ey = t.y + ((c.y - t.y) / dt) * t.r;
    if (!a.bend) return `M ${sx.toFixed(1)} ${sy.toFixed(1)} L ${ex.toFixed(1)} ${ey.toFixed(1)}`;
    return `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${c.x.toFixed(1)} ${c.y.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
  }

  arcLabelX(a: PArc): number {
    const f = this.nodePos(a.from);
    const t = this.nodePos(a.to);
    const c = this.ctrl(a);
    return 0.25 * f.x + 0.5 * c.x + 0.25 * t.x + 2;
  }
  arcLabelY(a: PArc): number {
    const f = this.nodePos(a.from);
    const t = this.nodePos(a.to);
    const c = this.ctrl(a);
    return 0.25 * f.y + 0.5 * c.y + 0.25 * t.y - 1.2;
  }

  fire(tid: string): void {
    if (!this.enabledIds().includes(tid)) {
      const net = this.net();
      const tok = new Map(this.places().map((p) => [p.id, p.tokens]));
      const problems = net.arcs
        .filter((a) => a.to === tid)
        .filter((a) => (a.inhib ? (tok.get(a.from) ?? 0) >= a.w : (tok.get(a.from) ?? 0) < a.w))
        .map((a) =>
          a.inhib
            ? `${a.from} NO está vacío (arco inhibidor)`
            : `${a.from} (tiene ${tok.get(a.from)}, necesita ${a.w})`,
        );
      this.statusMsg.set(`⛔ <strong>${tid}</strong> NO está habilitada: ${problems.join(' y ')}.`);
      return;
    }
    const net = this.net();
    const ps = this.places().map((p) => ({ ...p }));
    const consumed: string[] = [];
    const produced: string[] = [];
    for (const a of net.arcs) {
      if (a.inhib) continue; // los inhibidores no consumen
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
      `⚡ Disparó <strong>${tid}</strong>: consumió de ${consumed.join(', ') || 'nada'} y produjo en ${produced.join(', ')}. Nuevo marcado: (${ps.map((p) => p.tokens).join(', ')}).`,
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
