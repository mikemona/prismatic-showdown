import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { ActiveClueView } from '@shared/protocol';
import { TextClue } from './text-clue';

/**
 * Picks the renderer for a clue's challenge type.
 * To add a challenge type: extend `ClueType` in shared/protocol.ts, build a
 * component in this folder, and add a case below.
 */
@Component({
  selector: 'app-clue-renderer',
  imports: [TextClue],
  template: `
    @switch (clue().type) {
      @case ('text') {
        <app-text-clue [clue]="clue()" />
      }
      @default {
        <p>{{ clue().prompt }}</p>
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClueRenderer {
  readonly clue = input.required<ActiveClueView>();
}
