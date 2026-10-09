# Prismatic Showdown

A facilitated, Jeopardy-style game for the design team. One person hosts and runs the board; everyone else joins from their own screen with a room link and buzzes in.

## Run it

```bash
npm run setup   # first time: installs root, server and client deps
npm run dev     # server on :3000 + Angular on :4200 (proxied), open http://localhost:4200
```

Production (one process, one port):

```bash
npm run build   # builds the Angular client into client/dist
npm start       # server serves the client + sockets on $PORT (default 3000)
```

Requires Node 24+ (the server runs TypeScript directly via Node's type stripping).

## How a game flows

1. **Home**: host enters their name and creates a room (4-letter code), or a player enters a code.
2. **Name gate**: anyone opening `/room/ABCD` picks a display name before joining.
3. **Lobby**: invite link + code, live player list, house rules, test players, host starts the game.
4. **Who picks first**: host spins; a highlight hops between players and slows to a stop (~5s).
   On "play again", last game's champion picks first automatically.
5. **Board**: the player in control (or the host) picks a clue.
6. **Clue**: read time scales with the question (2–7s) → the picker gets a 6s head start to buzz → if they don't, they're out and
   everyone else can buzz. Wrong answers lose points, keep the answer hidden, and open a steal.
   One clue (300+) hides a **Daily Double**: a harder question for the picker alone. They wager 5 up to
   their score or 1,000 (whichever is higher), then the host reveals the clue; right or wrong, they win or lose the wager.
7. **Final round** (when the board is empty): wager up to your score on the category → 30s to type
   an answer → host reveals and judges each answer, lowest score first.
8. **Tiebreaker** (if first place is tied): harder questions, only tied players buzz, 15s each.
   First correct answer wins; if nobody gets it, another question.
9. **Ended**: champion and standings; host can play again with the same group.

Refreshing or dropping connection is safe: each browser remembers its seat per room and rejoins automatically.

## Layout

```
shared/protocol.ts          Types + socket event contract used by both sides
server/src/room.ts          Room class: all game rules and state
server/src/index.ts         Express + Socket.io wiring, per-role state broadcast
server/src/content/         Question pool (categories/, pool.ts) and the per-game board builder
client/src/app/core/        GameSocket service (signals) + session storage
client/src/app/pages/       Home and Room routes
client/src/app/room/        Lobby, board, clue stage, buzzer, host controls, scoreboard, results
client/src/app/room/clue-types/  One renderer per challenge type
```

## Questions

Each game draws a fresh board from the pool in `server/src/content/`:
5 random categories (at most 2 general UX, the rest Prismatic), one random question per value
(difficulty 1 = 100 … 5 = 500), one random final, and the tiebreakers shuffled. "Play again" redraws.

- Add a question: `q(difficulty, 'Prompt', 'Answer')` in the category file under `categories/`.
- Daily Double questions go in each category's `dailyDoubles` list; `difficulty` 3–5 is the slot they replace (300–500).
- Add a category: write it in `categories/` (with `group: 'prismatic' | 'general'`) and list it in `pool.ts`.
- Aim for at least one question per difficulty level; three or more keeps games varied.

## Adding a challenge type

1. Add the type to `ClueType` in `shared/protocol.ts` (and any extra clue fields it needs).
2. Build a renderer component in `client/src/app/room/clue-types/` and add a case in `clue-renderer.ts`.
3. Set `type` on a category in `server/src/content/categories/`.
