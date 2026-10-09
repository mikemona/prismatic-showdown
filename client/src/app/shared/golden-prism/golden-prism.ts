import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Slices stacked front to back to give the logo its gold edge. */
const EDGE_LAYERS = 12;

/**
 * The Golden Prism: the champion's trophy. The Prismatic logo shape, given
 * depth by stacking layers in 3D, finished in gold, with a glint sweeping
 * across the face while it spins. Decorative only (aria-hidden).
 */
@Component({
  selector: 'app-golden-prism',
  templateUrl: './golden-prism.html',
  styleUrl: './golden-prism.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[style.--gp-size.px]': 'size()',
  },
})
export class GoldenPrism {
  /** Width in pixels; the height follows the logo's proportions. */
  readonly size = input(96);
  /** Show the soft glow under the trophy. */
  readonly glow = input(true);

  /** Depth offsets for each edge slice, as a fraction of the total thickness (-0.5 back … 0.5 front). */
  protected readonly layers = computed(() =>
    Array.from({ length: EDGE_LAYERS }, (_, i) => i / (EDGE_LAYERS - 1) - 0.5),
  );
}
