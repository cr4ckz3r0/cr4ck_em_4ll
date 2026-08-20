# cr4ck_em_4ll

**CR4CK 'EM 4LL** — a hacker-themed code-cracking web game (a Mastermind variant with a
terminal / matrix-rain aesthetic). Break the secret access code from the feedback pegs,
climb the levels, and land on the leaderboard.

## How to play

- The game generates a hidden access code of hex symbols (`0`–`F`).
- Build a guess from the on-screen keypad (or your keyboard) and hit **TRANSMIT**.
- After each guess you get feedback pegs:
  - 🟢 **locked** — right symbol in the right slot
  - 🟠 **leaked** — right symbol, wrong slot
- Crack the code before you run out of tries. Each level gets harder (longer code,
  bigger symbol pool, fewer tries). Fast, low-attempt cracks score more.

Keyboard: type hex symbols to fill slots, `Enter` to transmit, `Backspace` to delete,
`Esc` to clear.

## Run it

Requires Node.js 18+.

```bash
npm install
npm start
```

Then open http://localhost:3000

For auto-reload during development:

```bash
npm run dev
```

Set a custom port with `PORT=8080 npm start`.

## Tech

- **Backend:** Node.js + Express (`server.js`) — serves the static frontend and a small
  JSON leaderboard API.
- **Frontend:** vanilla HTML/CSS/JS in `public/` — game logic, matrix-rain canvas, and UI.

### API

| Method | Path          | Description                                   |
| ------ | ------------- | --------------------------------------------- |
| GET    | `/api/health` | Health check                                  |
| GET    | `/api/scores` | Top scores (JSON array)                       |
| POST   | `/api/scores` | Submit `{ name, score, level, attempts }`     |

Scores persist to `data/scores.json` (git-ignored).
