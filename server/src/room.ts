import { randomUUID } from 'node:crypto';
import type {
  ActiveClueView,
  BoardDef,
  BuzzWindowView,
  CategoryDef,
  ClueDef,
  CluePhase,
  FinalPhase,
  FinalView,
  GamePhase,
  IntroView,
  PlayerColor,
  Role,
  RoomSettings,
  RoomView,
  TiebreakerDef,
  TiebreakerView,
} from '../../shared/protocol.ts';
import { buildBoard } from './content/build-board.ts';
import type { ContentPool } from './content/types.ts';

/** Thrown for any rule violation; the message is shown to the user. */
export class GameError extends Error {}

export interface Player {
  id: string;
  sessionId: string;
  name: string;
  score: number;
  color: PlayerColor;
  socketId: string | null;
  /** Test player added by the host; always "connected" and plays on its own. */
  isBot: boolean;
}

export type Seat = { role: 'host' } | { role: 'player'; player: Player };

/** One question's buzzer state; used by board clues and tiebreakers. */
interface BuzzRound {
  phase: CluePhase;
  buzzedPlayerId: string | null;
  lockedOut: Set<string>;
  /** null = every player may buzz. */
  eligible: Set<string> | null;
  buzzersOpenAt: number | null;
  priorityPlayerId: string | null;
  buzzEndsAt: number | null;
}

interface ActiveClue {
  clue: ClueDef;
  category: CategoryDef;
  /** What's actually asked: the clue, or its harder Daily Double question. */
  prompt: string;
  answer: string;
  /** Points at stake for a normal clue (the Daily Double plays for its wager instead). */
  value: number;
  round: BuzzRound;
  timerEndsAt: number | null;
  dailyDouble: { playerId: string; wager: number | null; revealed: boolean } | null;
}

interface Intro {
  spin: { startedAt: number; durationMs: number; sequence: string[] } | null;
  firstPlayerId: string | null;
  champion: boolean;
}

interface FinalEntry {
  wager: number | null;
  answer: string;
  revealed: boolean;
  correct: boolean | null;
}

interface Final {
  phase: FinalPhase;
  entries: Map<string, FinalEntry>;
  /** Reveal order, fixed when judging starts. */
  order: string[];
  index: number;
  answerEndsAt: number | null;
}

interface Tiebreaker {
  number: number;
  def: TiebreakerDef;
  round: BuzzRound;
  winnerId: string | null;
}

const MAX_PLAYERS = 24;
const MAX_NAME_LENGTH = 24;
const MAX_FINAL_ANSWER_LENGTH = 200;
const DEFAULT_TIMER_SEC = 30;
/**
 * Buzzers open after roughly the time it takes the host to read the question
 * aloud: a base plus ~300ms per word, kept between 2 and 7 seconds.
 */
const READ_BASE_MS = 1000;
const READ_PER_WORD_MS = 300;
const READ_MIN_MS = 2000;
const READ_MAX_MS = 7000;

export function readTimeMs(prompt: string): number {
  const words = prompt.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(READ_MAX_MS, Math.max(READ_MIN_MS, READ_BASE_MS + words * READ_PER_WORD_MS));
}
/** The player who picked the clue gets this long to buzz before anyone else can. */
const PRIORITY_MS = 6000;
const FINAL_ANSWER_MS = 30_000;
/** How long tied players get to buzz on each tiebreaker question. */
const TIEBREAKER_WINDOW_MS = 15_000;
const SPIN_MS = 5000;
/** Daily Double wagers: at least this much… */
const DAILY_DOUBLE_MIN_WAGER = 5;
/** …and up to the player's score, or this much if their score is lower (the TV show's first-round rule). */
const DAILY_DOUBLE_MAX_FLOOR = 1000;
/** Enough hops for a fast flicker (~60ms each) before the slowdown at the end. */
const SPIN_STEPS = 52;

const PLAYER_COLORS: PlayerColor[] = ['red', 'orange', 'yellow', 'green', 'blue', 'violet'];
const BOT_NAMES = [
  'Pixel Pete', 'Kerning Kate', 'Gradient Greg', 'Hex Hannah', 'Bezier Bea',
  'Grid Gus', 'Swatch Sam', 'Vector Vic', 'Padding Pat', 'Opacity Olive',
];
const BOT_WRONG_ANSWERS = ['No idea!', 'Comic Sans?', 'Lorem ipsum', 'Something with gradients'];

export function cleanName(raw: unknown): string {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
  if (!name) throw new GameError('Please enter a name.');
  return name;
}

const pick = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)];
const between = (min: number, max: number) => min + Math.random() * (max - min);

/**
 * One game room. Holds all state, enforces the rules and runs its own timers;
 * the socket layer routes events here and broadcasts through `onChange`.
 */
export class Room {
  readonly code: string;
  /** This game's board, drawn fresh from the pool for every game. */
  board: BoardDef;
  private readonly pool: ContentPool;
  readonly hostSessionId = randomUUID();
  hostName: string;
  hostSocketId: string | null = null;

  phase: GamePhase = 'lobby';
  settings: RoomSettings = { negativeScoring: true, playersPickClues: true };
  readonly players = new Map<string, Player>();
  private readonly usedClueIds = new Set<string>();
  private active: ActiveClue | null = null;
  private intro: Intro | null = null;
  private final: Final | null = null;
  private tiebreaker: Tiebreaker | null = null;
  private championId: string | null = null;
  /** Survives "play again" so the champion picks first next game. */
  private lastChampionId: string | null = null;
  controlPlayerId: string | null = null;
  lastActivity = Date.now();

  private readonly onChange: (room: Room) => void;
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private botKey: string | null = null;

  constructor(code: string, hostName: string, pool: ContentPool, onChange: (room: Room) => void) {
    this.code = code;
    this.hostName = hostName;
    this.pool = pool;
    this.board = buildBoard(pool);
    this.onChange = onChange;
  }

  /** Call after any action has been applied (and broadcast) so test players can react. */
  afterAction(): void {
    this.runBots();
  }

  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  // --- seats --------------------------------------------------------------

  addPlayer(rawName: string, isBot = false): Player {
    const name = cleanName(rawName);
    if (this.players.size >= MAX_PLAYERS) throw new GameError('This room is full.');
    const taken = [...this.players.values()].some((p) => p.name.toLowerCase() === name.toLowerCase());
    if (taken || name.toLowerCase() === this.hostName.toLowerCase()) {
      throw new GameError('Someone in this room already has that name.');
    }
    const player: Player = {
      id: randomUUID(),
      sessionId: randomUUID(),
      name,
      score: 0,
      color: this.pickColor(),
      socketId: null,
      isBot,
    };
    this.players.set(player.id, player);
    return player;
  }

  /** Adds up to `count` test players with unused names. */
  addBots(count: number): void {
    const taken = new Set([...this.players.values()].map((p) => p.name));
    const names = BOT_NAMES.filter((n) => !taken.has(n)).slice(0, Math.max(0, Math.min(count, 10)));
    if (!names.length) throw new GameError('No more test players available.');
    for (const name of names) this.addPlayer(name, true);
  }

  removeBots(): void {
    for (const player of [...this.players.values()]) {
      if (player.isBot) this.removePlayer(player.id);
    }
  }

  /**
   * Developer shortcut: skips straight to a board with only `cluesLeft` clues
   * remaining (always including the Daily Double), three test players with
   * scores, and the first one in control.
   */
  devJumpToEnding(cluesLeft = 3): void {
    this.requirePhase('lobby');
    if (!this.players.size) this.addBots(3);
    for (const player of this.players.values()) player.score = (2 + Math.floor(Math.random() * 18)) * 100;

    const clues = this.board.categories.flatMap((c) => c.clues);
    const dailyDouble = clues.find((c) => c.dailyDouble);
    const others = clues.filter((c) => c !== dailyDouble).sort(() => Math.random() - 0.5);
    const keep = new Set([...(dailyDouble ? [dailyDouble] : []), ...others].slice(0, cluesLeft).map((c) => c.id));
    for (const clue of clues) if (!keep.has(clue.id)) this.usedClueIds.add(clue.id);

    this.intro = null;
    this.controlPlayerId = [...this.players.keys()][0];
    this.phase = 'board';
  }

  findSeat(sessionId: string): Seat | null {
    if (sessionId === this.hostSessionId) return { role: 'host' };
    for (const player of this.players.values()) {
      if (player.sessionId === sessionId) return { role: 'player', player };
    }
    return null;
  }

  removePlayer(playerId: string): Player {
    const player = this.requirePlayer(playerId);
    this.players.delete(playerId);
    if (this.controlPlayerId === playerId) this.controlPlayerId = null;
    if (this.intro?.firstPlayerId === playerId) {
      this.intro.firstPlayerId = null;
      this.intro.spin = null;
      this.intro.champion = false;
    }
    if (this.active?.dailyDouble?.playerId === playerId) {
      this.active.dailyDouble = null;
      this.closeRound(this.active.round);
    }
    for (const round of [this.active?.round, this.tiebreaker?.round]) {
      if (!round) continue;
      round.lockedOut.delete(playerId);
      round.eligible?.delete(playerId);
      if (round.priorityPlayerId === playerId) this.endPriority(round);
      if (round.buzzedPlayerId === playerId) {
        round.buzzedPlayerId = null;
        round.phase = 'buzzing';
      }
    }
    if (this.final) {
      this.final.entries.delete(playerId);
      const at = this.final.order.indexOf(playerId);
      if (at !== -1) {
        this.final.order.splice(at, 1);
        if (at < this.final.index) this.final.index--;
        if (this.final.phase === 'judging' && this.final.index >= this.final.order.length) this.final.phase = 'done';
      }
    }
    return player;
  }

  hasConnectedSockets(): boolean {
    return this.hostSocketId !== null || [...this.players.values()].some((p) => p.socketId !== null);
  }

  /** Random color, preferring ones nobody in the room has yet. */
  private pickColor(): PlayerColor {
    const counts = new Map(PLAYER_COLORS.map((c) => [c, 0]));
    for (const p of this.players.values()) counts.set(p.color, (counts.get(p.color) ?? 0) + 1);
    const fewest = Math.min(...counts.values());
    return pick(PLAYER_COLORS.filter((c) => counts.get(c) === fewest));
  }

  // --- intro: who picks first -----------------------------------------------

  start(): void {
    this.requirePhase('lobby');
    if (this.players.size === 0) throw new GameError('Wait for at least one player to join.');
    const champion = this.lastChampionId && this.players.has(this.lastChampionId) ? this.lastChampionId : null;
    this.intro = { spin: null, firstPlayerId: champion, champion: champion !== null };
    this.phase = 'intro';
  }

  /** Starts the highlight animation; it lands on a random player after SPIN_MS. */
  spin(): void {
    this.requirePhase('intro');
    const intro = this.intro!;
    if (intro.firstPlayerId || intro.spin) throw new GameError('First pick is already being chosen.');
    const ids = [...this.players.keys()];
    if (!ids.length) throw new GameError('There are no players to pick from.');

    const winner = pick(ids);
    // Built backwards from the winner so every step differs from the one after it.
    // With 3+ players a name also can't come back within 3 steps, so even if a
    // frame drops and a step is skipped on screen, nobody looks lit twice in a row.
    const sequence: string[] = [winner];
    const gap = ids.length >= 3 ? 2 : 1;
    while (sequence.length < SPIN_STEPS && ids.length > 1) {
      const recent = sequence.slice(0, gap);
      sequence.unshift(pick(ids.filter((id) => !recent.includes(id))));
    }

    const spin = { startedAt: Date.now(), durationMs: SPIN_MS, sequence };
    intro.spin = spin;
    this.setTimer('spin', SPIN_MS, () => {
      if (this.intro?.spin === spin && this.players.has(winner)) this.intro.firstPlayerId = winner;
    });
  }

  beginBoard(): void {
    this.requirePhase('intro');
    const first = this.intro?.firstPlayerId;
    if (!first) throw new GameError('Pick who goes first.');
    this.controlPlayerId = first;
    this.intro = null;
    this.phase = 'board';
  }

  // --- board clues --------------------------------------------------------

  selectClue(clueId: string, by: Seat): void {
    this.requirePhase('board');
    if (by.role === 'player') {
      if (!this.settings.playersPickClues) throw new GameError('The host is picking clues.');
      if (by.player.id !== this.controlPlayerId) throw new GameError("It's not your pick.");
    }
    if (this.usedClueIds.has(clueId)) throw new GameError('That clue has already been played.');
    const found = this.findClue(clueId);
    if (!found) throw new GameError('Unknown clue.');

    this.usedClueIds.add(clueId);
    const { clue, category } = found;
    // The Daily Double belongs to whoever picked it. If nobody has control (the host is picking), it plays as a normal clue.
    const picker = this.controlPlayerId && this.players.has(this.controlPlayerId) ? this.controlPlayerId : null;
    const dd = clue.dailyDouble && picker ? clue.dailyDouble : null;
    const prompt = dd?.prompt ?? clue.prompt;
    const readMs = readTimeMs(prompt);
    const round = this.newRound(null, readMs);
    this.active = {
      clue,
      category,
      prompt,
      answer: dd?.answer ?? clue.answer,
      value: clue.value,
      round,
      timerEndsAt: null,
      dailyDouble: dd && picker ? { playerId: picker, wager: null, revealed: false } : null,
    };
    this.phase = 'clue';
    if (dd) {
      // Wait for the host to reveal it; no buzzers on a Daily Double.
      round.buzzersOpenAt = null;
      return;
    }
    this.setTimer('clue-open', readMs, () => {
      if (this.active?.round === round && round.phase === 'reading') this.openClueBuzzers(round);
    });
  }

  /** Host shows the Daily Double clue; the picker answers straight away. */
  revealDailyDouble(): void {
    const active = this.requireActive();
    const dd = active.dailyDouble;
    if (!dd) throw new GameError("This clue isn't a Daily Double.");
    if (dd.revealed) throw new GameError('The clue is already showing.');
    if (dd.wager === null) throw new GameError(`Waiting for ${this.players.get(dd.playerId)?.name ?? 'the player'} to wager.`);
    dd.revealed = true;
    active.round.phase = 'answering';
    active.round.buzzedPlayerId = dd.playerId;
  }

  /** Host skips the read time. */
  openBuzzers(): void {
    const { round, dailyDouble } = this.requireActive();
    if (dailyDouble) throw new GameError('Only the Daily Double player answers this one.');
    if (round.phase !== 'reading') throw new GameError('Buzzers are already open.');
    this.openClueBuzzers(round);
  }

  startTimer(): void {
    const active = this.requireActive();
    const seconds = active.clue.timeLimitSec ?? DEFAULT_TIMER_SEC;
    active.timerEndsAt = Date.now() + seconds * 1000;
  }

  /** Buzz on the open clue or tiebreaker. Throws with the reason if it doesn't count. */
  buzz(playerId: string): void {
    const round = this.phase === 'clue' ? this.active?.round : this.phase === 'tiebreaker' ? this.tiebreaker?.round : null;
    if (!round || round.phase !== 'buzzing') throw new GameError('Buzzers are closed.');
    if (round.eligible && !round.eligible.has(playerId)) throw new GameError("You're not in this tiebreaker.");
    if (round.lockedOut.has(playerId)) throw new GameError("You're out on this one.");
    if (round.priorityPlayerId && round.priorityPlayerId !== playerId) {
      throw new GameError(`${this.players.get(round.priorityPlayerId)?.name ?? 'The picker'} picked this clue, so only they can buzz right now.`);
    }
    this.clearTimer('clue-priority');
    this.clearTimer('tb-window');
    round.priorityPlayerId = null;
    round.buzzEndsAt = null;
    round.phase = 'answering';
    round.buzzedPlayerId = playerId;
  }

  judge(correct: boolean): void {
    const active = this.requireActive();
    const { round } = active;
    if (round.phase !== 'answering' || !round.buzzedPlayerId) throw new GameError('Nobody is answering right now.');
    const player = this.requirePlayer(round.buzzedPlayerId);

    const value = active.value;

    if (active.dailyDouble) {
      // Daily Double: win or lose the wager, like the show, and nobody else can steal it.
      const wager = active.dailyDouble.wager ?? 0;
      player.score += correct ? wager : -wager;
      round.phase = 'revealed';
      active.timerEndsAt = null;
      return;
    }

    if (correct) {
      player.score += value;
      this.controlPlayerId = player.id;
      round.phase = 'revealed';
      active.timerEndsAt = null;
      return;
    }

    // Wrong: lose the points, keep the answer hidden, and let everyone else try to steal.
    if (this.settings.negativeScoring) player.score -= value;
    round.lockedOut.add(player.id);
    round.buzzedPlayerId = null;
    round.phase = this.canAnyoneBuzz(round) ? 'buzzing' : 'revealed';
  }

  reveal(): void {
    const active = this.requireActive();
    this.closeRound(active.round);
    active.timerEndsAt = null;
  }

  closeClue(): void {
    this.requireActive();
    this.active = null;
    this.clearTimer('clue-open');
    this.clearTimer('clue-priority');
    if (this.remainingClueCount() === 0) this.startFinal();
    else this.phase = 'board';
  }

  private openClueBuzzers(round: BuzzRound): void {
    round.phase = 'buzzing';
    round.buzzersOpenAt = null;
    const picker = this.controlPlayerId;
    if (!picker || !this.players.has(picker) || round.lockedOut.has(picker)) return;

    // The picker gets a head start; if they don't buzz in time, they're out and it opens to everyone.
    round.priorityPlayerId = picker;
    round.buzzEndsAt = Date.now() + PRIORITY_MS;
    this.setTimer('clue-priority', PRIORITY_MS, () => {
      if (this.active?.round !== round || round.phase !== 'buzzing' || round.priorityPlayerId !== picker) return;
      round.lockedOut.add(picker);
      this.endPriority(round);
      if (!this.canAnyoneBuzz(round)) this.closeRound(round);
    });
  }

  private endPriority(round: BuzzRound): void {
    round.priorityPlayerId = null;
    round.buzzEndsAt = null;
  }

  // --- final round --------------------------------------------------------

  private startFinal(): void {
    const entries = new Map<string, FinalEntry>();
    for (const id of this.players.keys()) entries.set(id, { wager: null, answer: '', revealed: false, correct: null });
    this.final = { phase: 'wager', entries, order: [], index: 0, answerEndsAt: null };
    this.phase = 'final';
  }

  /** Most a player may wager: whatever they've earned, never less than 0. */
  maxWager(playerId: string): number {
    return Math.max(0, this.players.get(playerId)?.score ?? 0);
  }

  /** Most a Daily Double player may wager: their score, or the floor if that's higher. */
  dailyDoubleMax(playerId: string): number {
    return Math.max(this.players.get(playerId)?.score ?? 0, DAILY_DOUBLE_MAX_FLOOR);
  }

  /** Daily Double wager while one is open, otherwise a final-round wager. */
  wager(playerId: string, amount: number): void {
    const dd = this.phase === 'clue' ? this.active?.dailyDouble : null;
    if (dd) {
      if (dd.playerId !== playerId) throw new GameError("It's not your Daily Double.");
      if (dd.wager !== null) throw new GameError('Your wager is already locked in.');
      const max = this.dailyDoubleMax(playerId);
      if (!Number.isInteger(amount) || amount < DAILY_DOUBLE_MIN_WAGER || amount > max) {
        throw new GameError(`Wager a whole number from ${DAILY_DOUBLE_MIN_WAGER} to ${max}.`);
      }
      dd.wager = amount;
      return;
    }
    const final = this.requireFinal('wager');
    const entry = final.entries.get(playerId);
    if (!entry) throw new GameError("You joined after the final round started, so you're watching this one.");
    const max = this.maxWager(playerId);
    if (!Number.isInteger(amount) || amount < 0 || amount > max) {
      throw new GameError(`Wager a whole number from 0 to ${max}.`);
    }
    entry.wager = amount;
  }

  finalShowQuestion(): void {
    const final = this.requireFinal('wager');
    for (const entry of final.entries.values()) entry.wager ??= 0;
    final.phase = 'answer';
    final.answerEndsAt = Date.now() + FINAL_ANSWER_MS;
    this.setTimer('final-answer', FINAL_ANSWER_MS, () => {
      if (this.final === final && final.phase === 'answer') this.lockFinalAnswers(final);
    });
  }

  finalAnswer(playerId: string, text: string): void {
    const final = this.requireFinal('answer');
    const entry = final.entries.get(playerId);
    if (!entry) throw new GameError("You're watching this final round.");
    entry.answer = String(text ?? '').slice(0, MAX_FINAL_ANSWER_LENGTH);
  }

  finalLock(): void {
    this.lockFinalAnswers(this.requireFinal('answer'));
  }

  finalReveal(): void {
    const final = this.requireFinal('judging');
    final.entries.get(final.order[final.index])!.revealed = true;
  }

  finalJudge(correct: boolean): void {
    const final = this.requireFinal('judging');
    const playerId = final.order[final.index];
    const entry = final.entries.get(playerId)!;
    if (!entry.revealed) throw new GameError('Reveal their answer first.');
    entry.correct = correct;
    const player = this.players.get(playerId);
    if (player) player.score += correct ? entry.wager ?? 0 : -(entry.wager ?? 0);
    final.index++;
    if (final.index >= final.order.length) final.phase = 'done';
  }

  /** After the final: crown a winner, or go to a tiebreaker if first place is tied. */
  finalFinish(): void {
    this.requireFinal('done');
    this.final = null;
    const leaders = this.leaders();
    if (leaders.length > 1) this.startTiebreaker(leaders.map((p) => p.id));
    else this.finish(leaders[0]?.id ?? null);
  }

  private lockFinalAnswers(final: Final): void {
    this.clearTimer('final-answer');
    final.phase = 'judging';
    final.answerEndsAt = null;
    // Lowest score reveals first, so the suspense builds toward the leader.
    final.order = [...final.entries.keys()].sort((a, b) => (this.players.get(a)?.score ?? 0) - (this.players.get(b)?.score ?? 0));
    final.index = 0;
    if (!final.order.length) final.phase = 'done';
  }

  // --- tiebreaker ---------------------------------------------------------

  private startTiebreaker(playerIds: string[]): void {
    this.phase = 'tiebreaker';
    this.nextTiebreakerQuestion(playerIds, 1);
  }

  /** Continue after a tiebreaker question: crown the winner, or ask another. */
  tiebreakerNext(): void {
    this.requirePhase('tiebreaker');
    const tb = this.tiebreaker!;
    if (tb.round.phase !== 'revealed') throw new GameError('Finish this question first.');
    if (tb.winnerId) {
      this.finish(tb.winnerId);
      return;
    }
    const tied = [...(tb.round.eligible ?? [])].filter((id) => this.players.has(id));
    if (tied.length < 2) this.finish(tied[0] ?? null);
    else this.nextTiebreakerQuestion(tied, tb.number + 1);
  }

  judgeTiebreaker(correct: boolean): void {
    this.requirePhase('tiebreaker');
    const tb = this.tiebreaker!;
    const { round } = tb;
    if (round.phase !== 'answering' || !round.buzzedPlayerId) throw new GameError('Nobody is answering right now.');
    if (correct) {
      tb.winnerId = round.buzzedPlayerId;
      round.phase = 'revealed';
      return;
    }
    round.lockedOut.add(round.buzzedPlayerId);
    round.buzzedPlayerId = null;
    if (this.canAnyoneBuzz(round)) this.openTiebreakerWindow(tb);
    else round.phase = 'revealed';
  }

  revealTiebreaker(): void {
    this.requirePhase('tiebreaker');
    this.closeRound(this.tiebreaker!.round);
  }

  private nextTiebreakerQuestion(playerIds: string[], number: number): void {
    const pool = this.board.tiebreakers;
    // Loops back to the first question if the pool runs out.
    const def = pool[(number - 1) % pool.length];
    const readMs = readTimeMs(def.prompt);
    const tb: Tiebreaker = { number, def, round: this.newRound(new Set(playerIds), readMs), winnerId: null };
    this.tiebreaker = tb;
    this.setTimer('tb-open', readMs, () => {
      if (this.tiebreaker === tb && tb.round.phase === 'reading') this.openTiebreakerWindow(tb);
    });
  }

  private openTiebreakerWindow(tb: Tiebreaker): void {
    const { round } = tb;
    round.phase = 'buzzing';
    round.buzzersOpenAt = null;
    round.buzzEndsAt = Date.now() + TIEBREAKER_WINDOW_MS;
    const endsAt = round.buzzEndsAt;
    this.setTimer('tb-window', TIEBREAKER_WINDOW_MS, () => {
      // Nobody buzzed in time: show the answer; the host moves on to another question.
      if (this.tiebreaker === tb && round.phase === 'buzzing' && round.buzzEndsAt === endsAt) this.closeRound(round);
    });
  }

  // --- whole game -----------------------------------------------------------

  /** Routes the host's judge buttons to whichever question is live. */
  judgeCurrent(correct: boolean): void {
    if (this.phase === 'tiebreaker') this.judgeTiebreaker(correct);
    else this.judge(correct);
  }

  revealCurrent(): void {
    if (this.phase === 'tiebreaker') this.revealTiebreaker();
    else this.reveal();
  }

  adjustScore(playerId: string, delta: number): void {
    if (!Number.isFinite(delta)) throw new GameError('Invalid score change.');
    this.requirePlayer(playerId).score += Math.round(delta);
  }

  setControl(playerId: string | null): void {
    if (playerId !== null) this.requirePlayer(playerId);
    this.controlPlayerId = playerId;
  }

  updateSettings(patch: Partial<RoomSettings>): void {
    if (typeof patch.negativeScoring === 'boolean') this.settings.negativeScoring = patch.negativeScoring;
    if (typeof patch.playersPickClues === 'boolean') this.settings.playersPickClues = patch.playersPickClues;
  }

  /** Host ends early: the outright leader (if any) is champion. */
  end(): void {
    const leaders = this.leaders();
    this.finish(leaders.length === 1 ? leaders[0].id : null);
  }

  /** Back to the lobby with the same players, scores cleared. */
  reset(): void {
    this.dispose();
    this.lastChampionId = this.championId;
    this.championId = null;
    this.active = null;
    this.intro = null;
    this.final = null;
    this.tiebreaker = null;
    this.usedClueIds.clear();
    this.board = buildBoard(this.pool);
    this.controlPlayerId = null;
    for (const player of this.players.values()) player.score = 0;
    this.phase = 'lobby';
  }

  private finish(championId: string | null): void {
    this.dispose();
    this.championId = championId;
    this.active = null;
    this.intro = null;
    this.final = null;
    this.tiebreaker = null;
    this.phase = 'ended';
  }

  private leaders(): Player[] {
    const players = [...this.players.values()];
    if (!players.length) return [];
    const top = Math.max(...players.map((p) => p.score));
    return players.filter((p) => p.score === top);
  }

  // --- test players -------------------------------------------------------

  /**
   * Gives test players something to do in the current state. Each situation
   * gets one pending action; a new situation replaces it.
   */
  private runBots(): void {
    const plan = this.planBots();
    if (plan?.key === this.botKey && this.timers.has('bot')) return;
    this.clearTimer('bot');
    this.botKey = plan?.key ?? null;
    if (plan) this.setTimer('bot', plan.delay, plan.act);
  }

  private planBots(): { key: string; delay: number; act: () => void } | null {
    const bots = [...this.players.values()].filter((p) => p.isBot);
    if (!bots.length) return null;

    const dd = this.phase === 'clue' ? this.active?.dailyDouble : null;
    if (dd && dd.wager === null && this.players.get(dd.playerId)?.isBot) {
      const max = this.dailyDoubleMax(dd.playerId);
      return {
        key: `dd:${this.active!.clue.id}`,
        delay: 1500,
        act: () => this.wager(dd.playerId, DAILY_DOUBLE_MIN_WAGER + Math.floor(Math.random() * (max - DAILY_DOUBLE_MIN_WAGER + 1))),
      };
    }

    const round = this.phase === 'clue' ? this.active?.round : this.phase === 'tiebreaker' ? this.tiebreaker?.round : null;
    if (round?.phase === 'buzzing') {
      const ready = bots.filter((b) => this.canBuzz(round, b.id));
      if (!ready.length) return null;
      const id = this.phase === 'clue' ? this.active!.clue.id : `tb${this.tiebreaker!.number}`;
      // A bot with the head start sometimes lets it run out, so the steal flow gets exercised too.
      if (round.priorityPlayerId && Math.random() < 0.35) return null;
      return {
        key: `buzz:${id}:${round.lockedOut.size}:${round.priorityPlayerId}`,
        delay: between(1500, round.priorityPlayerId ? 6000 : 4000),
        act: () => {
          const bot = pick(bots.filter((b) => this.canBuzz(round, b.id)));
          if (bot) this.buzz(bot.id);
        },
      };
    }

    const final = this.final;
    if (final?.phase === 'wager' && bots.some((b) => final.entries.get(b.id)?.wager === null)) {
      return {
        key: 'final:wager',
        delay: 1000,
        act: () => {
          for (const bot of bots) {
            const entry = final.entries.get(bot.id);
            if (entry && entry.wager === null) entry.wager = Math.floor(Math.random() * (this.maxWager(bot.id) + 1));
          }
        },
      };
    }
    if (final?.phase === 'answer' && bots.some((b) => final.entries.get(b.id)?.answer === '')) {
      return {
        key: 'final:answer',
        delay: between(2000, 6000),
        act: () => {
          for (const bot of bots) {
            const entry = final.entries.get(bot.id);
            if (entry && !entry.answer) entry.answer = Math.random() < 0.5 ? this.board.final.answer : pick(BOT_WRONG_ANSWERS);
          }
        },
      };
    }
    return null;
  }

  // --- views --------------------------------------------------------------

  viewFor(seat: Seat): RoomView {
    const role: Role = seat.role;
    const youId = seat.role === 'player' ? seat.player.id : null;
    return {
      code: this.code,
      boardTitle: this.board.title,
      hostName: this.hostName,
      hostConnected: this.hostSocketId !== null,
      phase: this.phase,
      settings: { ...this.settings },
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        color: p.color,
        connected: p.isBot || p.socketId !== null,
        isBot: p.isBot,
      })),
      categories: this.board.categories.map((category) => ({
        id: category.id,
        title: category.title,
        description: category.description,
        type: category.type,
        clues: category.clues.map((clue) => ({
          id: clue.id,
          value: clue.value,
          difficulty: clue.difficulty,
          used: this.usedClueIds.has(clue.id),
        })),
      })),
      activeClue: this.activeClueView(role),
      intro: this.introView(),
      final: this.finalView(role, youId),
      tiebreaker: this.tiebreakerView(role),
      championId: this.championId,
      controlPlayerId: this.controlPlayerId,
      serverNow: Date.now(),
      you: { role, playerId: youId },
    };
  }

  private roundView(round: BuzzRound): BuzzWindowView {
    return {
      phase: round.phase,
      buzzedPlayerId: round.buzzedPlayerId,
      lockedOutPlayerIds: [...round.lockedOut],
      eligiblePlayerIds: round.eligible ? [...round.eligible] : null,
      buzzersOpenAt: round.buzzersOpenAt,
      priorityPlayerId: round.priorityPlayerId,
      buzzEndsAt: round.buzzEndsAt,
    };
  }

  private activeClueView(role: Role): ActiveClueView | null {
    const active = this.active;
    if (!active) return null;
    const { clue, category, round, dailyDouble } = active;
    // Players don't see the Daily Double clue until the host reveals it; the host always can.
    const hidden = role !== 'host' && dailyDouble !== null && !dailyDouble.revealed;
    return {
      ...this.roundView(round),
      id: clue.id,
      categoryId: category.id,
      categoryTitle: category.title,
      type: category.type,
      value: active.value,
      difficulty: clue.difficulty,
      prompt: hidden ? '' : active.prompt,
      media: hidden || dailyDouble ? undefined : clue.media,
      timeLimitSec: clue.timeLimitSec,
      answer: role === 'host' || round.phase === 'revealed' ? active.answer : undefined,
      timerEndsAt: active.timerEndsAt,
      dailyDouble: dailyDouble
        ? {
            ...dailyDouble,
            minWager: DAILY_DOUBLE_MIN_WAGER,
            maxWager: this.dailyDoubleMax(dailyDouble.playerId),
          }
        : null,
    };
  }

  private introView(): IntroView | null {
    if (!this.intro) return null;
    return { spin: this.intro.spin, firstPlayerId: this.intro.firstPlayerId, champion: this.intro.champion };
  }

  private finalView(role: Role, youId: string | null): FinalView | null {
    const final = this.final;
    if (!final) return null;
    const ids = final.order.length ? final.order : [...final.entries.keys()];
    return {
      category: this.board.final.category,
      phase: final.phase,
      prompt: final.phase === 'wager' ? null : this.board.final.prompt,
      answer: role === 'host' || final.phase === 'done' ? this.board.final.answer : null,
      answerEndsAt: final.answerEndsAt,
      entries: ids.map((playerId) => {
        const entry = final.entries.get(playerId)!;
        const mine = role === 'host' || playerId === youId;
        return {
          playerId,
          wagered: entry.wager !== null,
          answered: entry.answer.trim() !== '',
          wager: mine || entry.correct !== null ? entry.wager : null,
          answer: mine || entry.revealed ? entry.answer : null,
          revealed: entry.revealed,
          correct: entry.correct,
        };
      }),
      currentPlayerId: final.phase === 'judging' ? final.order[final.index] ?? null : null,
    };
  }

  private tiebreakerView(role: Role): TiebreakerView | null {
    const tb = this.tiebreaker;
    if (!tb) return null;
    return {
      ...this.roundView(tb.round),
      number: tb.number,
      prompt: tb.def.prompt,
      answer: role === 'host' || tb.round.phase === 'revealed' ? tb.def.answer : null,
      winnerId: tb.winnerId,
    };
  }

  // --- helpers ------------------------------------------------------------

  private newRound(eligible: Set<string> | null, readMs: number): BuzzRound {
    return {
      phase: 'reading',
      buzzedPlayerId: null,
      lockedOut: new Set(),
      eligible,
      buzzersOpenAt: Date.now() + readMs,
      priorityPlayerId: null,
      buzzEndsAt: null,
    };
  }

  private closeRound(round: BuzzRound): void {
    round.phase = 'revealed';
    round.buzzedPlayerId = null;
    round.buzzersOpenAt = null;
    this.endPriority(round);
  }

  private canBuzz(round: BuzzRound, playerId: string): boolean {
    return (
      round.phase === 'buzzing' &&
      !round.lockedOut.has(playerId) &&
      (!round.eligible || round.eligible.has(playerId)) &&
      (!round.priorityPlayerId || round.priorityPlayerId === playerId)
    );
  }

  private canAnyoneBuzz(round: BuzzRound): boolean {
    const pool = round.eligible ? [...round.eligible] : [...this.players.keys()];
    return pool.some((id) => this.players.has(id) && !round.lockedOut.has(id));
  }

  /** Runs `fn` after `ms` (replacing any timer with the same key), then broadcasts. */
  private setTimer(key: string, ms: number, fn: () => void): void {
    this.clearTimer(key);
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        try {
          fn();
        } catch (err) {
          if (!(err instanceof GameError)) console.error(err);
        }
        this.lastActivity = Date.now();
        this.onChange(this);
        this.runBots();
      }, ms),
    );
  }

  private clearTimer(key: string): void {
    clearTimeout(this.timers.get(key));
    this.timers.delete(key);
  }

  private findClue(clueId: string): { clue: ClueDef; category: CategoryDef } | null {
    for (const category of this.board.categories) {
      const clue = category.clues.find((c) => c.id === clueId);
      if (clue) return { clue, category };
    }
    return null;
  }

  private remainingClueCount(): number {
    return this.board.categories.reduce(
      (sum, category) => sum + category.clues.filter((c) => !this.usedClueIds.has(c.id)).length,
      0,
    );
  }

  private requirePhase(phase: GamePhase): void {
    if (this.phase !== phase) throw new GameError(`That can't be done right now (game is in ${this.phase}).`);
  }

  private requireActive(): ActiveClue {
    if (this.phase !== 'clue' || !this.active) throw new GameError('No clue is open.');
    return this.active;
  }

  private requireFinal(phase: FinalPhase): Final {
    if (this.phase !== 'final' || !this.final) throw new GameError("The final round isn't on.");
    if (this.final.phase !== phase) throw new GameError("That can't be done at this point in the final round.");
    return this.final;
  }

  private requirePlayer(playerId: string): Player {
    const player = this.players.get(playerId);
    if (!player) throw new GameError('That player is not in this room.');
    return player;
  }
}
