import type { BoardDef, ClueDef, Difficulty } from '../../../shared/protocol.ts';
import type { ContentPool, QuestionDef } from './types.ts';

/** Categories on each game's board. */
export const BOARD_CATEGORIES = 5;
/** At most this many general UX categories per board; the rest are Prismatic. */
const MAX_GENERAL = 2;
/** The Daily Double only hides behind clues of at least this difficulty (the 300 clue and up). */
const DAILY_DOUBLE_MIN_DIFFICULTY = 3;
const DIFFICULTIES: Difficulty[] = [1, 2, 3, 4, 5];

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Picks one question for each difficulty. If a level has no questions, it
 * borrows the closest unused one so a thin category still fills its column.
 */
function pickColumn(questions: QuestionDef[]): QuestionDef[] {
  const used = new Set<QuestionDef>();
  return DIFFICULTIES.map((difficulty) => {
    const exact = shuffle(questions.filter((q) => q.difficulty === difficulty && !used.has(q)));
    const fallback = questions
      .filter((q) => !used.has(q))
      .sort((a, b) => Math.abs(a.difficulty - difficulty) - Math.abs(b.difficulty - difficulty));
    const chosen = exact[0] ?? fallback[0];
    used.add(chosen);
    return chosen;
  });
}

/** A fresh board for one game: random categories, random questions, a random final. */
export function buildBoard(pool: ContentPool): BoardDef {
  const playable = shuffle(pool.categories.filter((c) => c.questions.length >= DIFFICULTIES.length));
  const general = playable.filter((c) => c.group === 'general').slice(0, MAX_GENERAL);
  const prismatic = playable.filter((c) => c.group === 'prismatic');
  const categories = shuffle([...general, ...prismatic]).slice(0, BOARD_CATEGORIES);
  const board: BoardDef = {
    title: pool.title,
    categories: categories.map((category) => ({
      id: category.id,
      title: category.title,
      description: category.description,
      type: category.type,
      clues: pickColumn(category.questions).map(
        (question, i): ClueDef => ({
          id: `${category.id}-${i + 1}`,
          value: (i + 1) * 100,
          // The column's slot sets the difficulty shown, even when a question was borrowed from another level.
          difficulty: DIFFICULTIES[i],
          prompt: question.prompt,
          answer: question.answer,
          media: question.media,
          timeLimitSec: question.timeLimitSec,
        }),
      ),
    })),
    final: shuffle(pool.finals)[0],
    tiebreakers: shuffle(pool.tiebreakers),
  };
  placeDailyDouble(board, categories);
  return board;
}

/** Hides one Daily Double behind a random 300+ clue that has a harder question written for it. */
function placeDailyDouble(board: BoardDef, sources: ContentPool['categories']): void {
  const options = board.categories.flatMap((category, i) =>
    category.clues
      .filter((clue) => clue.difficulty >= DAILY_DOUBLE_MIN_DIFFICULTY)
      .map((clue) => ({ clue, questions: sources[i].dailyDoubles.filter((q) => q.difficulty === clue.difficulty) }))
      .filter((option) => option.questions.length > 0),
  );
  const chosen = shuffle(options)[0];
  if (!chosen) return;
  const question = shuffle(chosen.questions)[0];
  chosen.clue.dailyDouble = { prompt: question.prompt, answer: question.answer };
}
