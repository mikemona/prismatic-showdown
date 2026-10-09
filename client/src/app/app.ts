import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { GameSocket } from './core/game-socket';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <router-outlet />
    <div class="toast" role="status" aria-live="polite">
      @if (game.toast(); as message) {
        <p class="toast__message">{{ message }}</p>
      }
    </div>
  `,
  styles: `
    .toast {
      position: fixed;
      inset: auto 16px 24px;
      display: flex;
      justify-content: center;
      pointer-events: none;
      z-index: 100;

      &__message {
        margin: 0;
        padding: 12px 18px;
        border: 1px solid var(--pp-border);
        border-radius: var(--pp-radius-sm);
        background: var(--pp-surface-raised);
        box-shadow: var(--pp-shadow);
        font-weight: 600;
      }
    }
  `,
})
export class App {
  protected readonly game = inject(GameSocket);
}
