import { ChangeDetectionStrategy, Component, OnDestroy, computed } from '@angular/core';
import { SteppedAnim } from './stepped';

interface Box {
  id: string;
  label: string;
  y: number;
  blocking?: boolean;
}

interface Arrow {
  dir: 'c2s' | 's2c';
  y: number;
  label: string;
  kind?: 'hs' | 'data' | 'close';
}

interface SockStep {
  active: string[]; // ids de cajas resaltadas
  done?: string[]; // ids ya completados en pasos previos (se acumulan solos)
  arrows: Arrow[];
  established?: boolean;
  msg: string;
}

const SERVER: Box[] = [
  { id: 's_socket', label: 'socket()', y: 7 },
  { id: 's_bind', label: 'bind()', y: 15.5 },
  { id: 's_listen', label: 'listen()', y: 24 },
  { id: 's_accept', label: 'accept()', y: 34.5, blocking: true },
  { id: 's_read', label: 'read()', y: 60, blocking: true },
  { id: 's_write', label: 'write()', y: 70 },
  { id: 's_close', label: 'close()', y: 84 },
];

const CLIENT: Box[] = [
  { id: 'c_socket', label: 'socket()', y: 34.5 },
  { id: 'c_connect', label: 'connect()', y: 43, blocking: true },
  { id: 'c_write', label: 'write()', y: 60 },
  { id: 'c_read', label: 'read()', y: 70, blocking: true },
  { id: 'c_close', label: 'close()', y: 84 },
];

const STEPS: SockStep[] = [
  {
    active: ['s_socket'], arrows: [],
    msg: 'El <strong>servidor</strong> crea el socket: <code>socket(family, type, protocol)</code> <strong>reserva recursos</strong> y retorna el <strong>file descriptor</strong> (o −1 si falla). Todavía no está atado a ninguna dirección.',
  },
  {
    active: ['s_bind'], arrows: [],
    msg: '<code>bind()</code> le asigna una <strong>dirección local</strong>. Es <strong>imprescindible en el servidor</strong>: el cliente tiene que saber a dónde conectarse. <em>(En Rust, <code>TcpListener::bind</code> hace el socket y el bind en un solo paso.)</em>',
  },
  {
    active: ['s_listen'], arrows: [],
    msg: '<code>listen(fd, backlog)</code> convierte el socket en <strong>PASIVO</strong>: empieza a escuchar solicitudes y las va <strong>encolando</strong>. Cada una queda en distintas etapas del handshake hasta quedar establecida.',
  },
  {
    active: ['s_accept'], arrows: [],
    msg: '<code>accept()</code> extrae de la cola una conexión <strong>ya establecida</strong>. Es una <strong>operación BLOQUEANTE</strong>: si no hay ninguna, el programa queda a la espera de que se conecte algún cliente. El servidor es <strong>pasivo</strong>: espera.',
  },
  {
    active: ['c_socket'], arrows: [],
    msg: 'El <strong>cliente</strong> crea su socket. Notá que <strong>no hace bind</strong>: no es necesario, porque nadie tiene que buscarlo a él — el SO le asigna un puerto efímero cuando se conecte.',
  },
  {
    active: ['c_connect'], arrows: [{ dir: 'c2s', y: 45, label: 'SYN', kind: 'hs' }],
    msg: '<code>connect()</code> lanza la conexión TCP hacia el servidor: arranca el <strong>handshake</strong>. También es <strong>bloqueante</strong>. El cliente es <strong>activo</strong>: él inicia la interacción.',
  },
  {
    active: ['c_connect', 's_accept'],
    arrows: [
      { dir: 's2c', y: 49, label: 'SYN-ACK', kind: 'hs' },
      { dir: 'c2s', y: 53, label: 'ACK', kind: 'hs' },
    ],
    msg: '<strong>Three-way handshake</strong> completo (SYN → SYN-ACK ← ACK →). Recién ahora la conexión está <strong>establecida</strong> y pasa a la cola de <code>accept()</code>.',
  },
  {
    active: ['s_accept'], arrows: [], established: true,
    msg: '<code>accept()</code> <strong>retorna un file descriptor NUEVO</strong>, exclusivo para hablar con este cliente. El socket pasivo original <strong>sigue escuchando</strong> — por eso un servidor concurrente puede atender a varios a la vez (un thread o tarea por cada fd nuevo).',
  },
  {
    active: ['c_write'], arrows: [{ dir: 'c2s', y: 62, label: 'request', kind: 'data' }], established: true,
    msg: 'Con la conexión abierta se usan <code>read()</code> / <code>write()</code> (o <code>send()</code> / <code>recv()</code>, que es lo mismo con una "distinción" de que son para sockets). El cliente envía su pedido.',
  },
  {
    active: ['s_read'], arrows: [], established: true,
    msg: 'El servidor lee del socket. <code>read()</code> <strong>bloquea</strong> hasta que haya datos disponibles. <em>(En Rust, <code>write</code> se acompaña de <code>flush()</code>: previene que el programa continúe sin haber escrito todos los bytes en la conexión.)</em>',
  },
  {
    active: ['s_write'], arrows: [{ dir: 's2c', y: 72, label: 'response', kind: 'data' }], established: true,
    msg: 'El servidor procesa y responde por el mismo socket. La comunicación es <strong>bidireccional</strong> (full-duplex): ambos extremos pueden leer y escribir.',
  },
  {
    active: ['c_read'], arrows: [], established: true,
    msg: 'El cliente recibe la respuesta. Con esto se completa el ciclo request/response.',
  },
  {
    active: ['c_close', 's_close'],
    arrows: [
      { dir: 'c2s', y: 86, label: 'close', kind: 'close' },
      { dir: 's2c', y: 90, label: 'ACK + close', kind: 'close' },
      { dir: 'c2s', y: 94, label: 'ACK', kind: 'close' },
    ],
    msg: '<strong>El cierre en TCP es UNILATERAL</strong>: cualquiera de los dos puede iniciarlo, y <strong>cada parte cierra su lado</strong>. Por eso son 4 mensajes: close → ACK ← close ← ACK →. <em>(En Rust la conexión se cierra sola cuando el <code>TcpStream</code> se dropea; <code>shutdown()</code> permite cerrar solo lectura, solo escritura o ambas.)</em>',
  },
];

/**
 * Diagrama de secuencia de sockets TCP: la danza
 * socket/bind/listen/accept vs socket/connect, marcando qué llamadas
 * bloquean y por qué accept() devuelve un fd nuevo.
 */
@Component({
  selector: 'app-sockets-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="anim">
      <div class="head">
        <div class="titles">
          <div class="title">🔌 Sockets TCP: la secuencia cliente-servidor</div>
          <div class="caption">
            El borde punteado rojo marca las llamadas <strong>bloqueantes</strong>.
          </div>
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
        <svg viewBox="0 0 100 100">
          <defs>
            <marker id="sarrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 z" fill="#8b95b5" />
            </marker>
          </defs>

          <!-- encabezados -->
          <text x="20" y="3.4" text-anchor="middle" class="colhead cli">💻 CLIENTE (activo)</text>
          <text x="80" y="3.4" text-anchor="middle" class="colhead srv">🖥 SERVIDOR (pasivo)</text>

          <!-- líneas de vida -->
          <line x1="20" y1="5" x2="20" y2="98" class="life" />
          <line x1="80" y1="5" x2="80" y2="98" class="life" />

          <!-- zona de conexión establecida -->
          @if (established()) {
            <rect x="22" y="55" width="56" height="24" class="estab" />
            <text x="50" y="58.5" text-anchor="middle" class="estab-t">conexión establecida</text>
          }

          <!-- cajas del servidor -->
          @for (b of server; track b.id) {
            <g>
              <rect x="64" [attr.y]="b.y" width="32" height="7" rx="1.2"
                    class="box" [class.on]="isActive(b.id)" [class.past]="isDone(b.id)"
                    [class.blk]="b.blocking" />
              <text x="80" [attr.y]="b.y + 4.6" text-anchor="middle" class="bl"
                    [class.on-t]="isActive(b.id)">{{ b.label }}</text>
            </g>
          }

          <!-- cajas del cliente -->
          @for (b of client; track b.id) {
            <g>
              <rect x="4" [attr.y]="b.y" width="32" height="7" rx="1.2"
                    class="box" [class.on]="isActive(b.id)" [class.past]="isDone(b.id)"
                    [class.blk]="b.blocking" />
              <text x="20" [attr.y]="b.y + 4.6" text-anchor="middle" class="bl"
                    [class.on-t]="isActive(b.id)">{{ b.label }}</text>
            </g>
          }

          <!-- flechas del paso actual -->
          @for (a of arrows(); track $index) {
            <g>
              <line
                [attr.x1]="a.dir === 'c2s' ? 37 : 63" [attr.y1]="a.y"
                [attr.x2]="a.dir === 'c2s' ? 63 : 37" [attr.y2]="a.y"
                class="msg" [class.hs]="a.kind === 'hs'" [class.data]="a.kind === 'data'"
                [class.close]="a.kind === 'close'" marker-end="url(#sarrow)" />
              <text x="50" [attr.y]="a.y - 1.4" text-anchor="middle" class="msgl">{{ a.label }}</text>
            </g>
          }
        </svg>
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

    .canvas { background: radial-gradient(ellipse at 50% 45%, #202a40 0%, #171e2e 80%); border: 1px solid var(--border); border-radius: 10px; padding: 8px; }
    svg { width: 100%; height: auto; display: block; min-height: 420px; }

    .colhead { font-size: 2.7px; font-weight: 800; }
    .colhead.cli { fill: #58a6ff; }
    .colhead.srv { fill: #f0883e; }
    .life { stroke: #39445f; stroke-width: 0.3; stroke-dasharray: 1 1.4; }

    .box { fill: #10151f; stroke: #39445f; stroke-width: 0.4; transition: fill 0.25s, stroke 0.25s; }
    .box.blk { stroke-dasharray: 1.4 1; stroke: #6b4348; }
    .box.past { fill: #16281c; stroke: #2ea04366; }
    .box.on { fill: #2a2a1a; stroke: #ffd54f; stroke-width: 0.7; stroke-dasharray: none; }
    .bl { fill: #9aa4bf; font-size: 2.9px; font-family: Consolas, monospace; }
    .bl.on-t { fill: #fff; font-weight: 700; }

    .estab { fill: rgba(46, 160, 67, 0.07); stroke: #2ea04355; stroke-width: 0.3; stroke-dasharray: 1 1; }
    .estab-t { fill: #7ee787; font-size: 2.4px; }

    .msg { stroke: #8b95b5; stroke-width: 0.45; }
    .msg.hs { stroke: #a78bfa; }
    .msg.data { stroke: #7ee787; }
    .msg.close { stroke: #ef9a9a; }
    .msgl { fill: #c8d0e4; font-size: 2.5px; font-family: Consolas, monospace; }

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
export class SocketsDetail extends SteppedAnim implements OnDestroy {
  readonly steps = STEPS;
  readonly server = SERVER;
  readonly client = CLIENT;

  protected stepCount(): number {
    return STEPS.length;
  }
  protected override stepTravel(_i: number): number {
    return 600;
  }
  protected override stepDwell(_i: number): number {
    return 3800;
  }

  private cur(): SockStep | null {
    const i = this.index();
    if (i < 0) return null;
    return this.finished() ? STEPS[STEPS.length - 1] : STEPS[i];
  }

  isActive(id: string): boolean {
    return !!this.cur()?.active.includes(id);
  }

  /** una caja está "hecha" si se activó en algún paso anterior al actual */
  isDone(id: string): boolean {
    const i = this.finished() ? STEPS.length - 1 : this.index();
    if (i < 0) return false;
    for (let k = 0; k < i; k++) {
      if (STEPS[k].active.includes(id)) return true;
    }
    return false;
  }

  readonly arrows = computed<Arrow[]>(() => this.cur()?.arrows ?? []);
  readonly established = computed(() => !!this.cur()?.established);

  readonly statusMsg = computed(() => {
    if (this.finished()) {
      return '<strong>El resumen:</strong> el servidor es pasivo y hace <code>socket → bind → listen → accept</code>; el cliente es activo y hace <code>socket → connect</code>. Las bloqueantes son <code>accept</code>, <code>connect</code> y <code>read</code>. Y la clave: <code>accept()</code> devuelve un <strong>fd nuevo por cliente</strong>, mientras el socket pasivo sigue escuchando.';
    }
    const i = this.index();
    if (i < 0) {
      return 'Presioná ▶ Play. Vamos a seguir la secuencia completa de una conexión TCP, desde que el servidor abre el socket hasta el cierre.';
    }
    return STEPS[i].msg;
  });

  ngOnDestroy(): void {
    this.destroy();
  }
}
