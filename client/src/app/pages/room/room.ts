import { ChangeDetectionStrategy, Component, computed, effect, inject, input, type OnDestroy, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { GameSocket } from '../../core/game-socket';
import { sessionStore } from '../../core/session-store';
import { Board } from '../../room/board/board';
import { Buzzer } from '../../room/buzzer/buzzer';
import { ClueStage } from '../../room/clue-stage/clue-stage';
import { FinalResults } from '../../room/final-results/final-results';
import { DailyDoubleWager } from '../../room/daily-double-wager/daily-double-wager';
import { FinalPanel } from '../../room/final-round/final-panel';
import { FinalStage } from '../../room/final-round/final-stage';
import { HostControls } from '../../room/host-controls/host-controls';
import { IntroPicker } from '../../room/intro-picker/intro-picker';
import { Lobby } from '../../room/lobby/lobby';
import { RoomHeader } from '../../room/room-header/room-header';
import { Scoreboard } from '../../room/scoreboard/scoreboard';

type Status = 'loading' | 'name' | 'missing' | 'in-room';

@Component({
  selector: 'app-room-page',
  imports: [FormsModule, RouterLink, RoomHeader, Lobby, Board, ClueStage, Buzzer, HostControls, Scoreboard, FinalResults, IntroPicker, FinalStage, FinalPanel, DailyDoubleWager],
  templateUrl: './room.html',
  styleUrl: './room.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomPage implements OnDestroy {
  protected readonly game = inject(GameSocket);
  private readonly router = inject(Router);

  /** Route param, bound by withComponentInputBinding. */
  readonly code = input.required<string>();
  /** `?fresh=1`: ignore any seat saved in this browser and join as a new player (testing from one machine). */
  readonly fresh = input<string>();

  protected readonly status = signal<Status>('loading');
  protected readonly hostName = signal('');
  protected readonly playerName = signal('');
  protected readonly joining = signal(false);
  protected readonly joinError = signal<string | null>(null);

  protected readonly roomCode = computed(() => this.code().toUpperCase());
  protected readonly state = this.game.state;

  constructor() {
    effect(() => {
      const code = this.roomCode();
      untracked(() => void this.enter(code));
    });
  }

  ngOnDestroy(): void {
    this.game.leave();
  }

  protected nameOf(id: string): string {
    return this.state()?.players.find((p) => p.id === id)?.name ?? 'the picker';
  }

  protected async join(): Promise<void> {
    if (this.joining()) return;
    this.joining.set(true);
    this.joinError.set(null);
    try {
      await this.game.join(this.roomCode(), this.playerName());
      this.status.set('in-room');
      // Drop ?fresh so refreshing this tab resumes the seat instead of asking for a name again.
      if (this.fresh()) void this.router.navigate(['/room', this.roomCode()], { replaceUrl: true });
    } catch (err) {
      this.joinError.set((err as Error).message);
    } finally {
      this.joining.set(false);
    }
  }

  /** Reclaim a stored seat if we have one, otherwise ask for a name. */
  private async enter(code: string): Promise<void> {
    this.status.set('loading');
    if (!this.fresh()) {
      // A failed resume forgets that seat, so the next try picks up any other saved seat.
      for (let attempt = 0; attempt < 3; attempt++) {
        const saved = sessionStore.get(code);
        if (!saved) break;
        try {
          await this.game.resume(code, saved.sessionId);
          this.status.set('in-room');
          return;
        } catch {
          // Seat is gone; try the next saved one, or fall through to joining fresh.
        }
      }
    }
    try {
      const { hostName } = await this.game.peek(code);
      this.hostName.set(hostName);
      this.status.set('name');
    } catch {
      this.status.set('missing');
    }
  }
}
