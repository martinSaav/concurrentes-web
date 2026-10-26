import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { SECTIONS } from '../data/content';

/* Buscador global sobre todos los temas: título + contenido.
   Se abre con Ctrl/Cmd+K y navega a /s/{slug}#t{i}. */

interface Entry {
  slug: string;
  secTitle: string;
  secShort: string;
  icon: string;
  color: string;
  idx: number;
  title: string;
  /** texto plano del tema, para buscar y para el snippet */
  text: string;
  /** título + texto, en minúsculas y sin tildes: sobre esto se matchea */
  hay: string;
  titleNorm: string;
}

/** quita tildes y pasa a minúsculas, para que "exclusion" encuentre "exclusión" */
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

const TOPIC_COUNT = SECTIONS.reduce((n, s) => n + s.topics.length, 0);

/** El índice se arma una sola vez, la primera vez que se abre el buscador. */
let INDEX: Entry[] | null = null;
function buildIndex(): Entry[] {
  if (INDEX) return INDEX;
  const out: Entry[] = [];
  for (const s of SECTIONS) {
    s.topics.forEach((t, i) => {
      const text = stripHtml(t.html);
      out.push({
        slug: s.slug,
        secTitle: s.title,
        secShort: s.short,
        icon: s.icon,
        color: s.color,
        idx: i,
        title: t.title,
        text,
        hay: norm(t.title + ' ' + text),
        titleNorm: norm(t.title),
      });
    });
  }
  INDEX = out;
  return out;
}

interface Hit extends Entry {
  score: number;
  snippet: { txt: string; hit: boolean }[];
}

@Component({
  selector: 'app-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button class="opener" (click)="open()" aria-label="Buscar">
      <span class="oi">🔍</span>
      <span class="ot">Buscar…</span>
      <kbd>Ctrl K</kbd>
    </button>

    @if (isOpen()) {
      <div class="ov" (click)="close()">
        <div class="panel" (click)="$event.stopPropagation()">
          <div class="ibar">
            <span class="ii">🔍</span>
            <input
              #box
              type="text"
              [placeholder]="'Buscar en los ' + topicCount + ' temas… (ej: deadlock, Arbiter, wait-die)'"
              [value]="term()"
              (input)="onInput($event)"
              (keydown)="onKey($event)"
              autocomplete="off"
              spellcheck="false"
            />
            @if (term()) {
              <button class="clr" (click)="term.set(''); focusBox()" aria-label="Limpiar">✕</button>
            }
            <kbd class="esc">Esc</kbd>
          </div>

          @if (term().length > 0 && hits().length === 0) {
            <div class="empty">
              Sin resultados para <b>{{ term() }}</b>.
              <span>Probá con menos palabras o un término de la materia.</span>
            </div>
          }

          @if (hits().length > 0) {
            <div class="count">{{ hits().length }} resultado{{ hits().length === 1 ? '' : 's' }}</div>
            <ul class="res">
              @for (h of hits(); track h.slug + '-' + h.idx; let i = $index) {
                <li>
                  <button
                    class="row"
                    [class.sel]="i === cursor()"
                    [style.--c]="h.color"
                    (click)="go(h)"
                    (mouseenter)="cursor.set(i)"
                  >
                    <span class="rsec"><span class="rico">{{ h.icon }}</span>{{ h.secShort }}</span>
                    <span class="rtit">{{ h.title }}</span>
                    <span class="rsnip">
                      @for (p of h.snippet; track $index) {
                        @if (p.hit) { <mark>{{ p.txt }}</mark> } @else { <span>{{ p.txt }}</span> }
                      }
                    </span>
                  </button>
                </li>
              }
            </ul>
          }

          @if (term().length === 0) {
            <div class="hintbox">
              <div class="hh">Atajos</div>
              <div class="hl"><kbd>↑</kbd><kbd>↓</kbd> moverse · <kbd>Enter</kbd> abrir · <kbd>Esc</kbd> cerrar</div>
              <div class="hh">Probá con</div>
              <div class="chips">
                @for (e of examples; track e) {
                  <button class="chip" (click)="term.set(e); cursor.set(0); focusBox()">{{ e }}</button>
                }
              </div>
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: `
    .opener {
      display: flex; align-items: center; gap: 8px; width: 100%;
      background: var(--panel-2); color: var(--text-dim);
      border: 1px solid var(--border); border-radius: 9px;
      padding: 8px 10px; cursor: pointer; font: inherit; font-size: 0.82rem;
      transition: border-color 0.15s, color 0.15s;
    }
    .opener:hover { border-color: var(--accent); color: var(--text); }
    .oi { font-size: 0.9rem; }
    .ot { flex: 1; text-align: left; }
    kbd {
      font-family: Consolas, monospace; font-size: 0.62rem; color: var(--text-dim);
      background: var(--panel); border: 1px solid var(--border);
      border-radius: 4px; padding: 1px 5px; white-space: nowrap;
    }

    .ov {
      position: fixed; inset: 0; z-index: 200;
      background: rgba(3, 6, 14, 0.72);
      backdrop-filter: blur(3px);
      display: flex; justify-content: center;
      padding: 8vh 16px 16px;
      animation: fade 0.12s ease;
    }
    @keyframes fade { from { opacity: 0; } to { opacity: 1; } }

    .panel {
      width: 100%; max-width: 680px; max-height: 76vh;
      display: flex; flex-direction: column;
      background: var(--panel); border: 1px solid var(--border);
      border-radius: 14px; overflow: hidden;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
      animation: pop 0.14s ease;
    }
    @keyframes pop { from { transform: translateY(-8px); opacity: 0; } to { transform: none; opacity: 1; } }

    .ibar { display: flex; align-items: center; gap: 9px; padding: 12px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
    .ii { font-size: 1rem; }
    .ibar input {
      flex: 1; min-width: 0; background: transparent; border: none; outline: none;
      color: var(--text); font: inherit; font-size: 1rem;
    }
    .ibar input::placeholder { color: #5c6a8e; }
    .clr { background: none; border: none; color: var(--text-dim); cursor: pointer; font-size: 0.8rem; padding: 2px 6px; border-radius: 5px; }
    .clr:hover { background: var(--panel-2); color: var(--text); }

    .count { padding: 8px 14px 4px; font-size: 0.66rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.04em; }
    .res { list-style: none; margin: 0; padding: 0 8px 8px; overflow-y: auto; }

    .row {
      display: grid; gap: 3px; width: 100%; text-align: left;
      background: transparent; border: 1px solid transparent; border-radius: 9px;
      padding: 9px 11px; cursor: pointer; font: inherit;
      border-left: 3px solid transparent;
    }
    .row.sel { background: var(--panel-2); border-color: var(--border); border-left-color: var(--c); }
    .rsec { display: flex; align-items: center; gap: 5px; font-size: 0.64rem; color: var(--c); font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
    .rico { font-size: 0.78rem; }
    .rtit { font-size: 0.9rem; font-weight: 600; color: #fff; }
    .rsnip { font-size: 0.74rem; color: var(--text-dim); line-height: 1.45; }
    .rsnip mark { background: rgba(255, 213, 79, 0.22); color: #ffd54f; border-radius: 3px; padding: 0 2px; font-weight: 600; }

    .empty { padding: 22px 16px; color: var(--text-dim); font-size: 0.86rem; text-align: center; }
    .empty b { color: var(--text); }
    .empty span { display: block; margin-top: 5px; font-size: 0.76rem; }

    .hintbox { padding: 14px 16px 18px; }
    .hh { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.05em; color: #5c6a8e; font-weight: 700; margin-bottom: 7px; }
    .hl { display: flex; align-items: center; gap: 5px; font-size: 0.74rem; color: var(--text-dim); margin-bottom: 16px; flex-wrap: wrap; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip {
      background: var(--panel-2); border: 1px solid var(--border); border-radius: 14px;
      color: var(--text-dim); font: inherit; font-size: 0.74rem; padding: 4px 11px; cursor: pointer;
      transition: color 0.15s, border-color 0.15s;
    }
    .chip:hover { color: var(--accent); border-color: var(--accent); }

    @media (max-width: 640px) {
      .ov { padding: 4vh 10px 10px; }
      .opener kbd, .esc { display: none; }
    }
  `,
})
export class Search {
  private readonly boxRef = viewChild<ElementRef<HTMLInputElement>>('box');

  readonly isOpen = signal(false);
  readonly term = signal('');
  readonly cursor = signal(0);

  readonly topicCount = TOPIC_COUNT;
  readonly examples = ['deadlock', 'Arbiter', 'wait-die', 'work stealing', 'inhibidor', 'Lamport', 'locked point', 'Pin'];

  constructor(private readonly router: Router) {
    // atajo global Ctrl/Cmd + K
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.isOpen() ? this.close() : this.open();
      }
    });

    // al abrir, enfocar el input
    effect(() => {
      if (this.isOpen()) queueMicrotask(() => this.focusBox());
    });
  }

  readonly hits = computed<Hit[]>(() => {
    const raw = this.term().trim();
    if (raw.length < 2) return [];
    const idx = buildIndex();
    const words = norm(raw).split(/\s+/).filter(Boolean);

    const out: Hit[] = [];
    for (const e of idx) {
      // todas las palabras deben aparecer en algún lado del tema
      if (!words.every((w) => e.hay.includes(w))) continue;

      // puntaje: título pesa mucho más que el cuerpo
      let score = 0;
      for (const w of words) {
        if (e.titleNorm.includes(w)) score += 100;
        const n = e.hay.split(w).length - 1;
        score += Math.min(n, 8);
      }
      out.push({ ...e, score, snippet: this.makeSnippet(e.text, words) });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, 40);
  });

  /** fragmento del texto alrededor del primer match, con las palabras resaltadas */
  private makeSnippet(text: string, words: string[]): { txt: string; hit: boolean }[] {
    const n = norm(text);
    let at = -1;
    for (const w of words) {
      const i = n.indexOf(w);
      if (i >= 0 && (at < 0 || i < at)) at = i;
    }
    if (at < 0) return [{ txt: text.slice(0, 150) + '…', hit: false }];

    const from = Math.max(0, at - 60);
    const to = Math.min(text.length, at + 150);
    let frag = text.slice(from, to);
    if (from > 0) frag = '…' + frag;
    if (to < text.length) frag = frag + '…';

    // partir el fragmento marcando las coincidencias
    const fn = norm(frag);
    const marks: boolean[] = new Array(frag.length).fill(false);
    for (const w of words) {
      let i = fn.indexOf(w);
      while (i >= 0) {
        for (let k = i; k < i + w.length; k++) marks[k] = true;
        i = fn.indexOf(w, i + w.length);
      }
    }
    const parts: { txt: string; hit: boolean }[] = [];
    let cur = marks[0];
    let buf = '';
    for (let i = 0; i < frag.length; i++) {
      if (marks[i] === cur) buf += frag[i];
      else {
        parts.push({ txt: buf, hit: cur });
        buf = frag[i];
        cur = marks[i];
      }
    }
    if (buf) parts.push({ txt: buf, hit: cur });
    return parts;
  }

  open(): void {
    this.isOpen.set(true);
    this.cursor.set(0);
  }

  close(): void {
    this.isOpen.set(false);
  }

  focusBox(): void {
    this.boxRef()?.nativeElement.focus();
  }

  onInput(e: Event): void {
    this.term.set((e.target as HTMLInputElement).value);
    this.cursor.set(0);
  }

  onKey(e: KeyboardEvent): void {
    const n = this.hits().length;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    } else if (e.key === 'ArrowDown' && n) {
      e.preventDefault();
      this.cursor.update((c) => (c + 1) % n);
      this.scrollToCursor();
    } else if (e.key === 'ArrowUp' && n) {
      e.preventDefault();
      this.cursor.update((c) => (c - 1 + n) % n);
      this.scrollToCursor();
    } else if (e.key === 'Enter' && n) {
      e.preventDefault();
      this.go(this.hits()[this.cursor()]);
    }
  }

  private scrollToCursor(): void {
    queueMicrotask(() => {
      document.querySelector('app-search .row.sel')?.scrollIntoView({ block: 'nearest' });
    });
  }

  go(h: Hit): void {
    this.close();
    this.router.navigate(['/s', h.slug], { fragment: 't' + h.idx }).then(() => {
      // el fragment no siempre alcanza (el tema puede montarse después): scroll manual
      setTimeout(() => document.getElementById('t' + h.idx)?.scrollIntoView({ block: 'start' }), 60);
    });
  }
}
