import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SECTIONS } from '../data/content';
import { RaceDetail } from '../components/detail/race-detail';
import { MutexDetail } from '../components/detail/mutex-detail';
import { SemDetail } from '../components/detail/sem-detail';
import { CondvarDetail } from '../components/detail/condvar-detail';
import { DeadlockDetail } from '../components/detail/deadlock-detail';
import { RwlockDetail } from '../components/detail/rwlock-detail';
import { ForkjoinDetail } from '../components/detail/forkjoin-detail';
import { AmdahlDetail } from '../components/detail/amdahl-detail';
import { MpscDetail } from '../components/detail/mpsc-detail';
import { ActorsDetail } from '../components/detail/actors-detail';
import { AsyncDetail } from '../components/detail/async-detail';
import { LeaderDetail } from '../components/detail/leader-detail';
import { TwophaseDetail } from '../components/detail/twophase-detail';
import { DistmutexDetail } from '../components/detail/distmutex-detail';
import { PetriDetail } from '../components/detail/petri-detail';
import { ReachDetail } from '../components/detail/reach-detail';

@Component({
  selector: 'app-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    RaceDetail,
    MutexDetail,
    SemDetail,
    CondvarDetail,
    DeadlockDetail,
    RwlockDetail,
    ForkjoinDetail,
    AmdahlDetail,
    MpscDetail,
    ActorsDetail,
    AsyncDetail,
    LeaderDetail,
    TwophaseDetail,
    DistmutexDetail,
    PetriDetail,
    ReachDetail,
  ],
  template: `
    @if (section(); as sec) {
      <div class="page" [style.--c]="sec.color">
        <header class="sec-head">
          <div class="chip">{{ sec.tag }}</div>
          <h1><span class="icon">{{ sec.icon }}</span> {{ sec.title }}</h1>
          <p class="tagline">{{ sec.tagline }}</p>
        </header>

        <nav class="toc">
          @for (t of sec.topics; track $index; let i = $index) {
            <a [href]="'#t' + i" class="toc-item">{{ i + 1 }}. {{ t.title }}</a>
          }
        </nav>

        @for (t of sec.topics; track $index; let i = $index) {
          <article class="topic" [id]="'t' + i">
            <h2><span class="num">{{ i + 1 }}</span> {{ t.title }}</h2>
            <div class="topic-body" [innerHTML]="t.html"></div>
            @switch (t.widget) {
              @case ('race-detail') { <app-race-detail /> }
              @case ('mutex-detail') { <app-mutex-detail /> }
              @case ('sem-detail') { <app-sem-detail /> }
              @case ('condvar-detail') { <app-condvar-detail /> }
              @case ('deadlock-detail') { <app-deadlock-detail /> }
              @case ('rwlock-detail') { <app-rwlock-detail /> }
              @case ('forkjoin-detail') { <app-forkjoin-detail /> }
              @case ('amdahl-detail') { <app-amdahl-detail /> }
              @case ('mpsc-detail') { <app-mpsc-detail /> }
              @case ('actors-detail') { <app-actors-detail /> }
              @case ('async-detail') { <app-async-detail /> }
              @case ('leader-detail') { <app-leader-detail /> }
              @case ('twophase-detail') { <app-twophase-detail /> }
              @case ('distmutex-detail') { <app-distmutex-detail /> }
              @case ('petri-detail') { <app-petri-detail /> }
              @case ('reach-detail') { <app-reach-detail /> }
            }
          </article>
        }

        <nav class="pager">
          @if (prev(); as p) {
            <a class="pg" [routerLink]="['/s', p.slug]">← {{ p.icon }} {{ p.short }}</a>
          } @else {
            <a class="pg" routerLink="/">← 🏠 Inicio</a>
          }
          @if (next(); as n) {
            <a class="pg next" [routerLink]="['/s', n.slug]">{{ n.icon }} {{ n.short }} →</a>
          } @else {
            <a class="pg next" routerLink="/">🏠 Inicio →</a>
          }
        </nav>
      </div>
    } @else {
      <div class="page">
        <h1>Sección no encontrada</h1>
        <p><a routerLink="/">Volver al inicio</a></p>
      </div>
    }
  `,
  styles: `
    .page { width: calc(50% + 590px); max-width: 100%; margin: 0 auto; padding: 28px 24px 60px; }
    .sec-head { margin-bottom: 22px; }
    .chip {
      display: inline-block;
      font-size: 0.75rem;
      color: var(--c);
      border: 1px solid var(--c);
      border-radius: 14px;
      padding: 3px 12px;
      margin-bottom: 10px;
    }
    h1 { margin: 0 0 6px; font-size: clamp(1.6rem, 4vw, 2.3rem); }
    .icon { margin-right: 4px; }
    .tagline { color: var(--text-dim); margin: 0; font-size: 1.02rem; }

    .toc {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 18px 0 30px;
    }
    .toc-item {
      font-size: 0.82rem;
      color: var(--text-dim);
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 4px 12px;
      transition: color 0.15s, border-color 0.15s;
    }
    .toc-item:hover { color: var(--c); border-color: var(--c); }

    .topic { margin-bottom: 36px; scroll-margin-top: 20px; }
    .topic h2 {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 1.25rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 10px;
      margin: 0 0 14px;
    }
    .num {
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--c);
      color: #0d1117;
      font-size: 0.9rem;
      font-weight: 800;
      border-radius: 8px;
    }

    .pager { display: flex; justify-content: space-between; gap: 12px; margin-top: 44px; }
    .pg {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px 18px;
      color: var(--text);
      font-weight: 600;
      transition: border-color 0.15s, transform 0.15s;
    }
    .pg:hover { border-color: var(--c); transform: translateY(-2px); }
  `,
})
export class SectionPage {
  // route param binding (withComponentInputBinding)
  readonly slug = input.required<string>();

  readonly section = computed(() => SECTIONS.find((s) => s.slug === this.slug()));

  readonly prev = computed(() => {
    const i = SECTIONS.findIndex((s) => s.slug === this.slug());
    return i > 0 ? SECTIONS[i - 1] : null;
  });

  readonly next = computed(() => {
    const i = SECTIONS.findIndex((s) => s.slug === this.slug());
    return i >= 0 && i < SECTIONS.length - 1 ? SECTIONS[i + 1] : null;
  });
}
