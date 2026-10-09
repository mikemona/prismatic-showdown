import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ActiveClueView } from '@shared/protocol';
import { GameSocket } from '../../core/game-socket';

/** Shown to the player who found the Daily Double, in place of the buzzer, until they wager. */
@Component({
  selector: 'app-daily-double-wager',
  imports: [FormsModule],
  template: `
    @if (clue().dailyDouble; as dd) {
      <form class="pp-card dd-wager" (ngSubmit)="submit()">
        <h2 class="dd-wager__title">Daily Double!</h2>
        <p class="dd-wager__hint">
          Only you answer this one, and it's a tough one. Wager between {{ dd.minWager }} and {{ dd.maxWager }}.
        </p>
        <label class="pp-field">
          <span class="pp-field__label">Your wager ({{ dd.minWager }}–{{ dd.maxWager }})</span>
          <input
            class="pp-field__input"
            type="number"
            name="wager"
            inputmode="numeric"
            [min]="dd.minWager"
            [max]="dd.maxWager"
            step="1"
            required
            [ngModel]="amount()"
            (ngModelChange)="amount.set($event)"
          />
        </label>
        <button class="pp-btn pp-btn--primary pp-btn--block" type="submit" [disabled]="amount() === null || submitting()">
          Lock in wager
        </button>
      </form>
    }
  `,
  styles: `
    .dd-wager {
      display: grid;
      gap: 14px;
      padding: 20px;
      border-color: var(--pp-value);

      &__title {
        color: var(--pp-value);
        font-size: 26px;
      }

      &__hint {
        margin: 0;
        color: var(--pp-text-muted);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DailyDoubleWager {
  private readonly game = inject(GameSocket);
  readonly clue = input.required<ActiveClueView>();

  protected readonly amount = signal<number | null>(null);
  protected readonly submitting = signal(false);

  protected async submit(): Promise<void> {
    const amount = this.amount();
    if (amount === null) return;
    this.submitting.set(true);
    await this.game.wager(Math.floor(amount));
    this.submitting.set(false);
  }
}
