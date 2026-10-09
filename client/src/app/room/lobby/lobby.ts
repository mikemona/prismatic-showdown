import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { RoomView } from '@shared/protocol';
import { GameSocket } from '../../core/game-socket';
import { injectCopyInvite, inviteUrl } from '../invite-link';

@Component({
  selector: 'app-lobby',
  templateUrl: './lobby.html',
  styleUrl: './lobby.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Lobby {
  protected readonly game = inject(GameSocket);
  readonly state = input.required<RoomView>();

  protected readonly invite = injectCopyInvite();
  protected readonly link = computed(() => inviteUrl(this.state().code));
  protected readonly isHost = computed(() => this.state().you.role === 'host');
  protected readonly hasBots = computed(() => this.state().players.some((p) => p.isBot));

  /** Opens the room in a new tab that joins as a brand-new player, so the host can test both sides. */
  protected openPlayerTab(): void {
    window.open(`${inviteUrl(this.state().code)}?fresh=1`, '_blank');
  }

  protected toggle(setting: 'negativeScoring' | 'playersPickClues', event: Event): void {
    this.game.updateSettings({ [setting]: (event.target as HTMLInputElement).checked });
  }
}
