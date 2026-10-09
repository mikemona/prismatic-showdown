import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { ActiveClueView } from '@shared/protocol';

/** Classic trivia: a written prompt, with an optional image. */
@Component({
  selector: 'app-text-clue',
  template: `
    @if (clue().media; as media) {
      <img class="text-clue__media" [src]="media.src" [alt]="media.alt" />
    }
    <p class="text-clue__prompt">{{ clue().prompt }}</p>
  `,
  styles: `
    :host {
      display: grid;
      justify-items: center;
      gap: 20px;
    }

    .text-clue {
      &__media {
        max-width: 100%;
        max-height: 280px;
        border-radius: var(--pp-radius-sm);
      }

      &__prompt {
        margin: 0;
        font: 700 clamp(22px, 3.4vw, 40px) / 1.25 var(--pp-font-display);
        text-align: center;
        text-wrap: balance;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextClue {
  /** Also used for tiebreakers, which have a prompt but no media. */
  readonly clue = input.required<Pick<ActiveClueView, 'prompt' | 'media'>>();
}
