import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { FinalView, PlayerView } from '@shared/protocol';
import { Countdown } from '../countdown/countdown';

/** Main screen for the final round, the same for everyone. */
@Component({
  selector: 'app-final-stage',
  imports: [Countdown],
  templateUrl: './final-stage.html',
  styleUrl: './final-stage.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FinalStage {
  readonly final = input.required<FinalView>();
  readonly players = input.required<PlayerView[]>();

  protected readonly rows = computed(() =>
    this.final().entries.map((entry) => ({ entry, player: this.players().find((p) => p.id === entry.playerId) })),
  );
  protected readonly wageredCount = computed(() => this.final().entries.filter((e) => e.wagered).length);
  protected readonly answeredCount = computed(() => this.final().entries.filter((e) => e.answered).length);
}
