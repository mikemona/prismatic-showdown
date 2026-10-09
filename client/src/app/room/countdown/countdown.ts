import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, signal } from '@angular/core';
import { GameSocket } from '../../core/game-socket';

const RING_RADIUS = 24;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Shows the seconds left until `endsAt` (server epoch ms). As a ring, it also
 * drains as time runs out when `durationMs` (the full length) is given.
 */
@Component({
  selector: 'app-countdown',
  template: `
    @if (size() === 'inline') {
      <span class="countdown countdown--inline">{{ secondsLeft() }}</span>
    } @else {
      <span class="countdown" [class.countdown--low]="secondsLeft() <= 5" [class.countdown--done]="secondsLeft() === 0">
        <svg class="countdown__ring" viewBox="0 0 56 56" aria-hidden="true">
          <circle class="countdown__track" cx="28" cy="28" [attr.r]="radius" />
          <circle
            class="countdown__progress"
            cx="28"
            cy="28"
            [attr.r]="radius"
            [attr.stroke-dasharray]="circumference"
            [attr.stroke-dashoffset]="dashOffset()"
          />
        </svg>
        <span class="countdown__value"><span class="pp-sr-only">Time left: </span>{{ secondsLeft() }}</span>
      </span>
    }
  `,
  styles: `
    .countdown {
      --countdown-color: var(--pp-blue);

      position: relative;
      display: inline-grid;
      place-items: center;
      width: 56px;
      height: 56px;
      color: var(--countdown-color);
      font: 700 22px var(--pp-font-display);
      font-variant-numeric: tabular-nums;

      &--low {
        --countdown-color: var(--pp-orange);
      }

      &--done {
        --countdown-color: var(--pp-red);
      }

      &--inline {
        display: inline;
        width: auto;
        height: auto;
        color: inherit;
        font: inherit;
      }

      &__ring {
        position: absolute;
        inset: 0;
        // Start the stroke at 12 o'clock and drain clockwise.
        transform: rotate(-90deg);
      }

      &__track,
      &__progress {
        fill: none;
        stroke-width: 4;
      }

      &__track {
        stroke: rgb(255 255 255 / 0.15);
      }

      &__progress {
        stroke: var(--countdown-color);
        stroke-linecap: round;
        transition:
          stroke-dashoffset 100ms linear,
          stroke 200ms;
      }

      &__value {
        position: relative;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Countdown {
  readonly endsAt = input.required<number>();
  readonly size = input<'ring' | 'inline'>('ring');
  /** Full length of the countdown, so the ring can show how much is left. Without it the ring stays full. */
  readonly durationMs = input<number | null>(null);

  protected readonly radius = RING_RADIUS;
  protected readonly circumference = RING_CIRCUMFERENCE;

  private readonly game = inject(GameSocket);
  private readonly now = signal(this.game.serverTime());
  private readonly remainingMs = computed(() => Math.max(0, this.endsAt() - this.now()));
  protected readonly secondsLeft = computed(() => Math.ceil(this.remainingMs() / 1000));

  /** 0 = full ring, circumference = empty. */
  protected readonly dashOffset = computed(() => {
    const duration = this.durationMs();
    if (!duration) return 0;
    const fraction = Math.min(1, this.remainingMs() / duration);
    return RING_CIRCUMFERENCE * (1 - fraction);
  });

  constructor() {
    // Fast enough for a smooth ring; the CSS transition fills in between ticks.
    const id = setInterval(() => this.now.set(this.game.serverTime()), 100);
    inject(DestroyRef).onDestroy(() => clearInterval(id));
  }
}
