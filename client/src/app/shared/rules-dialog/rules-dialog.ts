import { ChangeDetectionStrategy, Component, type ElementRef, viewChild } from '@angular/core';

/**
 * "How to play" modal. Uses the native <dialog>, so focus is trapped, Esc
 * closes it, and the page behind is inert. Call open() to show it.
 *
 * The numbers here mirror the server's rules (server/src/room.ts and
 * content/build-board.ts); update both if a rule changes.
 */
@Component({
  selector: 'app-rules-dialog',
  templateUrl: './rules-dialog.html',
  styleUrl: './rules-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RulesDialog {
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  open(): void {
    this.dialog().nativeElement.showModal();
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  /** Clicking the dimmed backdrop (the dialog element itself, outside the panel) closes it. */
  protected onDialogClick(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }
}
