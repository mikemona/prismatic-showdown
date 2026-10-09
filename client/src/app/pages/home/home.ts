import { ChangeDetectionStrategy, Component, inject, isDevMode, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { GameSocket } from '../../core/game-socket';
import { RulesDialog } from '../../shared/rules-dialog/rules-dialog';

@Component({
  selector: 'app-home',
  imports: [FormsModule, RulesDialog],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  private readonly game = inject(GameSocket);
  private readonly router = inject(Router);

  /** Developer shortcuts show only in the dev build (ng serve), never in production. */
  protected readonly devTools = isDevMode();

  protected readonly hostName = signal('');
  protected readonly joinCode = signal('');
  protected readonly creating = signal(false);
  protected readonly createError = signal<string | null>(null);
  protected readonly joinError = signal<string | null>(null);

  protected async createRoom(): Promise<void> {
    if (this.creating()) return;
    this.creating.set(true);
    this.createError.set(null);
    try {
      const { code } = await this.game.create(this.hostName());
      await this.router.navigate(['/room', code]);
    } catch (err) {
      this.createError.set((err as Error).message);
    } finally {
      this.creating.set(false);
    }
  }

  /** Dev only: jump into a room with three clues left, to test the Daily Double, final round, and results. */
  protected async testEnding(): Promise<void> {
    if (this.creating()) return;
    this.creating.set(true);
    try {
      const { code } = await this.game.createEndingRoom(this.hostName().trim() || 'Mike');
      await this.router.navigate(['/room', code]);
    } catch (err) {
      this.game.showToast((err as Error).message);
    } finally {
      this.creating.set(false);
    }
  }

  protected joinRoom(): void {
    const code = this.joinCode().trim().toUpperCase();
    if (code.length !== 4) {
      this.joinError.set('Room codes are 4 characters.');
      return;
    }
    this.joinError.set(null);
    void this.router.navigate(['/room', code]);
  }
}
