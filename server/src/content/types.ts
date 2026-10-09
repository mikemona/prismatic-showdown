import type { ClueMedia, ClueType, Difficulty, FinalDef, TiebreakerDef } from '../../../shared/protocol.ts';

/**
 * Authoring types for the question pool. Each game draws its board from here
 * (see build-board.ts), so a category can hold many more questions than a
 * board shows.
 */

export interface QuestionDef {
  /** 1 = 100-point clue … 5 = 500-point clue. */
  difficulty: Difficulty;
  prompt: string;
  answer: string;
  media?: ClueMedia;
  timeLimitSec?: number;
}

export interface CategoryPoolDef {
  id: string;
  title: string;
  /** One-liner shown to players explaining how this category plays. */
  description: string;
  type: ClueType;
  /** Boards are mostly Prismatic; general UX categories are capped (see build-board.ts). */
  group: 'prismatic' | 'general';
  questions: QuestionDef[];
  /**
   * Harder questions for when the Daily Double lands in this category.
   * `difficulty` is the slot they replace (3 = the 300 clue, 4 = 400, 5 = 500).
   */
  dailyDoubles: QuestionDef[];
}

export interface ContentPool {
  title: string;
  categories: CategoryPoolDef[];
  finals: FinalDef[];
  tiebreakers: TiebreakerDef[];
}

/** Shorthand for writing questions: q(3, 'Prompt…', 'Answer'). */
export const q = (difficulty: Difficulty, prompt: string, answer: string): QuestionDef => ({ difficulty, prompt, answer });
