import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { RoomView } from '@shared/protocol';
import { GameSocket } from '../../core/game-socket';

/** Host panel for the board, board clues, and tiebreakers. */
@Component({
  selector: 'app-host-controls',
  templateUrl: './host-controls.html',
  styleUrl: './host-controls.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HostControls {
  protected readonly game = inject(GameSocket);
  readonly state = input.required<RoomView>();

  protected readonly clue = computed(() => this.state().activeClue);
  protected readonly tiebreaker = computed(() => (this.state().phase === 'tiebreaker' ? this.state().tiebreaker : null));
  /** Whichever question is live. */
  protected readonly round = computed(() => this.clue() ?? this.tiebreaker());

  protected nameOf(id: string | null | undefined): string {
    return this.state().players.find((p) => p.id === id)?.name ?? '';
  }

  protected endGame(): void {
    if (confirm('End the game now and show final scores?')) void this.game.end();
  }

  protected changeControl(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    void this.game.setControl(value || null);
  }
}
