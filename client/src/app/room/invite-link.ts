import { DestroyRef, inject, signal, type Signal } from '@angular/core';
import { GameSocket } from '../core/game-socket';

const COPIED_RESET_MS = 2500;

export function inviteUrl(code: string): string {
  return `${location.origin}/room/${code}`;
}

export interface CopyInvite {
  /** True for a few seconds after a successful copy, so the button can confirm it. */
  copied: Signal<boolean>;
  copy(code: string): Promise<void>;
}

/** Copies the room's invite link; the calling button shows the confirmation. */
export function injectCopyInvite(): CopyInvite {
  const game = inject(GameSocket);
  const copied = signal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  inject(DestroyRef).onDestroy(() => clearTimeout(timer));

  return {
    copied: copied.asReadonly(),
    async copy(code) {
      try {
        await navigator.clipboard.writeText(inviteUrl(code));
        clearTimeout(timer);
        copied.set(true);
        timer = setTimeout(() => copied.set(false), COPIED_RESET_MS);
      } catch {
        // Clipboard blocked (e.g. plain http on another device): show the link instead.
        game.showToast(`Share this link: ${inviteUrl(code)}`);
      }
    },
  };
}
