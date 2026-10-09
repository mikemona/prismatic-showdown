import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, signal } from '@angular/core';
import type { RoomView } from '@shared/protocol';
import { GameSocket } from '../../core/game-socket';
import { GoldenPrism } from '../../shared/golden-prism/golden-prism';

/**
 * How long each of the final hops lasts, in ms: the highlight flickers at a
 * steady fast pace, then brakes over these last few hops before it lands.
 */
const SLOWDOWN_HOPS_MS = [90, 130, 190, 270, 380, 520, 700];

/** When each step of the sequence lights up, relative to the spin start. */
function stepTimes(steps: number, durationMs: number): number[] {
  const slow = SLOWDOWN_HOPS_MS.slice(-Math.max(0, steps - 1));
  const fastHops = steps - 1 - slow.length;
  const slowTotal = slow.reduce((sum, ms) => sum + ms, 0);
  const fastMs = fastHops > 0 ? Math.max(0, durationMs - slowTotal) / fastHops : 0;
  const times = [0];
  for (let i = 0; i < steps - 1; i++) times.push(times[i] + (i < fastHops ? fastMs : slow[i - fastHops]));
  return times;
}

/** "Who picks first?" A highlight hops between players, slowing until it lands. */
@Component({
  selector: 'app-intro-picker',
  imports: [GoldenPrism],
  templateUrl: './intro-picker.html',
  styleUrl: './intro-picker.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IntroPicker {
  protected readonly game = inject(GameSocket);
  readonly state = input.required<RoomView>();

  private readonly now = signal(this.game.serverTime());

  protected readonly intro = computed(() => this.state().intro!);
  protected readonly isHost = computed(() => this.state().you.role === 'host');
  protected readonly spinning = computed(() => {
    const spin = this.intro().spin;
    return !!spin && !this.intro().firstPlayerId && this.now() < spin.startedAt + spin.durationMs;
  });

  private readonly times = computed(() => {
    const spin = this.intro().spin;
    return spin ? stepTimes(spin.sequence.length, spin.durationMs) : [];
  });

  /**
   * Everyone computes the highlight from the same server start time, so every
   * screen shows the same player at the same moment.
   */
  protected readonly highlightedId = computed(() => {
    const intro = this.intro();
    if (intro.firstPlayerId) return intro.firstPlayerId;
    const spin = intro.spin;
    if (!spin) return null;
    const elapsed = this.now() - spin.startedAt;
    const times = this.times();
    let step = 0;
    while (step + 1 < times.length && times[step + 1] <= elapsed) step++;
    return spin.sequence[step];
  });

  protected readonly firstName = computed(
    () => this.state().players.find((p) => p.id === this.intro().firstPlayerId)?.name ?? null,
  );

  constructor() {
    const id = setInterval(() => this.now.set(this.game.serverTime()), 16);
    inject(DestroyRef).onDestroy(() => clearInterval(id));
  }
}
