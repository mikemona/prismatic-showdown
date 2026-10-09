import { computed, Injectable, signal } from '@angular/core';
import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  GamePhase,
  RoomSettings,
  RoomView,
  ServerToClientEvents,
  SessionInfo,
} from '@shared/protocol';
import { sessionStore } from './session-store';

type AckResult<T> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * The single connection to the game server. Components read room state from
 * the signals here and call the action methods; the server decides what
 * actually happens and pushes the new state back.
 */
@Injectable({ providedIn: 'root' })
export class GameSocket {
  private readonly socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({ transports: ['websocket'] });
  private current: { code: string; sessionId: string } | null = null;

  readonly state = signal<RoomView | null>(null);
  readonly connected = signal(false);
  /** Set when the server removes us from the room. */
  readonly closedReason = signal<string | null>(null);
  /** Latest action error, shown as a toast. */
  readonly toast = signal<string | null>(null);

  readonly isHost = computed(() => this.state()?.you.role === 'host');
  readonly me = computed(() => {
    const state = this.state();
    return state?.players.find((p) => p.id === state.you.playerId) ?? null;
  });

  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  /** Server clock minus local clock, so every screen's countdowns agree. */
  private clockOffset = 0;

  constructor() {
    this.socket.on('connect', () => {
      this.connected.set(true);
      // After a dropped connection, take our seat back automatically.
      if (this.current) void this.resume(this.current.code, this.current.sessionId).catch(() => undefined);
    });
    this.socket.on('disconnect', () => this.connected.set(false));
    this.socket.on('room:state', (state) => {
      this.clockOffset = state.serverNow - Date.now();
      this.state.set(state);
    });
    this.socket.on('room:closed', (reason) => {
      if (this.current) sessionStore.forgetTab(this.current.code);
      this.current = null;
      this.state.set(null);
      this.closedReason.set(reason);
    });
  }

  /** Current time on the server's clock (epoch ms). */
  serverTime(): number {
    return Date.now() + this.clockOffset;
  }

  // --- joining ------------------------------------------------------------

  async create(hostName: string): Promise<SessionInfo> {
    return this.enter(await this.call<SessionInfo>('room:create', { hostName }));
  }

  /** Developer shortcut: a room already near the end of the game. */
  async createEndingRoom(hostName: string): Promise<SessionInfo> {
    return this.enter(await this.call<SessionInfo>('dev:createEndingRoom', { hostName }));
  }

  async join(code: string, name: string): Promise<SessionInfo> {
    return this.enter(await this.call<SessionInfo>('room:join', { code, name }));
  }

  async resume(code: string, sessionId: string): Promise<SessionInfo> {
    try {
      return this.enter(await this.call<SessionInfo>('room:resume', { code, sessionId }));
    } catch (err) {
      sessionStore.clear(code, sessionId);
      this.current = null;
      throw err;
    }
  }

  peek(code: string): Promise<{ hostName: string; phase: GamePhase }> {
    return this.call('room:peek', { code });
  }

  /** Leave the room view without giving up the seat (it can be resumed). */
  leave(): void {
    this.current = null;
    this.state.set(null);
    this.closedReason.set(null);
    this.socket.emit('room:leave');
  }

  // --- host actions -------------------------------------------------------

  start = () => this.act('host:start');
  spin = () => this.act('host:spin');
  beginBoard = () => this.act('host:beginBoard');
  finalShowQuestion = () => this.act('host:finalShowQuestion');
  finalLock = () => this.act('host:finalLock');
  finalReveal = () => this.act('host:finalReveal');
  finalJudge = (correct: boolean) => this.act('host:finalJudge', { correct });
  finalFinish = () => this.act('host:finalFinish');
  tiebreakerNext = () => this.act('host:tiebreakerNext');
  openBuzzers = () => this.act('host:openBuzzers');
  startTimer = () => this.act('host:startTimer');
  judge = (correct: boolean) => this.act('host:judge', { correct });
  reveal = () => this.act('host:reveal');
  closeClue = () => this.act('host:closeClue');
  revealDailyDouble = () => this.act('host:revealDailyDouble');
  adjustScore = (playerId: string, delta: number) => this.act('host:adjustScore', { playerId, delta });
  setControl = (playerId: string | null) => this.act('host:setControl', { playerId });
  kick = (playerId: string) => this.act('host:kick', { playerId });
  addBots = (count: number) => this.act('host:addBots', { count });
  removeBots = () => this.act('host:removeBots');
  updateSettings = (patch: Partial<RoomSettings>) => this.act('host:updateSettings', patch);
  end = () => this.act('host:end');
  reset = () => this.act('host:reset');

  // --- player actions -----------------------------------------------------

  buzz = () => this.act('player:buzz', undefined, { quiet: true });
  wager = (amount: number) => this.act('player:wager', { amount });
  /** Saved as the player types; quiet because it fires constantly. */
  finalAnswer = (text: string) => this.act('player:finalAnswer', { text }, { quiet: true });

  /** Host or the player in control picks a clue. */
  selectClue = (clueId: string) => this.act(this.isHost() ? 'host:selectClue' : 'player:selectClue', { clueId });

  // --- plumbing -----------------------------------------------------------

  showToast(message: string): void {
    clearTimeout(this.toastTimer);
    this.toast.set(message);
    this.toastTimer = setTimeout(() => this.toast.set(null), 3500);
  }

  private enter(info: SessionInfo): SessionInfo {
    this.current = { code: info.code, sessionId: info.sessionId };
    this.closedReason.set(null);
    sessionStore.set(info.code, { sessionId: info.sessionId, role: info.role });
    return info;
  }

  private async act(event: keyof ClientToServerEvents, payload?: object, opts: { quiet?: boolean } = {}): Promise<boolean> {
    try {
      await (payload === undefined ? this.call(event) : this.call(event, payload));
      return true;
    } catch (err) {
      if (!opts.quiet) this.showToast((err as Error).message);
      return false;
    }
  }

  private async call<T extends object = object>(event: keyof ClientToServerEvents, ...args: unknown[]): Promise<T> {
    // The typed emitter can't express "any event name" generically, so loosen it here only.
    const timed = this.socket.timeout(8000) as unknown as {
      emitWithAck(ev: string, ...a: unknown[]): Promise<AckResult<T>>;
    };
    let res: AckResult<T>;
    try {
      res = await timed.emitWithAck(event, ...args);
    } catch {
      throw new Error("Can't reach the game server.");
    }
    if (!res.ok) throw new Error(res.error);
    return res;
  }
}
