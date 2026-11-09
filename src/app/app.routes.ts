import { ResolveFn, Routes } from '@angular/router';
import { Home } from './pages/home';
import { SectionPage } from './pages/section';
import { SECTIONS } from './data/content';

/** título de la pestaña con el nombre real de la sección */
const sectionTitle: ResolveFn<string> = (route) => {
  const s = SECTIONS.find((x) => x.slug === route.paramMap.get('slug'));
  return s ? `${s.icon} ${s.title} — Concurrentes` : 'Concurrentes';
};

export const routes: Routes = [
  { path: '', component: Home, title: 'Concurrentes — TPC interactivo' },
  { path: 's/:slug', component: SectionPage, title: sectionTitle },
  { path: '**', redirectTo: '' },
];
