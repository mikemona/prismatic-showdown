/**
 * Shared contract between the Prismatic Showdown server and client.
 * Type-only: the server runs this file through Node's type stripping and the
 * client compiles it with Angular, so keep it free of runtime code
 * (no enums, no values).
 */

// ---------------------------------------------------------------------------
// Board content (authored on the server, see server/src/content/)
// ---------------------------------------------------------------------------

/**
 * Each category declares the kind of challenge its clues are. The client maps
 * every type to a renderer; add a new type here, give it a renderer, and any
 * category can use it.
 */
export type ClueType = 'text';

export type Difficulty = 1 | 2 | 3 | 4 | 5;

export interface ClueMedia {
  kind: 'image';
  src: string;
  alt: string;
}

export interface ClueDef {
  id: string;
  value: number;
  difficulty: Difficulty;
  prompt: string;
  answer: string;
  media?: ClueMedia;
  /** Optional countdown the host can start once the clue is on screen. */
  timeLimitSec?: number;
  /** Set on the one clue hiding the Daily Double: a harder question, played instead of this one. */
  dailyDouble?: { prompt: string; answer: string };
}

export interface CategoryDef {
  id: string;
  title: string;
  /** One-liner shown to players explaining how this category plays. */
  description: string;
  type: ClueType;
  clues: ClueDef[];
}

/** The final round: players wager on the category, then type an answer. */
export interface FinalDef {
  category: string;
  prompt: string;
  answer: string;
}

/** Harder buzz-in questions used to break a tie for first place. */
export interface TiebreakerDef {
  prompt: string;
  answer: string;
}

export interface BoardDef {
  title: string;
  categories: CategoryDef[];
  final: FinalDef;
  tiebreakers: TiebreakerDef[];
}

// ---------------------------------------------------------------------------
// Room state as seen by a client
// ---------------------------------------------------------------------------

export type Role = 'host' | 'player';

/** lobby -> intro -> board <-> clue -> final -> (tiebreaker) -> ended */
export type GamePhase = 'lobby' | 'intro' | 'board' | 'clue' | 'final' | 'tiebreaker' | 'ended';

/**
 * reading:   question is on screen, buzzers are locked
 * buzzing:   buzzers are open (maybe only for the priority player)
 * answering: a player has buzzed in and the host is judging
 * revealed:  answer is shown to everyone
 */
export type CluePhase = 'reading' | 'buzzing' | 'answering' | 'revealed';

/** Spectrum color assigned to each player for their avatar. */
export type PlayerColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'violet';

export interface PlayerView {
  id: string;
  name: string;
  score: number;
  color: PlayerColor;
  connected: boolean;
  /** Test player added by the host. */
  isBot: boolean;
}

export interface BoardClueView {
  id: string;
  value: number;
  difficulty: Difficulty;
  used: boolean;
}

export interface BoardCategoryView {
  id: string;
  title: string;
  description: string;
  type: ClueType;
  clues: BoardClueView[];
}

/** Buzzer state shared by board clues and tiebreakers. All times are server epoch ms. */
export interface BuzzWindowView {
  phase: CluePhase;
  buzzedPlayerId: string | null;
  /** Players who already answered wrong (or ran out their head start) on this question. */
  lockedOutPlayerIds: string[];
  /** Who may buzz at all; null means every player. */
  eligiblePlayerIds: string[] | null;
  /** When buzzers open automatically, while the question is being read. */
  buzzersOpenAt: number | null;
  /** While set, only this player may buzz: the picker's head start. */
  priorityPlayerId: string | null;
  /** When the current buzz window closes (head start, or tiebreaker window). */
  buzzEndsAt: number | null;
  /** Who answered correctly, once someone has. */
  correctPlayerId: string | null;
  /** Who answered wrong (unlike lockedOutPlayerIds, this excludes a picker whose head start ran out). */
  wrongPlayerIds: string[];
}

export interface ActiveClueView extends BuzzWindowView {
  id: string;
  categoryId: string;
  categoryTitle: string;
  type: ClueType;
  value: number;
  difficulty: Difficulty;
  prompt: string;
  media?: ClueMedia;
  timeLimitSec?: number;
  /** Only sent to the host, or to everyone once the clue is revealed. */
  answer?: string;
  /** When the host's optional countdown ends, if one is running. */
  timerEndsAt: number | null;
  /**
   * Set when this clue is the Daily Double: a harder question answered only by
   * the picker, for a wager they choose before the host reveals it. Players see
   * an empty `prompt` until the host reveals it; the host always sees it.
   */
  dailyDouble: { playerId: string; wager: number | null; minWager: number; maxWager: number; revealed: boolean } | null;
}

/** Choosing who picks first, before the board appears. */
export interface IntroView {
  /** The highlight animation everyone watches; null until the host spins. */
  spin: { startedAt: number; durationMs: number; sequence: string[] } | null;
  /** Set once the spin lands (or straight away for a returning champion). */
  firstPlayerId: string | null;
  /** True when first pick went to last game's champion. */
  champion: boolean;
}

/**
 * wager:   category is shown, players lock in a wager
 * answer:  question is shown, players type answers against the clock
 * judging: host reveals and judges each answer in turn
 * done:    every answer judged; host moves on to results (or a tiebreaker)
 */
export type FinalPhase = 'wager' | 'answer' | 'judging' | 'done';

export interface FinalEntryView {
  playerId: string;
  wagered: boolean;
  answered: boolean;
  /** Visible to the host and the player; to everyone once judged. */
  wager: number | null;
  /** Visible to the host and the player; to everyone once revealed. */
  answer: string | null;
  revealed: boolean;
  correct: boolean | null;
}

export interface FinalView {
  category: string;
  phase: FinalPhase;
  /** Hidden until the wagers are in. */
  prompt: string | null;
  /** Host always; everyone else once every answer is judged. */
  answer: string | null;
  answerEndsAt: number | null;
  /** In reveal order (lowest score first) once judging starts. */
  entries: FinalEntryView[];
  /** Whose answer the host is on during judging. */
  currentPlayerId: string | null;
}

export interface TiebreakerView extends BuzzWindowView {
  /** 1 for the first tiebreaker question, 2 for the next, and so on. */
  number: number;
  prompt: string;
  /** Host always; everyone once revealed. */
  answer: string | null;
  winnerId: string | null;
}

export interface RoomSettings {
  /** Wrong answers subtract the clue value, like the TV show. */
  negativeScoring: boolean;
  /** The player in control may pick the next clue from their own screen. */
  playersPickClues: boolean;
}

export interface RoomView {
  code: string;
  boardTitle: string;
  hostName: string;
  hostConnected: boolean;
  phase: GamePhase;
  settings: RoomSettings;
  players: PlayerView[];
  categories: BoardCategoryView[];
  activeClue: ActiveClueView | null;
  intro: IntroView | null;
  final: FinalView | null;
  tiebreaker: TiebreakerView | null;
  /** Winner of the finished game. */
  championId: string | null;
  /** Player who picks the next clue (last correct answer). */
  controlPlayerId: string | null;
  /** Server clock when this view was sent, so clients can correct countdowns for clock drift. */
  serverNow: number;
  /** Who this view was built for. */
  you: { role: Role; playerId: string | null };
}

// ---------------------------------------------------------------------------
// Socket events
// ---------------------------------------------------------------------------

export type Ack<T = object> = (res: ({ ok: true } & T) | { ok: false; error: string }) => void;

export interface SessionInfo {
  code: string;
  sessionId: string;
  role: Role;
}

export interface ClientToServerEvents {
  'room:create': (req: { hostName: string }, ack: Ack<SessionInfo>) => void;
  'room:join': (req: { code: string; name: string }, ack: Ack<SessionInfo>) => void;
  /** Re-attach a socket to an existing seat after a refresh or dropped connection. */
  'room:resume': (req: { code: string; sessionId: string }, ack: Ack<SessionInfo>) => void;
  /** Check that a room exists before showing the name form. */
  'room:peek': (req: { code: string }, ack: Ack<{ hostName: string; phase: GamePhase }>) => void;
  'room:leave': () => void;

  'host:start': (ack: Ack) => void;
  'host:spin': (ack: Ack) => void;
  'host:beginBoard': (ack: Ack) => void;
  'host:selectClue': (req: { clueId: string }, ack: Ack) => void;
  'host:openBuzzers': (ack: Ack) => void;
  'host:startTimer': (ack: Ack) => void;
  'host:judge': (req: { correct: boolean }, ack: Ack) => void;
  'host:reveal': (ack: Ack) => void;
  'host:closeClue': (ack: Ack) => void;
  /** Show the Daily Double clue to players; the picker then answers. */
  'host:revealDailyDouble': (ack: Ack) => void;
  'host:finalShowQuestion': (ack: Ack) => void;
  'host:finalLock': (ack: Ack) => void;
  'host:finalReveal': (ack: Ack) => void;
  'host:finalJudge': (req: { correct: boolean }, ack: Ack) => void;
  'host:finalFinish': (ack: Ack) => void;
  'host:tiebreakerNext': (ack: Ack) => void;
  'host:adjustScore': (req: { playerId: string; delta: number }, ack: Ack) => void;
  'host:setControl': (req: { playerId: string | null }, ack: Ack) => void;
  'host:kick': (req: { playerId: string }, ack: Ack) => void;
  'host:addBots': (req: { count: number }, ack: Ack) => void;
  'host:removeBots': (ack: Ack) => void;
  /**
   * Developer shortcut: a new room already near the end of the game. Only
   * works when the server runs with --dev-tools (npm run dev).
   */
  'dev:createEndingRoom': (req: { hostName: string }, ack: Ack<SessionInfo>) => void;
  'host:updateSettings': (req: Partial<RoomSettings>, ack: Ack) => void;
  'host:end': (ack: Ack) => void;
  'host:reset': (ack: Ack) => void;

  'player:selectClue': (req: { clueId: string }, ack: Ack) => void;
  /** Buzz in on a board clue or a tiebreaker. */
  'player:buzz': (ack: Ack) => void;
  /** Wager on your Daily Double, or in the final round. */
  'player:wager': (req: { amount: number }, ack: Ack) => void;
  'player:finalAnswer': (req: { text: string }, ack: Ack) => void;
}

export interface ServerToClientEvents {
  'room:state': (state: RoomView) => void;
  /** The room was removed or you were kicked. */
  'room:closed': (reason: string) => void;
}
