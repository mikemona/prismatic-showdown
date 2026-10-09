import { ChangeDetectionStrategy, Component } from '@angular/core';

const PIECES = 70;
const COLORS = ['--pp-red', '--pp-orange', '--pp-yellow', '--pp-green', '--pp-blue', '--pp-violet', '--pp-value'];

interface Piece {
  left: number;
  delay: number;
  duration: number;
  drift: number;
  spin: number;
  width: number;
  height: number;
  color: string;
}

/**
 * A one-shot burst of prism-colored confetti that falls through its parent.
 * The parent needs `position: relative` and should clip overflow. Skipped
 * entirely for people who prefer reduced motion.
 */
@Component({
  selector: 'app-confetti',
  template: `
    @for (p of pieces; track $index) {
      <span
        class="confetti__piece"
        [style.left.%]="p.left"
        [style.width.px]="p.width"
        [style.height.px]="p.height"
        [style.background]="p.color"
        [style.animation-delay.ms]="p.delay"
        [style.animation-duration.ms]="p.duration"
        [style.--drift.px]="p.drift"
        [style.--spin.deg]="p.spin"
      ></span>
    }
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      overflow: hidden;
      pointer-events: none;
      z-index: 5;
    }

    .confetti__piece {
      position: absolute;
      top: -16px;
      border-radius: 2px;
      opacity: 0;
      animation-name: confetti-fall;
      animation-timing-function: cubic-bezier(0.25, 0.6, 0.5, 1);
      animation-fill-mode: forwards;
    }

    @keyframes confetti-fall {
      0% {
        opacity: 1;
        transform: translate3d(0, 0, 0) rotate(0deg);
      }

      85% {
        opacity: 1;
      }

      100% {
        opacity: 0;
        transform: translate3d(var(--drift), 520px, 0) rotate(var(--spin));
      }
    }

    @media (prefers-reduced-motion: reduce) {
      :host {
        display: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Confetti {
  protected readonly pieces: Piece[] = Array.from({ length: PIECES }, () => ({
    left: Math.random() * 100,
    delay: Math.random() * 500,
    duration: 1600 + Math.random() * 1400,
    drift: (Math.random() - 0.5) * 160,
    spin: (Math.random() - 0.5) * 1080,
    width: 6 + Math.random() * 6,
    height: 8 + Math.random() * 8,
    color: `var(${COLORS[Math.floor(Math.random() * COLORS.length)]})`,
  }));
}
