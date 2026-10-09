import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { RoomView } from '@shared/protocol';
import { GameSocket } from '../../core/game-socket';

@Component({
  selector: 'app-scoreboard',
  templateUrl: './scoreboard.html',
  styleUrl: './scoreboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Scoreboard {
  protected readonly game = inject(GameSocket);
  readonly state = input.required<RoomView>();

  protected readonly isHost = computed(() => this.state().you.role === 'host');
  protected readonly ranked = computed(() => [...this.state().players].sort((a, b) => b.score - a.score));
  /** Host score corrections step by the smallest clue value on the board. */
  protected readonly step = computed(() => {
    const values = this.state().categories.flatMap((c) => c.clues.map((clue) => clue.value));
    return values.length ? Math.min(...values) : 100;
  });
}
