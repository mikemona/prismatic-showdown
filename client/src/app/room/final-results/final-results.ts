import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { RoomView } from '@shared/protocol';
import { GameSocket } from '../../core/game-socket';
import { GoldenPrism } from '../../shared/golden-prism/golden-prism';

@Component({
  selector: 'app-final-results',
  imports: [RouterLink, GoldenPrism],
  templateUrl: './final-results.html',
  styleUrl: './final-results.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FinalResults {
  protected readonly game = inject(GameSocket);
  readonly state = input.required<RoomView>();

  protected readonly ranked = computed(() => [...this.state().players].sort((a, b) => b.score - a.score));
  /** Decided by the server, so it accounts for tiebreakers. */
  protected readonly champion = computed(() => this.state().players.find((p) => p.id === this.state().championId) ?? null);
  protected readonly isHost = computed(() => this.state().you.role === 'host');
}
