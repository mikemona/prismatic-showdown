import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { RoomView } from '@shared/protocol';
import { GameSocket } from '../../core/game-socket';

@Component({
  selector: 'app-board',
  templateUrl: './board.html',
  styleUrl: './board.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Board {
  protected readonly game = inject(GameSocket);
  readonly state = input.required<RoomView>();

  protected readonly controlName = computed(() => {
    const s = this.state();
    return s.players.find((p) => p.id === s.controlPlayerId)?.name ?? null;
  });

  protected readonly canPick = computed(() => {
    const s = this.state();
    if (s.you.role === 'host') return true;
    return s.settings.playersPickClues && s.you.playerId === s.controlPlayerId;
  });

  protected readonly banner = computed(() => {
    const s = this.state();
    const name = this.controlName();
    if (s.you.role === 'player' && s.you.playerId === s.controlPlayerId && s.settings.playersPickClues) {
      return "It's your pick! Choose a clue.";
    }
    if (!name) return s.you.role === 'host' ? 'Pick a clue to play.' : `${s.hostName} is picking the next clue.`;
    if (s.settings.playersPickClues) return `${name} is picking the next clue.`;
    return `${name} has control.`;
  });
}
