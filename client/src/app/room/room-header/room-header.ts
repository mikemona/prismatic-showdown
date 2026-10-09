import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { RoomView } from '@shared/protocol';
import { injectCopyInvite } from '../invite-link';

@Component({
  selector: 'app-room-header',
  imports: [RouterLink],
  templateUrl: './room-header.html',
  styleUrl: './room-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomHeader {
  readonly state = input.required<RoomView>();
  readonly connected = input.required<boolean>();

  protected readonly invite = injectCopyInvite();
  protected readonly youLabel = computed(() => {
    const s = this.state();
    if (s.you.role === 'host') return `${s.hostName} · Host`;
    return s.players.find((p) => p.id === s.you.playerId)?.name ?? '';
  });
}
