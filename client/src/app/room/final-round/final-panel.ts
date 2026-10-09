import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { RoomView } from '@shared/protocol';
import { GameSocket } from '../../core/game-socket';

const SAVE_DELAY_MS = 300;

/** Side panel for the final round: host controls, or the player's wager and answer. */
@Component({
  selector: 'app-final-panel',
  imports: [FormsModule],
  templateUrl: './final-panel.html',
  styleUrl: './final-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FinalPanel {
  protected readonly game = inject(GameSocket);
  readonly state = input.required<RoomView>();

  protected readonly final = computed(() => this.state().final!);
  protected readonly isHost = computed(() => this.state().you.role === 'host');
  protected readonly myEntry = computed(() => this.final().entries.find((e) => e.playerId === this.state().you.playerId) ?? null);
  protected readonly maxWager = computed(() => Math.max(0, this.game.me()?.score ?? 0));
  protected readonly wageredCount = computed(() => this.final().entries.filter((e) => e.wagered).length);
  protected readonly answeredCount = computed(() => this.final().entries.filter((e) => e.answered).length);

  /** Host: the entry being revealed right now. */
  protected readonly current = computed(() => {
    const final = this.final();
    const entry = final.entries.find((e) => e.playerId === final.currentPlayerId);
    return entry ? { entry, name: this.nameOf(entry.playerId) } : null;
  });

  /** Host, once judging is done: who's on top, and is it a tie? */
  protected readonly leaders = computed(() => {
    const players = this.state().players;
    if (!players.length) return [];
    const top = Math.max(...players.map((p) => p.score));
    return players.filter((p) => p.score === top);
  });

  protected readonly leaderNames = computed(() => this.leaders().map((p) => p.name).join(' and '));

  protected readonly wagerInput = signal<number | null>(null);
  protected readonly answerText = signal<string | null>(null);
  protected readonly saved = signal(true);
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.flushAnswer());
  }

  protected nameOf(id: string): string {
    return this.state().players.find((p) => p.id === id)?.name ?? 'Someone';
  }

  protected submitWager(): void {
    const amount = this.wagerInput() ?? 0;
    void this.game.wager(Math.floor(amount));
  }

  /** What's in the textarea: the local draft while typing, else what the server has. */
  protected currentAnswer(): string {
    return this.answerText() ?? this.myEntry()?.answer ?? '';
  }

  protected onAnswerInput(text: string): void {
    this.answerText.set(text);
    this.saved.set(false);
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flushAnswer(), SAVE_DELAY_MS);
  }

  private flushAnswer(): void {
    clearTimeout(this.saveTimer);
    const text = this.answerText();
    if (text === null || this.final().phase !== 'answer') return;
    void this.game.finalAnswer(text).then((ok) => this.saved.set(ok));
  }
}
