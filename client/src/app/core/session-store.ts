import type { Role } from '@shared/protocol';

export interface StoredSession {
  sessionId: string;
  role: Role;
}

const tabKey = (code: string) => `pp:session:${code.toUpperCase()}`;
const browserKey = (code: string, role: Role) => `pp:session:${code.toUpperCase()}:${role}`;

function read(storage: Storage, key: string): StoredSession | null {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function write(storage: Storage, key: string, session: StoredSession | null): void {
  try {
    if (session) storage.setItem(key, JSON.stringify(session));
    else storage.removeItem(key);
  } catch {
    // Storage blocked (private mode); the game still works, just no auto-rejoin.
  }
}

/**
 * Remembers which seat you hold in each room so a refresh or dropped
 * connection puts you right back in the game.
 *
 * Seats are kept per tab (sessionStorage), so one browser can be the host in
 * one tab and a player in another. A per-role copy in localStorage brings
 * the seat back if the tab is closed and the link reopened; the host seat
 * wins, so a host never gets locked out of their own room.
 */
export const sessionStore = {
  get(code: string): StoredSession | null {
    return (
      read(sessionStorage, tabKey(code)) ??
      read(localStorage, browserKey(code, 'host')) ??
      read(localStorage, browserKey(code, 'player'))
    );
  },
  set(code: string, session: StoredSession): void {
    write(sessionStorage, tabKey(code), session);
    write(localStorage, browserKey(code, session.role), session);
  },
  /** Forget only this tab's seat (e.g. another tab took it over). */
  forgetTab(code: string): void {
    write(sessionStorage, tabKey(code), null);
  },
  /** Forget a seat the server no longer recognises (only that seat, not the other role's). */
  clear(code: string, sessionId?: string): void {
    const tab = read(sessionStorage, tabKey(code));
    if (!sessionId || tab?.sessionId === sessionId) write(sessionStorage, tabKey(code), null);
    for (const role of ['host', 'player'] as const) {
      const saved = read(localStorage, browserKey(code, role));
      if (saved && (!sessionId || saved.sessionId === sessionId)) write(localStorage, browserKey(code, role), null);
    }
  },
};
