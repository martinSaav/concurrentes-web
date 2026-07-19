import { Routes } from '@angular/router';
import { Home } from './pages/home';
import { SectionPage } from './pages/section';

export const routes: Routes = [
  { path: '', component: Home, title: 'Concurrentes — TPC interactivo' },
  { path: 's/:slug', component: SectionPage, title: 'Concurrentes — Sección' },
  { path: '**', redirectTo: '' },
];
