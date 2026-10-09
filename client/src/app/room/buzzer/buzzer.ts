import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { BuzzWindowView, RoomView } from '@shared/protocol';
import { GameSocket } from '../../core/game-socket';
import { Countdown } from '../countdown/countdown';

type BuzzerState = 'waiting' | 'their-head-start' | 'open' | 'mine' | 'theirs' | 'correct' | 'wrong' | 'locked-out' | 'done';

/** The player's buzzer, for board clues and tiebreakers alike. */
@Component({
  selector: 'app-buzzer',
  imports: [Countdown],
  templateUrl: './buzzer.html',
  styleUrl: './buzzer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.space)': 'onSpace($event)' },
})
export class Buzzer {
  private readonly game = inject(GameSocket);
  readonly round = input.required<BuzzWindowView>();
  readonly state = input.required<RoomView>();

  private readonly myId = computed(() => this.state().you.playerId);

  protected readonly status = computed<BuzzerState>(() => {
    const round = this.round();
    const me = this.myId();
    // Your own result wins over everything else.
    if (me && round.correctPlayerId === me) return 'correct';
    if (me && round.wrongPlayerIds.includes(me)) return 'wrong';
    if (round.phase === 'revealed') return 'done';
    if (me && round.lockedOutPlayerIds.includes(me)) return 'locked-out';
    if (round.phase === 'answering') return round.buzzedPlayerId === me ? 'mine' : 'theirs';
    if (round.phase === 'buzzing') {
      return round.priorityPlayerId && round.priorityPlayerId !== me ? 'their-head-start' : 'open';
    }
    return 'waiting';
  });

  /** Seconds to show on the button: until buzzers open, or until the current window closes. */
  protected readonly countdownTo = computed(() => {
    const round = this.round();
    if (this.status() === 'waiting') return round.buzzersOpenAt;
    if (this.status() === 'their-head-start') return round.buzzEndsAt;
    return null;
  });

  protected readonly hasHeadStart = computed(() => this.round().priorityPlayerId === this.myId());

  protected readonly message = computed(() => {
    const round = this.round();
    const nameOf = (id: string | null) => this.state().players.find((p) => p.id === id)?.name ?? 'Someone';
    switch (this.status()) {
      case 'waiting':
        return 'Get ready…';
      case 'their-head-start':
        return `${nameOf(round.priorityPlayerId)} picked this one, so only they can buzz for now`;
      case 'open':
        return this.hasHeadStart() ? 'Your pick! Buzz in before time runs out, or it opens to everyone' : 'Tap or press Space';
      case 'mine':
        return "You're in! Say your answer out loud.";
      case 'theirs':
        return `${nameOf(round.buzzedPlayerId)} got there first`;
      case 'correct':
        return 'You got it!';
      case 'wrong':
        return "Not quite. You're out on this one.";
      case 'locked-out':
        return "Time's up. You're out on this one.";
      case 'done':
        return 'Answer revealed';
    }
  });

  protected buzz(): void {
    if (this.status() !== 'open') return;
    navigator.vibrate?.(60);
    void this.game.buzz();
  }

  protected onSpace(event: Event): void {
    // Don't steal Space from buttons or inputs that have focus.
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, button')) return;
    event.preventDefault();
    this.buzz();
  }
}
