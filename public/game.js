// THE LONG RIDE — a 13th-century open-world horseback survival game.
// Top-down, atmospheric vertical slice: real gaits, a bond with your mount,
// survival care, campfire rest, dynamic weather + forecast, and route planning.

const el = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

const WORLD = 6000;
const METERS_PER_PX = 0.5;
const DAY_LENGTH_SEC = 190; // real seconds for a full 24h cycle

const canvas = el("world");
const ctx = canvas.getContext("2d");
const mmCanvas = el("minimap");
const mm = mmCanvas.getContext("2d");

let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener("resize", resize);
resize();

// ---- gaits ---------------------------------------------------------------
const GAITS = [
  { name: "Walk", speed: 46, drain: -3, cadence: 2.2, amp: 3 },
  { name: "Trot", speed: 94, drain: 2.2, cadence: 3.4, amp: 5 },
  { name: "Canter", speed: 158, drain: 6.5, cadence: 3.0, amp: 8 },
  { name: "Gallop", speed: 236, drain: 13, cadence: 4.3, amp: 11 },
];

// ---- weather -------------------------------------------------------------
const WEATHER = {
  Clear:  { warmth: 86, visMul: 1.0, speedMul: 1.0, staDrain: 0, thirst: 1.25 },
  Cloudy: { warmth: 68, visMul: 0.95, speedMul: 1.0, staDrain: 0, thirst: 1.0 },
  Rain:   { warmth: 46, visMul: 0.8, speedMul: 0.86, staDrain: 0.6, thirst: 0.8 },
  Fog:    { warmth: 60, visMul: 0.55, speedMul: 0.95, staDrain: 0.2, thirst: 0.9 },
  Snow:   { warmth: 26, visMul: 0.7, speedMul: 0.78, staDrain: 1.0, thirst: 0.7 },
  Storm:  { warmth: 30, visMul: 0.6, speedMul: 0.82, staDrain: 1.4, thirst: 0.85 },
};
const WEATHER_KEYS = Object.keys(WEATHER);
const WEATHER_ICON = { Clear: "☀", Cloudy: "☁", Rain: "🌧", Fog: "🌫", Snow: "❄", Storm: "⛈" };

// ---- state ---------------------------------------------------------------
let state = null;

function makeWorld() {
  const waters = [];
  for (let i = 0; i < 10; i++) waters.push({ x: rand(400, WORLD - 400), y: rand(400, WORLD - 400), r: rand(90, 220) });
  const lush = [];
  for (let i = 0; i < 26; i++) lush.push({ x: rand(200, WORLD - 200), y: rand(200, WORLD - 200), r: rand(70, 150) });
  const forests = [];
  for (let i = 0; i < 22; i++) {
    const fx = rand(300, WORLD - 300), fy = rand(300, WORLD - 300), r = rand(90, 190);
    const trees = [];
    const n = Math.floor(rand(6, 14));
    for (let t = 0; t < n; t++) trees.push({ dx: rand(-r, r), dy: rand(-r, r), s: rand(0.7, 1.4) });
    forests.push({ x: fx, y: fy, r, trees });
  }
  const rocks = [];
  for (let i = 0; i < 30; i++) rocks.push({ x: rand(200, WORLD - 200), y: rand(200, WORLD - 200), r: rand(14, 34) });

  // waypoint route across the map
  const start = { x: WORLD * 0.5, y: WORLD * 0.82 };
  const waypoints = [
    { x: WORLD * 0.28, y: WORLD * 0.62 },
    { x: WORLD * 0.62, y: WORLD * 0.46 },
    { x: WORLD * 0.34, y: WORLD * 0.26 },
    { x: WORLD * 0.7, y: WORLD * 0.12 },
  ];
  return { waters, lush, forests, rocks, waypoints, start, snowY: WORLD * 0.3 };
}

function resetGame(riderName, horseName) {
  const world = makeWorld();
  state = {
    world,
    rider: riderName || "rider",
    horse: horseName || "companion",
    x: world.start.x,
    y: world.start.y,
    heading: -Math.PI / 2,
    speed: 0,
    gait: 1,
    blown: 0, // overexertion cooldown
    m: { bond: 42, stamina: 100, health: 100, hunger: 85, thirst: 85, energy: 90, warmth: 80 },
    hour: 6,
    day: 1,
    weather: "Clear",
    weatherNext: "Cloudy",
    wxTime: rand(30, 55),
    camp: null, // {x,y,fuel}
    wood: 0,
    resting: false,
    wpIndex: 0,
    traveled: 0,
    prompt: "",
    dust: [],
    over: false,
    won: false,
    lightning: 0,
    adviceTimer: 0,
    advice: "Follow the guide marker north.",
    time: performance.now(),
  };
  el("horse-name").textContent = state.horse;
  el("wp-total").textContent = String(world.waypoints.length);
}

// ---- input ---------------------------------------------------------------
const keys = new Set();
window.addEventListener("keydown", (e) => {
  if (!state || state.over) return;
  const k = e.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
  keys.add(k);
  if (k >= "1" && k <= "4") state.gait = Number(k) - 1;
  if (k === "f") gatherWood();
  if (k === "c") toggleCampfire();
  if (k === "r") toggleRest();
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

function moveVector() {
  let dx = 0, dy = 0;
  if (keys.has("w") || keys.has("arrowup")) dy -= 1;
  if (keys.has("s") || keys.has("arrowdown")) dy += 1;
  if (keys.has("a") || keys.has("arrowleft")) dx -= 1;
  if (keys.has("d") || keys.has("arrowright")) dx += 1;
  return { dx, dy };
}

// ---- interactions --------------------------------------------------------
function nearestWater() {
  let best = null, bd = Infinity;
  for (const w of state.world.waters) {
    const d = dist(state.x, state.y, w.x, w.y) - w.r;
    if (d < bd) { bd = d; best = w; }
  }
  return { edge: bd, w: best };
}
function onLush() {
  for (const l of state.world.lush) if (dist(state.x, state.y, l.x, l.y) < l.r) return true;
  return false;
}
function nearForest() {
  for (const f of state.world.forests) if (dist(state.x, state.y, f.x, f.y) < f.r + 30) return f;
  return null;
}
function nearCampLit() {
  return state.camp && state.camp.fuel > 0 && dist(state.x, state.y, state.camp.x, state.camp.y) < 90;
}

function gatherWood() {
  if (state.resting) return;
  if (state.speed > 25) return;
  if (nearForest() && state.wood < 6) {
    state.wood++;
    toast(`Gathered wood (${state.wood}).`);
  }
}
function toggleCampfire() {
  if (state.resting) return;
  if (state.speed > 25) return;
  if (state.camp && state.camp.fuel > 0) {
    if (state.wood > 0) { state.wood--; state.camp.fuel = Math.min(100, state.camp.fuel + 45); toast("Fed the fire."); }
    return;
  }
  if (state.wood > 0) {
    state.wood--;
    state.camp = { x: state.x, y: state.y, fuel: 70 };
    toast("Campfire lit. Press R to rest.");
  } else {
    toast("Need wood — press F near trees.");
  }
}
function toggleRest() {
  if (state.resting) { state.resting = false; return; }
  if (nearCampLit() && state.speed < 25) {
    state.resting = true;
    toast("Resting by the fire…");
  } else {
    toast("Light a campfire first (C), then rest.");
  }
}

let toastTimer = 0;
function toast(msg) { state.prompt = msg; toastTimer = 2.4; }

// ---- update --------------------------------------------------------------
function update(dt) {
  const s = state;
  const m = s.m;
  const timeScale = s.resting ? 9 : 1;

  // time of day
  s.hour += dt * (24 / DAY_LENGTH_SEC) * timeScale;
  while (s.hour >= 24) { s.hour -= 24; s.day++; }
  const night = s.hour < 5.5 || s.hour > 20.5;

  // weather
  s.wxTime -= dt * timeScale;
  if (s.wxTime <= 0) {
    s.weather = s.weatherNext;
    s.weatherNext = WEATHER_KEYS[Math.floor(Math.random() * WEATHER_KEYS.length)];
    s.wxTime = rand(32, 70);
  }
  const wx = WEATHER[s.weather];
  if (s.weather === "Storm" && Math.random() < dt * 0.6) s.lightning = 0.12;
  s.lightning = Math.max(0, s.lightning - dt);

  // campfire fuel
  if (s.camp && s.camp.fuel > 0) s.camp.fuel = Math.max(0, s.camp.fuel - dt * timeScale * 1.4);
  const warmingFire = nearCampLit();

  // ---- resting shortcut ----
  if (s.resting) {
    if (!warmingFire) s.resting = false;
    const mv = moveVector();
    if (mv.dx || mv.dy) s.resting = false;
  }
  const resting = s.resting;

  // ---- movement & gaits ----
  if (s.blown > 0) { s.blown -= dt; s.gait = 0; }
  if (m.stamina < 4 && s.gait > 0) s.gait = 0;
  if (m.energy < 12 && s.gait > 2) s.gait = 2; // exhausted horse can't gallop

  let moving = false;
  if (!resting) {
    const mv = moveVector();
    if (mv.dx || mv.dy) {
      moving = true;
      s.heading = Math.atan2(mv.dy, mv.dx);
      const g = GAITS[s.gait];
      const bondTop = 0.9 + m.bond / 500;
      const target = g.speed * wx.speedMul * bondTop * (m.health < 30 ? 0.6 : 1);
      s.speed = lerp(s.speed, target, 1 - Math.pow(0.001, dt));
    } else {
      s.speed = lerp(s.speed, 0, 1 - Math.pow(0.0001, dt));
    }
  } else {
    s.speed = 0;
  }

  if (s.speed > 1 && moving) {
    let nx = s.x + Math.cos(s.heading) * s.speed * dt;
    let ny = s.y + Math.sin(s.heading) * s.speed * dt;
    // rock collision (soft)
    for (const r of s.world.rocks) {
      if (dist(nx, ny, r.x, r.y) < r.r + 14) {
        const a = Math.atan2(ny - r.y, nx - r.x);
        nx = r.x + Math.cos(a) * (r.r + 14);
        ny = r.y + Math.sin(a) * (r.r + 14);
      }
    }
    nx = clamp(nx, 20, WORLD - 20);
    ny = clamp(ny, 20, WORLD - 20);
    s.traveled += dist(s.x, s.y, nx, ny);
    s.x = nx; s.y = ny;
    // dust when fast
    if (s.gait >= 2 && Math.random() < dt * 30) {
      s.dust.push({ x: s.x - Math.cos(s.heading) * 16, y: s.y - Math.sin(s.heading) * 16, life: 0.6, r: rand(3, 7) });
    }
  }
  s.dust = s.dust.filter((d) => (d.life -= dt) > 0);

  // ---- stamina ----
  const g = GAITS[s.gait];
  const regenMul = (0.8 + m.bond / 125) * (m.hunger > 30 ? 1 : 0.5) * (m.thirst > 30 ? 1 : 0.6);
  if (resting) {
    m.stamina = clamp(m.stamina + 22 * dt, 0, 100);
  } else if (moving && g.drain > 0) {
    m.stamina = clamp(m.stamina - (g.drain + wx.staDrain) * dt, 0, 100);
    if (m.stamina <= 0 && s.gait >= 2 && s.blown <= 0) {
      s.blown = 3;
      m.health = clamp(m.health - 4, 0, 100);
      m.bond = clamp(m.bond - 4, 0, 100);
      toast(`${s.horse} is blown — you pushed too hard.`);
    }
  } else {
    const maxSta = m.energy < 20 ? 60 : 100;
    m.stamina = clamp(m.stamina + (moving ? 3 : 7) * regenMul * dt, 0, maxSta);
  }

  // ---- care actions (hold Space) ----
  const water = nearestWater();
  const canDrink = water.edge < 26 && s.speed < 30;
  const canGraze = onLush() && s.speed < 30;
  const acting = keys.has(" ") && !resting;
  let careHint = "";
  if (canDrink) careHint = `Hold <b>Space</b> to water ${s.horse}.`;
  else if (canGraze) careHint = `Hold <b>Space</b> to graze.`;
  else if (nearForest()) careHint = `Press <b>F</b> to gather wood (have ${s.wood}).`;

  if (acting && canDrink) {
    m.thirst = clamp(m.thirst + 30 * dt, 0, 100);
    m.bond = clamp(m.bond + 1.2 * dt, 0, 100);
  } else if (acting && canGraze) {
    m.hunger = clamp(m.hunger + 18 * dt, 0, 100);
    m.bond = clamp(m.bond + 0.8 * dt, 0, 100);
  }

  // ---- passive meter decay ----
  const exert = moving ? [0.4, 0.8, 1.5, 2.4][s.gait] : 0.3;
  if (!acting || !canGraze) m.hunger = clamp(m.hunger - (0.22 + exert * 0.12) * dt * timeScale, 0, 100);
  if (!acting || !canDrink) m.thirst = clamp(m.thirst - (0.3 + exert * 0.16) * wx.thirst * dt * timeScale, 0, 100);
  m.energy = clamp(m.energy - (resting ? -14 : (night ? 0.4 : 0.16) + exert * 0.08) * dt * timeScale, 0, 100);

  // ---- warmth ----
  let warmthTarget = wx.warmth;
  if (night) warmthTarget -= 28;
  if (s.y < s.world.snowY) warmthTarget -= 14; // cold northern reaches
  if (nearForest() && wx.warmth < 60) warmthTarget += 14; // shelter
  if (warmingFire) warmthTarget = 98;
  m.warmth = clamp(lerp(m.warmth, warmthTarget, 1 - Math.pow(0.4, dt)), 0, 100);

  // ---- health & bond ----
  let dmg = 0;
  if (m.hunger < 20) dmg += 0.6;
  if (m.thirst < 20) dmg += 0.8;
  if (m.warmth < 20) dmg += 0.7;
  if (m.energy < 8) dmg += 0.3;
  const healthy = m.hunger > 35 && m.thirst > 35 && m.warmth > 35 && m.energy > 20;
  const regen = healthy ? (resting ? 2.4 : 0.7) : 0;
  m.health = clamp(m.health + (regen - dmg) * dt * timeScale, 0, 100);

  if (resting) m.bond = clamp(m.bond + 1.6 * dt, 0, 100);
  else if (healthy && moving && s.gait <= 1) m.bond = clamp(m.bond + 0.06 * dt, 0, 100);
  if (m.health < 30) m.bond = clamp(m.bond - 0.2 * dt * timeScale, 0, 100);

  // ---- waypoints ----
  const wp = s.world.waypoints[s.wpIndex];
  if (wp && dist(s.x, s.y, wp.x, wp.y) < 70) {
    s.wpIndex++;
    m.bond = clamp(m.bond + 3, 0, 100);
    if (s.wpIndex >= s.world.waypoints.length) return finish(true);
    toast(`Waypoint reached. ${s.world.waypoints.length - s.wpIndex} to go.`);
  }

  if (m.health <= 0) return finish(false);

  // ---- prompt & advice ----
  toastTimer -= dt;
  if (toastTimer <= 0) state.prompt = careHint;
  s.adviceTimer -= dt;
  if (s.adviceTimer <= 0) { s.adviceTimer = 0.6; s.advice = makeAdvice(night); }
}

function makeAdvice(night) {
  const s = state, m = s.m;
  if (m.thirst < 32) return "Your horse is parched — ride to water (blue pools).";
  if (m.hunger < 32) return "Hunger bites — halt on lush grass and graze (Space).";
  if (m.warmth < 30 || (night && !nearCampLit())) return "Cold is closing in — gather wood (F), build a fire (C), rest (R).";
  if (m.stamina < 22) return "Ease down to a Walk (1) and let the legs recover.";
  if (["Snow", "Storm", "Rain"].includes(s.weatherNext)) return `${s.weatherNext} on the wind — water, graze and camp before it hits.`;
  if (m.bond > 75) return `${s.horse} trusts you fully — you can ask for more.`;
  return `Hold your line at ${GAITS[s.gait].name} toward the marker.`;
}

// ---- rendering -----------------------------------------------------------
function camera() {
  const cx = clamp(state.x - W / 2, 0, WORLD - W);
  const cy = clamp(state.y - H / 2, 0, WORLD - H);
  return { cx: WORLD > W ? cx : (WORLD - W) / 2, cy: WORLD > H ? cy : (WORLD - H) / 2 };
}

function render() {
  const s = state;
  const { cx, cy } = camera();
  ctx.clearRect(0, 0, W, H);

  // ground
  const grd = ctx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, "#6e7d4a");
  grd.addColorStop(1, "#586b3c");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(-cx, -cy);

  // snow band (north)
  if (cy < s.world.snowY) {
    ctx.fillStyle = "rgba(230,238,245,0.35)";
    ctx.fillRect(0, 0, WORLD, s.world.snowY);
  }

  // lush grass
  for (const l of s.world.lush) {
    if (!inView(l.x, l.y, cx, cy, l.r + 40)) continue;
    ctx.fillStyle = "rgba(120,150,70,0.55)";
    ctx.beginPath(); ctx.ellipse(l.x, l.y, l.r, l.r * 0.7, 0, 0, 7); ctx.fill();
  }
  // water
  for (const w of s.world.waters) {
    if (!inView(w.x, w.y, cx, cy, w.r + 40)) continue;
    ctx.fillStyle = "#3c6b86";
    ctx.beginPath(); ctx.ellipse(w.x, w.y, w.r, w.r * 0.7, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(180,220,235,0.5)"; ctx.lineWidth = 2; ctx.stroke();
  }
  // waypoint markers + guide line
  const wp = s.world.waypoints[s.wpIndex];
  if (wp) {
    ctx.strokeStyle = "rgba(216,178,90,0.5)"; ctx.setLineDash([10, 12]); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(wp.x, wp.y); ctx.stroke(); ctx.setLineDash([]);
  }
  s.world.waypoints.forEach((p, i) => {
    if (i < s.wpIndex) return;
    if (!inView(p.x, p.y, cx, cy, 80)) return;
    const active = i === s.wpIndex;
    ctx.fillStyle = active ? "rgba(216,178,90,0.9)" : "rgba(216,178,90,0.4)";
    ctx.beginPath(); ctx.arc(p.x, p.y, active ? 16 : 11, 0, 7); ctx.fill();
    ctx.fillStyle = "#2a1c0e"; ctx.font = "bold 14px Cinzel, serif"; ctx.textAlign = "center";
    ctx.fillText(String(i + 1), p.x, p.y + 5);
  });
  // forests
  for (const f of s.world.forests) {
    if (!inView(f.x, f.y, cx, cy, f.r + 60)) continue;
    for (const t of f.trees) drawTree(f.x + t.dx, f.y + t.dy, t.s);
  }
  // rocks
  for (const r of s.world.rocks) {
    if (!inView(r.x, r.y, cx, cy, r.r + 20)) continue;
    ctx.fillStyle = "#7d7466";
    ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r, r.r * 0.8, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.15)"; ctx.beginPath(); ctx.ellipse(r.x, r.y + r.r * 0.4, r.r * 0.8, r.r * 0.4, 0, 0, 7); ctx.fill();
  }
  // dust
  for (const d of s.dust) {
    ctx.fillStyle = `rgba(180,160,120,${d.life * 0.5})`;
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 7); ctx.fill();
  }
  // campfire
  if (s.camp) drawCampfire(s.camp);
  // horse + rider
  drawHorse();

  ctx.restore();

  // weather overlays (screen space)
  drawWeather();
  drawDayNight();
  drawVignette();
}

function inView(x, y, cx, cy, pad) {
  return x > cx - pad && x < cx + W + pad && y > cy - pad && y < cy + H + pad;
}

function drawTree(x, y, s) {
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath(); ctx.ellipse(x, y + 6 * s, 14 * s, 6 * s, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "#5a3f22";
  ctx.fillRect(x - 2 * s, y - 4 * s, 4 * s, 12 * s);
  ctx.fillStyle = "#3f6d33";
  ctx.beginPath(); ctx.arc(x, y - 8 * s, 13 * s, 0, 7); ctx.fill();
  ctx.fillStyle = "#4f8140";
  ctx.beginPath(); ctx.arc(x - 5 * s, y - 12 * s, 8 * s, 0, 7); ctx.fill();
}

function drawCampfire(c) {
  const lit = c.fuel > 0;
  ctx.fillStyle = "#3a2b1a";
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * 7;
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(a);
    ctx.fillRect(-2, 6, 4, 14); ctx.restore();
  }
  if (lit) {
    const t = performance.now() / 120;
    for (let i = 0; i < 6; i++) {
      const fl = 1 + Math.sin(t + i) * 0.3;
      ctx.fillStyle = i % 2 ? "rgba(255,170,40,0.9)" : "rgba(255,90,20,0.85)";
      ctx.beginPath();
      ctx.ellipse(c.x + Math.sin(t + i) * 3, c.y - i * 3, 7 - i, (12 - i) * fl, 0, 0, 7);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255,180,80,0.12)";
    ctx.beginPath(); ctx.arc(c.x, c.y, 90, 0, 7); ctx.fill();
  }
}

function drawHorse() {
  const s = state;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.heading + Math.PI / 2); // sprite drawn facing "up"

  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath(); ctx.ellipse(0, 4, 16, 26, 0, 0, 7); ctx.fill();

  // legs (animated by gait cadence)
  const g = GAITS[s.gait];
  const t = performance.now() / 1000;
  const moving = s.speed > 4;
  const phase = t * g.cadence * Math.PI * 2;
  const amp = moving ? g.amp : 1.5;
  const legs = [
    { x: -8, y: -14, o: 0 },
    { x: 8, y: -14, o: Math.PI },
    { x: -9, y: 12, o: Math.PI * 0.5 },
    { x: 9, y: 12, o: Math.PI * 1.5 },
  ];
  ctx.strokeStyle = "#3a2411"; ctx.lineWidth = 4; ctx.lineCap = "round";
  for (const l of legs) {
    const swing = Math.sin(phase + l.o) * amp;
    ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(l.x, l.y + 10 + swing); ctx.stroke();
  }

  // body bob
  const bob = moving ? Math.sin(phase) * (g.amp * 0.12) : 0;
  ctx.save(); ctx.translate(0, bob);

  // tail
  const sway = Math.sin(t * 3) * 4;
  ctx.strokeStyle = "#2a1a0c"; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(0, 18); ctx.quadraticCurveTo(sway, 26, sway * 1.5, 34); ctx.stroke();

  // body
  ctx.fillStyle = "#6b4a2a";
  ctx.beginPath(); ctx.ellipse(0, 0, 13, 22, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = "#4a3018"; ctx.lineWidth = 2; ctx.stroke();

  // neck + head
  ctx.fillStyle = "#6b4a2a";
  ctx.beginPath(); ctx.moveTo(-6, -16); ctx.lineTo(6, -16); ctx.lineTo(4, -30); ctx.lineTo(-4, -30); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, -32, 6, 9, 0, 0, 7); ctx.fill();
  // mane
  ctx.strokeStyle = "#2a1a0c"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(0, -28); ctx.stroke();

  // rider
  ctx.fillStyle = "#6d5636"; // cloak
  ctx.beginPath(); ctx.ellipse(0, -2, 8, 11, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "#caa06a"; // head
  ctx.beginPath(); ctx.arc(0, -8, 4.5, 0, 7); ctx.fill();

  ctx.restore();
  ctx.restore();
}

// weather particles + sky
let wxParticles = [];
function drawWeather() {
  const s = state;
  const kind = s.weather;
  if (kind === "Rain" || kind === "Storm") {
    while (wxParticles.length < (kind === "Storm" ? 260 : 160)) wxParticles.push(newDrop());
    ctx.strokeStyle = "rgba(180,200,220,0.5)"; ctx.lineWidth = 1.4;
    for (const p of wxParticles) {
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 2, p.y + p.len); ctx.stroke();
      p.y += p.v; p.x -= 2;
      if (p.y > H) { p.y = -10; p.x = Math.random() * W; }
    }
  } else if (kind === "Snow") {
    while (wxParticles.length < 200) wxParticles.push(newFlake());
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (const p of wxParticles) {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
      p.y += p.v; p.x += Math.sin((p.y + p.o) / 40) * 0.6;
      if (p.y > H) { p.y = -10; p.x = Math.random() * W; }
    }
  } else {
    wxParticles = [];
  }
  if (kind === "Fog") {
    ctx.fillStyle = "rgba(200,205,210,0.28)";
    ctx.fillRect(0, 0, W, H);
  }
  if (s.lightning > 0) {
    ctx.fillStyle = `rgba(255,255,255,${s.lightning * 3})`;
    ctx.fillRect(0, 0, W, H);
  }
}
function newDrop() { return { x: Math.random() * W, y: Math.random() * H, len: rand(10, 18), v: rand(9, 14) }; }
function newFlake() { return { x: Math.random() * W, y: Math.random() * H, r: rand(1.2, 2.8), v: rand(1, 2.4), o: rand(0, 100) }; }

function drawDayNight() {
  const h = state.hour;
  let a = 0, col = "10,16,40";
  if (h < 5) a = 0.62;
  else if (h < 7) { a = lerp(0.62, 0, (h - 5) / 2); col = "60,40,80"; }
  else if (h < 17.5) a = 0;
  else if (h < 20.5) { a = lerp(0, 0.55, (h - 17.5) / 3); col = "70,45,55"; }
  else a = 0.62;
  if (a > 0) { ctx.fillStyle = `rgba(${col},${a})`; ctx.fillRect(0, 0, W, H); }
}

function drawVignette() {
  const wx = WEATHER[state.weather];
  const night = state.hour < 5.5 || state.hour > 20.5;
  let vis = wx.visMul * (night ? 0.7 : 1);
  const inner = Math.min(W, H) * 0.28 * vis + 60;
  const outer = Math.max(W, H) * 0.75;
  const g = ctx.createRadialGradient(W / 2, H / 2, inner, W / 2, H / 2, outer);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${clamp(1 - vis + 0.35, 0.35, 0.9)})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

// ---- minimap -------------------------------------------------------------
function renderMinimap() {
  const s = state, S = 180 / WORLD;
  mm.clearRect(0, 0, 180, 180);
  mm.fillStyle = "#3a4a2a"; mm.fillRect(0, 0, 180, 180);
  mm.fillStyle = "rgba(230,238,245,0.4)"; mm.fillRect(0, 0, 180, s.world.snowY * S);
  mm.fillStyle = "#2f5a72";
  for (const w of s.world.waters) { mm.beginPath(); mm.arc(w.x * S, w.y * S, Math.max(2, w.r * S), 0, 7); mm.fill(); }
  mm.fillStyle = "#2f5326";
  for (const f of s.world.forests) { mm.beginPath(); mm.arc(f.x * S, f.y * S, Math.max(2, f.r * S * 0.6), 0, 7); mm.fill(); }
  s.world.waypoints.forEach((p, i) => {
    mm.fillStyle = i < s.wpIndex ? "rgba(216,178,90,0.35)" : (i === s.wpIndex ? "#f0c86a" : "rgba(216,178,90,0.6)");
    mm.beginPath(); mm.arc(p.x * S, p.y * S, 4, 0, 7); mm.fill();
  });
  if (s.camp) { mm.fillStyle = "#ff7a2a"; mm.beginPath(); mm.arc(s.camp.x * S, s.camp.y * S, 3, 0, 7); mm.fill(); }
  mm.fillStyle = "#fff"; mm.beginPath(); mm.arc(s.x * S, s.y * S, 3.5, 0, 7); mm.fill();
  mm.strokeStyle = "#2a1c0e"; mm.lineWidth = 1; mm.stroke();
}

// ---- HUD -----------------------------------------------------------------
function setBar(id, v) {
  const bar = el(id);
  bar.style.width = clamp(v, 0, 100) + "%";
  bar.parentElement.parentElement.classList.toggle("low", v < 22);
}
function updateHUD() {
  const s = state, m = s.m;
  setBar("bar-bond", m.bond); setBar("bar-stamina", m.stamina); setBar("bar-health", m.health);
  setBar("bar-hunger", m.hunger); setBar("bar-thirst", m.thirst);
  setBar("bar-energy", m.energy); setBar("bar-warmth", m.warmth);
  el("gait-label").textContent = s.blown > 0 ? "Blown" : (s.resting ? "Resting" : (s.speed > 4 ? GAITS[s.gait].name : "Halt"));

  const hh = Math.floor(s.hour), mmn = Math.floor((s.hour % 1) * 60);
  el("time-label").textContent = `${String(hh).padStart(2, "0")}:${String(mmn).padStart(2, "0")}`;
  el("day-label").textContent = `Day ${s.day}`;
  el("weather-now").textContent = `${WEATHER_ICON[s.weather]} ${s.weather}`;
  el("weather-next").textContent = `${WEATHER_ICON[s.weatherNext]} ${s.weatherNext}`;

  const wp = s.world.waypoints[s.wpIndex];
  el("wp-index").textContent = String(Math.min(s.wpIndex + 1, s.world.waypoints.length));
  if (wp) {
    const d = dist(s.x, s.y, wp.x, wp.y);
    el("wp-dist").textContent = Math.round(d * METERS_PER_PX);
    const ang = Math.atan2(wp.y - s.y, wp.x - s.x);
    el("wp-dir").style.transform = `rotate(${ang + Math.PI / 2}rad)`;
  }
  el("advice").textContent = s.advice;

  const p = el("prompt");
  p.innerHTML = s.prompt || "";
  p.classList.toggle("show", !!s.prompt);
}

// ---- end / journal -------------------------------------------------------
async function finish(won) {
  if (state.over) return;
  state.over = true;
  state.won = won;
  const s = state, m = s.m;
  el("end-title").textContent = won ? "YOU MADE IT" : `${s.horse.toUpperCase()} HAS FALLEN`;
  el("end-msg").textContent = won
    ? `Across ${s.day} day(s) and the open steppe, you and ${s.horse} reached the last waypoint together. The bond held.`
    : `The cold and the road were too much. ${s.horse} could go no further. Ride gentler next time — read the weather, and rest before the storm.`;
  el("end-stats").innerHTML = `
    <li><span class="k">Waypoints</span><span class="v">${s.wpIndex}/${s.world.waypoints.length}</span></li>
    <li><span class="k">Distance</span><span class="v">${Math.round(s.traveled * METERS_PER_PX)} m</span></li>
    <li><span class="k">Days</span><span class="v">${s.day}</span></li>
    <li><span class="k">Bond</span><span class="v">${Math.round(m.bond)}</span></li>`;
  el("end").classList.remove("hidden");
  try {
    const res = await fetch("/api/expeditions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: s.rider, horse: s.horse, days: s.day,
        distanceKm: Math.round(s.traveled * METERS_PER_PX),
        bond: Math.round(m.bond), waypoints: s.wpIndex,
        outcome: won ? "arrived" : "lost",
      }),
    });
    const data = await res.json();
    renderJournal(data.log || []);
  } catch {
    loadJournal();
  }
}
function renderJournal(log) {
  const j = el("journal");
  if (!log.length) { j.innerHTML = '<li class="j-empty">no expeditions logged yet</li>'; return; }
  j.innerHTML = "";
  log.slice(0, 8).forEach((e) => {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.className = "j-name";
    name.textContent = `${e.name} & ${e.horse} — ${e.waypoints} wp, ${e.distanceKm} m ${e.outcome === "lost" ? "†" : "✓"}`;
    const bond = document.createElement("span");
    bond.className = "j-bond";
    bond.textContent = `♥ ${e.bond}`;
    li.append(name, bond);
    j.appendChild(li);
  });
}
async function loadJournal() {
  try { renderJournal(await (await fetch("/api/expeditions")).json()); } catch { renderJournal([]); }
}

// ---- loop ----------------------------------------------------------------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state && !state.over) {
    update(dt);
    render();
    renderMinimap();
    updateHUD();
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---- boot ----------------------------------------------------------------
el("btn-begin").addEventListener("click", () => {
  resetGame(el("rider-name").value.trim(), el("horse-input").value.trim());
  el("start").classList.add("hidden");
  last = performance.now();
});
el("btn-restart").addEventListener("click", () => {
  el("end").classList.add("hidden");
  el("start").classList.remove("hidden");
});
loadJournal();
