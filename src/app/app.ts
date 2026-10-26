import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SECTIONS } from './data/content';
import { Search } from './components/search';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Search],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly sections = SECTIONS;
  readonly menuOpen = signal(false);

  constructor() {
    // en móvil, cualquier navegación (por ejemplo, un resultado del buscador) cierra el menú
    inject(Router).events.subscribe((e) => {
      if (e instanceof NavigationEnd) this.closeMenu();
    });
  }

  toggleMenu(): void {
    this.menuOpen.update((v) => !v);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }
}
