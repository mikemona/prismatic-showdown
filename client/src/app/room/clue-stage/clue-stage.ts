import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ActiveClueView, BuzzWindowView, PlayerView, TiebreakerView } from '@shared/protocol';
import { ClueRenderer } from '../clue-types/clue-renderer';
import { TextClue } from '../clue-types/text-clue';
import { Confetti } from '../../shared/confetti/confetti';
import { Countdown } from '../countdown/countdown';

/** The question on screen: a board clue, or a tiebreaker. Pass exactly one. */
@Component({
  selector: 'app-clue-stage',
  imports: [ClueRenderer, TextClue, Countdown, Confetti],
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
  /** Who's looking: colors and messages are from this player's point of view. */
  readonly meId = input<string | null>(null);
  /** House rule: wrong answers lose the clue's value. */
  readonly negativeScoring = input(true);

  protected readonly pips = [1, 2, 3, 4, 5];

  protected readonly round = computed<BuzzWindowView>(() => (this.clue() ?? this.tiebreaker())!);
  protected readonly dailyDouble = computed(() => this.clue()?.dailyDouble ?? null);
  /** A Daily Double was found and the host hasn't revealed its clue yet. */
  protected readonly ddHidden = computed(() => {
    const dd = this.dailyDouble();
    return dd !== null && !dd.revealed;
  });
  protected readonly ddName = computed(() => this.players().find((p) => p.id === this.dailyDouble()?.playerId)?.name ?? 'Someone');
  /**
   * Panel color from the viewer's point of view: yellow while someone answers,
   * green if you got it right, red if you got it wrong, blue otherwise.
   */
  protected readonly tone = computed<'blue' | 'yellow' | 'green' | 'red'>(() => {
    const round = this.round();
    const me = this.meId();
    if (round.phase === 'answering') return 'yellow';
    if (me && round.correctPlayerId === me) return 'green';
    if (me && round.wrongPlayerIds.includes(me)) return 'red';
    // The host isn't a player, so they see green whenever someone got it.
    if (this.isHost() && round.correctPlayerId) return 'green';
    return 'blue';
  });

  /** Confetti, only on the screen of the player who got it right. */
  protected readonly celebrate = computed(() => {
    const me = this.meId();
    return !!me && this.round().correctPlayerId === me;
  });

  /** Points won or lost on this question, or null for a tiebreaker. */
  private readonly points = computed(() => {
    const clue = this.clue();
    if (!clue) return null;
    return clue.dailyDouble ? clue.dailyDouble.wager : clue.value;
  });

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
    if (this.tone() === 'red') return null;
    if (round.phase === 'reading') return round.buzzersOpenAt;
    if (round.phase === 'buzzing') return round.buzzEndsAt;
    return null;
  });

  protected readonly statusText = computed(() => {
    const round = this.round();
    const me = this.meId();
    const tb = this.tiebreaker();
    const dd = this.dailyDouble();
    const points = this.points();
    const nameOf = (id: string | null) => this.players().find((p) => p.id === id)?.name ?? 'Someone';
    // Daily Doubles always cost the wager; regular clues follow the house rule.
    const loss = points !== null && (dd || this.negativeScoring()) ? ` −${points}` : '';

    if (dd && round.phase === 'reading') {
      return dd.wager === null ? `${this.ddName()} is placing a wager…` : `${this.ddName()} wagered ${dd.wager}. Get ready…`;
    }
    if (round.phase === 'answering') {
      if (round.buzzedPlayerId === me) return "You're in! Say your answer out loud.";
      return dd ? `${this.ddName()} is answering for ${dd.wager}` : `${nameOf(round.buzzedPlayerId)} buzzed in`;
    }

    // Your own result comes first, so you never see "Steal it!" after a wrong answer.
    if (me && round.correctPlayerId === me) return tb ? 'You win the tiebreaker!' : `You got it! +${points}`;
    if (me && round.wrongPlayerIds.includes(me)) {
      return round.phase === 'revealed' ? `Not quite.${loss}` : `Not quite.${loss} You're out on this one.`;
    }
    if (round.correctPlayerId) {
      return tb ? `${nameOf(round.correctPlayerId)} wins the tiebreaker!` : `${nameOf(round.correctPlayerId)} got it! +${points}`;
    }

    switch (round.phase) {
      case 'reading':
        return 'Buzzers open in';
      case 'buzzing':
        if (round.priorityPlayerId === me) return 'Your pick! Buzz in:';
        if (round.priorityPlayerId) return `Only ${nameOf(round.priorityPlayerId)} can buzz:`;
        if (me && round.lockedOutPlayerIds.includes(me)) return "Time's up. You're out on this one.";
        if (round.lockedOutPlayerIds.length) return round.buzzEndsAt ? 'Steal it! Buzzers are open:' : 'Steal it! Buzzers are open';
        return round.buzzEndsAt ? 'Buzzers are open:' : 'Buzzers are open!';
      case 'revealed':
        if (tb) return 'Nobody got it. Another question is coming.';
        return round.wrongPlayerIds.length ? 'Nobody got it' : 'Answer';
    }
  });
}
