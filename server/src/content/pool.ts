import { accessibility, designHistoryAndType, lawsOfUx } from './categories/general.ts';
import { byTheNumbers, patternsAndPlacement, rulesOfStyle } from './categories/prismatic-details.ts';
import {
  componentConfidential,
  governanceCourt,
  gridsAndTables,
  sayItRight,
  layoutLab,
} from './categories/prismatic-system.ts';
import type { ContentPool } from './types.ts';

/**
 * Everything the game can ask. Each game draws 5 categories and one question
 * per value from here (see build-board.ts). To add a category, write it in
 * categories/ and list it below.
 */
export const contentPool: ContentPool = {
  title: 'Prismatic Showdown',
  categories: [
    // Prismatic
    governanceCourt,
    byTheNumbers,
    layoutLab,
    componentConfidential,
    sayItRight,
    rulesOfStyle,
    patternsAndPlacement,
    gridsAndTables,
    // General UX and design
    lawsOfUx,
    accessibility,
    designHistoryAndType,
  ],

  // One is drawn per game.
  finals: [
    { category: 'Typography', prompt: 'The base h1 font size and line height, in pixels.', answer: '32px and 48px' },
    { category: 'Toasts', prompt: 'How long a toast stays on screen by default before closing itself.', answer: '5 seconds' },
    { category: 'Forms', prompt: 'The font size of base form labels, in pixels.', answer: '12px' },
    { category: 'Theme Builder', prompt: 'The number of colors in the Theme Builder data visualization palette.', answer: '21' },
    {
      category: 'Footer Bar',
      prompt: 'The most navigation buttons a Footer Bar can include, and what they say.',
      answer: 'Two: Next and Back',
    },
    { category: 'Modals', prompt: 'Name all five modal sizes.', answer: 'Message, Default, Form, Grid, and Full' },
  ],

  // Harder than the board. Shuffled per game; asked in order, looping if a tie survives them all.
  tiebreakers: [
    { prompt: 'The max height of a base textarea, in pixels.', answer: '100px' },
    { prompt: 'The font weight of links.', answer: '600' },
    { prompt: 'The number of icons in the prism_custom icon font.', answer: '244' },
    { prompt: 'The largest offset the Date Offset picker allows, in days.', answer: '365' },
    { prompt: 'The year the Bauhaus closed.', answer: '1933' },
    { prompt: 'The year the original Macintosh launched.', answer: '1984' },
    { prompt: 'She designed the Nike Swoosh in 1971.', answer: 'Carolyn Davidson' },
    { prompt: 'He designed the FedEx logo with the hidden arrow.', answer: 'Lindon Leader' },
    { prompt: 'The golden ratio, to three decimal places.', answer: '1.618' },
  ],
};
