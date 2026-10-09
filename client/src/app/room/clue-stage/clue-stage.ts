import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ActiveClueView, BuzzWindowView, PlayerView, TiebreakerView } from '@shared/protocol';
import { ClueRenderer } from '../clue-types/clue-renderer';
import { TextClue } from '../clue-types/text-clue';
import { Countdown } from '../countdown/countdown';

/** The question on screen: a board clue, or a tiebreaker. Pass exactly one. */
@Component({
  selector: 'app-clue-stage',
  imports: [ClueRenderer, TextClue, Countdown],
  templateUrl: './clue-stage.html',
  styleUrl: './clue-stage.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClueStage {
  readonly clue = input<ActiveClueView | null>(null);
  readonly tiebreaker = input<TiebreakerView | null>(null);
  readonly players = input.required<PlayerView[]>();
  /** The host sees the Daily Double clue while the player is still wagering. */
  readonly isHost = input(false);

  protected readonly pips = [1, 2, 3, 4, 5];

  protected readonly round = computed<BuzzWindowView>(() => (this.clue() ?? this.tiebreaker())!);
  protected readonly dailyDouble = computed(() => this.clue()?.dailyDouble ?? null);
  /** A Daily Double was found and the host hasn't revealed its clue yet. */
  protected readonly ddHidden = computed(() => {
    const dd = this.dailyDouble();
    return dd !== null && !dd.revealed;
  });
  protected readonly ddName = computed(() => this.players().find((p) => p.id === this.dailyDouble()?.playerId)?.name ?? 'Someone');
  protected readonly answer = computed(() => this.clue()?.answer ?? this.tiebreaker()?.answer ?? null);

  protected readonly tiedNames = computed(() => {
    const ids = this.tiebreaker()?.eligiblePlayerIds ?? [];
    return this.players()
      .filter((p) => ids.includes(p.id))
      .map((p) => p.name)
      .join(' vs ');
  });

  /** Countdown shown next to the status: until buzzers open, or until the buzz window closes. */
  protected readonly statusCountdown = computed(() => {
    const round = this.round();
    if (round.phase === 'reading') return round.buzzersOpenAt;
    if (round.phase === 'buzzing') return round.buzzEndsAt;
    return null;
  });

  protected readonly statusText = computed(() => {
    const round = this.round();
    const nameOf = (id: string | null) => this.players().find((p) => p.id === id)?.name ?? 'Someone';
    const dd = this.dailyDouble();
    if (dd && round.phase === 'reading') {
      return dd.wager === null ? `${this.ddName()} is placing a wager…` : `${this.ddName()} wagered ${dd.wager}. Get ready…`;
    }
    if (dd && round.phase === 'answering') return `${this.ddName()} is answering for ${dd.wager}`;
    switch (round.phase) {
      case 'reading':
        return 'Buzzers open in';
      case 'buzzing':
        if (round.priorityPlayerId) return `Only ${nameOf(round.priorityPlayerId)} can buzz:`;
        if (round.lockedOutPlayerIds.length) return 'Steal it! Buzzers are open';
        return round.buzzEndsAt ? 'Buzzers are open:' : 'Buzzers are open!';
      case 'answering':
        return `${nameOf(round.buzzedPlayerId)} buzzed in`;
      case 'revealed': {
        const tb = this.tiebreaker();
        if (tb?.winnerId) return `${nameOf(tb.winnerId)} wins the tiebreaker!`;
        if (tb) return 'Nobody got it. Another question is coming.';
        return 'Answer';
      }
    }
  });
}
