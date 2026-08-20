// CR4CK 'EM 4LL - client-side code-breaking game logic.
const SYMBOLS = "0123456789ABCDEF".split("");

const el = (id) => document.getElementById(id);
const board = el("board");
const slotsWrap = el("slots");
const keypad = el("keypad");
const logBox = el("log");

const state = {
  level: 1,
  score: 0,
  code: [],
  codeLen: 4,
  poolSize: 6,
  maxTries: 10,
  triesLeft: 10,
  guess: [],
  guesses: [],
  startedAt: 0,
  timerId: null,
  over: false,
};

function levelConfig(level) {
  // Difficulty grows: longer codes, larger symbol pool, fewer relative tries.
  const codeLen = Math.min(3 + level, 7); // L1=4 ... L4+=7
  const poolSize = Math.min(5 + level, SYMBOLS.length); // L1=6 ... up to 16
  const maxTries = Math.max(12 - level, 7);
  return { codeLen, poolSize, maxTries };
}

function pool() {
  return SYMBOLS.slice(0, state.poolSize);
}

function makeCode(len, size) {
  const p = SYMBOLS.slice(0, size);
  const code = [];
  for (let i = 0; i < len; i++) {
    code.push(p[Math.floor(Math.random() * p.length)]);
  }
  return code;
}

// Standard Mastermind scoring with duplicate handling.
function scoreGuess(guess, code) {
  let locked = 0;
  let leaked = 0;
  const codeRest = [];
  const guessRest = [];
  for (let i = 0; i < code.length; i++) {
    if (guess[i] === code[i]) {
      locked++;
    } else {
      codeRest.push(code[i]);
      guessRest.push(guess[i]);
    }
  }
  const counts = {};
  for (const c of codeRest) counts[c] = (counts[c] || 0) + 1;
  for (const g of guessRest) {
    if (counts[g] > 0) {
      leaked++;
      counts[g]--;
    }
  }
  return { locked, leaked };
}

function log(msg, cls = "") {
  const line = document.createElement("div");
  line.className = `line ${cls}`;
  const ts = new Date().toLocaleTimeString("en-GB");
  line.textContent = `[${ts}] ${msg}`;
  logBox.prepend(line);
}

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${m}:${ss}`;
}

function startTimer() {
  state.startedAt = Date.now();
  clearInterval(state.timerId);
  state.timerId = setInterval(() => {
    el("hud-timer").textContent = fmtTime(Date.now() - state.startedAt);
  }, 500);
}

function flash(id) {
  const node = el(id);
  node.classList.remove("flash");
  void node.offsetWidth;
  node.classList.add("flash");
}

function renderHud() {
  el("hud-level").textContent = state.level;
  el("hud-tries").textContent = state.triesLeft;
  el("hud-score").textContent = state.score;
  el("hint-len").textContent = state.codeLen;
}

function renderKeypad() {
  keypad.innerHTML = "";
  for (const sym of pool()) {
    const b = document.createElement("button");
    b.className = "key";
    b.textContent = sym;
    b.dataset.sym = sym;
    b.addEventListener("click", () => addSymbol(sym));
    keypad.appendChild(b);
  }
}

function renderSlots() {
  slotsWrap.innerHTML = "";
  for (let i = 0; i < state.codeLen; i++) {
    const s = document.createElement("div");
    s.className = "slot";
    if (i === state.guess.length) s.classList.add("active");
    if (state.guess[i]) {
      s.textContent = state.guess[i];
      s.classList.add("filled");
    }
    slotsWrap.appendChild(s);
  }
}

function renderBoardRow(guess, result, idx) {
  const row = document.createElement("div");
  row.className = "row";

  const idxEl = document.createElement("span");
  idxEl.className = "idx";
  idxEl.textContent = String(idx).padStart(2, "0");
  row.appendChild(idxEl);

  const g = document.createElement("div");
  g.className = "guess";
  for (const sym of guess) {
    const c = document.createElement("div");
    c.className = "cell";
    c.textContent = sym;
    g.appendChild(c);
  }
  row.appendChild(g);

  const pegs = document.createElement("div");
  pegs.className = "pegs";
  for (let i = 0; i < result.locked; i++) pegs.appendChild(peg("locked"));
  for (let i = 0; i < result.leaked; i++) pegs.appendChild(peg("leaked"));
  const blanks = guess.length - result.locked - result.leaked;
  for (let i = 0; i < blanks; i++) pegs.appendChild(peg(""));
  row.appendChild(pegs);

  board.appendChild(row);
  board.scrollTop = board.scrollHeight;
}

function peg(kind) {
  const p = document.createElement("i");
  p.className = `peg ${kind}`.trim();
  return p;
}

function addSymbol(sym) {
  if (state.over) return;
  if (state.guess.length >= state.codeLen) return;
  state.guess.push(sym);
  renderSlots();
}

function backspace() {
  if (state.over) return;
  state.guess.pop();
  renderSlots();
}

function clearGuess() {
  if (state.over) return;
  state.guess = [];
  renderSlots();
}

function submitGuess() {
  if (state.over) return;
  if (state.guess.length !== state.codeLen) {
    log(`need ${state.codeLen} symbols before transmit`, "warn");
    flash("hud-tries");
    return;
  }
  const result = scoreGuess(state.guess, state.code);
  state.guesses.push({ guess: [...state.guess], result });
  state.triesLeft--;
  renderBoardRow(state.guess, result, state.guesses.length);
  log(
    `try #${state.guesses.length}: ${state.guess.join(" ")} -> ${result.locked} locked, ${result.leaked} leaked`,
    result.locked === state.codeLen ? "ok" : ""
  );

  if (result.locked === state.codeLen) {
    return win();
  }
  if (state.triesLeft <= 0) {
    return lose();
  }
  state.guess = [];
  renderSlots();
  renderHud();
  flash("hud-tries");
}

function computeGain() {
  const elapsed = Date.now() - state.startedAt;
  const base = 1000 * state.level;
  const triesBonus = state.triesLeft * 120;
  const timePenalty = Math.floor(elapsed / 1000) * 5;
  return Math.max(100, base + triesBonus - timePenalty);
}

function win() {
  const gain = computeGain();
  state.score += gain;
  state.over = true;
  clearInterval(state.timerId);
  renderHud();
  flash("hud-score");
  log(`ACCESS GRANTED · +${gain} pts`, "ok");
  showOverlay({
    title: "ACCESS GRANTED",
    fail: false,
    msg: `Code cracked in ${state.guesses.length} tries. +${gain} points.`,
    code: state.code,
    showNext: true,
    showSubmit: false,
  });
}

function lose() {
  state.over = true;
  clearInterval(state.timerId);
  log("LOCKOUT · trace detected", "bad");
  showOverlay({
    title: "ACCESS DENIED",
    fail: true,
    msg: `Out of attempts. The access code was:`,
    code: state.code,
    showNext: false,
    showSubmit: true,
  });
}

function showOverlay({ title, fail, msg, code, showNext, showSubmit }) {
  el("overlay-title").textContent = title;
  el("overlay-title").classList.toggle("fail", fail);
  el("overlay-msg").textContent = msg;
  const codeWrap = el("overlay-code");
  codeWrap.innerHTML = "";
  code.forEach((sym) => {
    const c = document.createElement("div");
    c.className = "cell";
    c.textContent = sym;
    codeWrap.appendChild(c);
  });
  el("btn-next").classList.toggle("hidden", !showNext);
  el("submit-block").classList.toggle("hidden", !showSubmit);
  el("overlay").classList.remove("hidden");
  if (showSubmit) el("player-name").focus();
}

function hideOverlay() {
  el("overlay").classList.add("hidden");
}

function newGame(reset = true) {
  if (reset) {
    state.level = 1;
    state.score = 0;
  }
  const cfg = levelConfig(state.level);
  state.codeLen = cfg.codeLen;
  state.poolSize = cfg.poolSize;
  state.maxTries = cfg.maxTries;
  state.triesLeft = cfg.maxTries;
  state.code = makeCode(cfg.codeLen, cfg.poolSize);
  state.guess = [];
  state.guesses = [];
  state.over = false;
  board.innerHTML = "";
  hideOverlay();
  renderHud();
  renderKeypad();
  renderSlots();
  startTimer();
  log(
    `level ${state.level} online :: ${cfg.codeLen}-symbol code, pool ${cfg.poolSize}, ${cfg.maxTries} tries`,
    "warn"
  );
}

function nextLevel() {
  state.level++;
  newGame(false);
}

async function loadLeaderboard() {
  try {
    const res = await fetch("/api/scores");
    const scores = await res.json();
    renderLeaderboard(scores);
  } catch {
    renderLeaderboard([]);
  }
}

function renderLeaderboard(scores) {
  const lb = el("leaderboard");
  lb.innerHTML = "";
  if (!scores.length) {
    lb.innerHTML = '<li class="lb-empty">no cracks logged yet</li>';
    return;
  }
  scores.slice(0, 10).forEach((s) => {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.className = "lb-name";
    name.textContent = s.name;
    const score = document.createElement("span");
    score.className = "lb-score";
    score.textContent = s.score;
    li.append(name, score);
    lb.appendChild(li);
  });
}

async function saveScore() {
  const name = el("player-name").value || "anon";
  try {
    const res = await fetch("/api/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        score: state.score,
        level: state.level,
        attempts: state.guesses.length,
      }),
    });
    const data = await res.json();
    renderLeaderboard(data.top || []);
    log(`score saved${data.rank ? ` · rank #${data.rank}` : ""}`, "ok");
    el("submit-block").classList.add("hidden");
  } catch {
    log("could not save score (server offline?)", "bad");
  }
}

// input wiring
el("btn-submit").addEventListener("click", submitGuess);
el("btn-back").addEventListener("click", backspace);
el("btn-clear").addEventListener("click", clearGuess);
el("btn-restart").addEventListener("click", () => newGame(true));
el("btn-next").addEventListener("click", nextLevel);
el("btn-again").addEventListener("click", () => newGame(true));
el("btn-save").addEventListener("click", saveScore);

document.addEventListener("keydown", (e) => {
  if (!el("overlay").classList.contains("hidden")) {
    if (e.key === "Enter" && !el("submit-block").classList.contains("hidden")) saveScore();
    return;
  }
  const key = e.key.toUpperCase();
  if (SYMBOLS.slice(0, state.poolSize).includes(key)) addSymbol(key);
  else if (e.key === "Backspace") { e.preventDefault(); backspace(); }
  else if (e.key === "Enter") submitGuess();
  else if (e.key === "Escape") clearGuess();
});

// matrix rain background
function initMatrix() {
  const canvas = el("matrix");
  const ctx = canvas.getContext("2d");
  let cols, drops, fontSize = 16;
  const glyphs = "01ABCDEF#$%<>*".split("");

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    cols = Math.floor(canvas.width / fontSize);
    drops = new Array(cols).fill(1).map(() => Math.random() * canvas.height / fontSize);
  }
  resize();
  window.addEventListener("resize", resize);

  setInterval(() => {
    ctx.fillStyle = "rgba(2, 5, 10, 0.12)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0aff9d";
    ctx.font = `${fontSize}px monospace`;
    for (let i = 0; i < cols; i++) {
      const ch = glyphs[Math.floor(Math.random() * glyphs.length)];
      ctx.fillText(ch, i * fontSize, drops[i] * fontSize);
      if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    }
  }, 60);
}

initMatrix();
loadLeaderboard();
newGame(true);
