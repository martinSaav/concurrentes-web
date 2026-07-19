import { computed, signal } from '@angular/core';

/**
 * Base para animaciones paso a paso hechas a medida.
 * Cada paso tiene una fase de "viaje" (travel) y una de lectura (dwell).
 * Las subclases definen la cantidad de pasos y usan index() + progress()
 * para renderizar lo que corresponda.
 */
export abstract class SteppedAnim {
  protected abstract stepCount(): number;

  /** duración del viaje del paso i (ms) — sobreescribible por paso */
  protected stepTravel(_i: number): number {
    return 1100;
  }
  protected stepDwell(_i: number): number {
    return 2400;
  }

  readonly speedOptions = [0.5, 1, 1.5, 2];

  readonly index = signal(-1); // -1 = sin arrancar
  readonly playing = signal(false);
  readonly finished = signal(false);
  readonly speed = signal(1);
  protected readonly t = signal(0); // ms dentro del paso actual

  /** progreso del viaje del paso actual: 0..1 */
  readonly progress = computed(() => {
    const i = this.index();
    if (i < 0) return 0;
    return Math.min(this.t() / this.stepTravel(i), 1);
  });

  private rafId = 0;
  private lastTs = 0;

  toggle(): void {
    this.playing() ? this.pause() : this.play();
  }

  play(): void {
    if (this.finished()) this.resetState();
    if (this.index() < 0) {
      this.index.set(0);
      this.t.set(0);
    } else {
      const i = this.index();
      if (this.t() >= this.stepTravel(i) + this.stepDwell(i)) this.advance();
    }
    this.playing.set(true);
    this.lastTs = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  pause(): void {
    this.playing.set(false);
    cancelAnimationFrame(this.rafId);
  }

  next(): void {
    this.pause();
    if (this.index() < 0) {
      this.index.set(0);
    } else if (this.index() >= this.stepCount() - 1) {
      this.finished.set(true);
      return;
    } else {
      this.index.update((i) => i + 1);
    }
    this.t.set(this.stepTravel(this.index()));
  }

  prev(): void {
    this.pause();
    if (this.finished()) {
      this.finished.set(false);
      this.index.set(this.stepCount() - 1);
    } else if (this.index() <= 0) {
      this.resetState();
      return;
    } else {
      this.index.update((i) => i - 1);
    }
    this.t.set(this.stepTravel(this.index()));
  }

  jump(i: number): void {
    this.pause();
    this.finished.set(false);
    this.index.set(i);
    this.t.set(this.stepTravel(i));
  }

  reset(): void {
    this.resetState();
  }

  setSpeed(s: number): void {
    this.speed.set(s);
  }

  protected resetState(): void {
    this.pause();
    this.finished.set(false);
    this.index.set(-1);
    this.t.set(0);
  }

  private advance(): void {
    if (this.index() >= this.stepCount() - 1) {
      this.finished.set(true);
      this.pause();
    } else {
      this.index.update((i) => i + 1);
      this.t.set(0);
    }
  }

  private readonly tick = (now: number): void => {
    if (!this.playing()) return;
    const dt = Math.min(now - this.lastTs, 100) * this.speed();
    this.lastTs = now;
    const i = this.index();
    const total = this.stepTravel(i) + this.stepDwell(i);
    const nt = this.t() + dt;
    if (nt >= total) {
      this.advance();
      if (!this.playing()) return;
    } else {
      this.t.set(nt);
    }
    this.rafId = requestAnimationFrame(this.tick);
  };

  destroy(): void {
    cancelAnimationFrame(this.rafId);
  }
}
