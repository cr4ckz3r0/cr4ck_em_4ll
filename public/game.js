// THE LONG RIDE — first-person 3D 13th-century horseback survival.
// Three.js scene with mouse-look (incl. sky), real gaits, a bond with your mount,
// survival care, campfire rest, dynamic weather + forecast, and route planning.
import * as THREE from "three";
import { PointerLockControls } from "./vendor/PointerLockControls.js";
import { Sky } from "./vendor/Sky.js";

const el = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

const WORLD = 4000;
const METERS_PER_UNIT = 0.5;
const DAY_LENGTH_SEC = 200;
const EYE = 3.6;
const SNOW_Z = WORLD * 0.28;

// ---- gaits ---------------------------------------------------------------
const GAITS = [
  { name: "Walk", speed: 12, drain: -3, cadence: 1.5, bob: 0.10 },
  { name: "Trot", speed: 27, drain: 2.2, cadence: 2.6, bob: 0.22 },
  { name: "Canter", speed: 46, drain: 6.5, cadence: 2.2, bob: 0.34 },
  { name: "Gallop", speed: 72, drain: 13, cadence: 3.1, bob: 0.5 },
];

// ---- weather -------------------------------------------------------------
const WEATHER = {
  Clear:  { warmth: 86, vis: 1.0, speedMul: 1.0, staDrain: 0, thirst: 1.25, fog: 0.00025 },
  Cloudy: { warmth: 68, vis: 0.9, speedMul: 1.0, staDrain: 0, thirst: 1.0, fog: 0.0005 },
  Rain:   { warmth: 46, vis: 0.6, speedMul: 0.9, staDrain: 0.6, thirst: 0.8, fog: 0.0011 },
  Fog:    { warmth: 60, vis: 0.4, speedMul: 0.95, staDrain: 0.2, thirst: 0.9, fog: 0.0028 },
  Snow:   { warmth: 26, vis: 0.55, speedMul: 0.8, staDrain: 1.0, thirst: 0.7, fog: 0.0016 },
  Storm:  { warmth: 30, vis: 0.5, speedMul: 0.84, staDrain: 1.4, thirst: 0.85, fog: 0.0015 },
};
const WEATHER_KEYS = Object.keys(WEATHER);
const WEATHER_ICON = { Clear: "☀", Cloudy: "☁", Rain: "🌧", Fog: "🌫", Snow: "❄", Storm: "⛈" };

// ---- terrain -------------------------------------------------------------
function terrainH(x, z) {
  return (
    14 * Math.sin(x * 0.0016) * Math.cos(z * 0.0013) +
    7 * Math.sin(x * 0.004 + 2.1) * Math.sin(z * 0.0037) +
    3 * Math.sin(x * 0.011 + 1.0)
  );
}

// ---- world data ----------------------------------------------------------
const world = (() => {
  const waters = [];
  for (let i = 0; i < 9; i++) waters.push({ x: rand(300, WORLD - 300), z: rand(300, WORLD - 300), r: rand(45, 120) });
  const lush = [];
  for (let i = 0; i < 22; i++) lush.push({ x: rand(200, WORLD - 200), z: rand(200, WORLD - 200), r: rand(28, 60) });
  const forests = [];
  const trees = [];
  for (let i = 0; i < 15; i++) {
    const fx = rand(250, WORLD - 250), fz = rand(250, WORLD - 250), r = rand(60, 140);
    forests.push({ x: fx, z: fz, r });
    const n = Math.floor(rand(12, 26));
    for (let t = 0; t < n; t++) {
      const a = rand(0, 7), rr = Math.sqrt(Math.random()) * r;
      trees.push({ x: fx + Math.cos(a) * rr, z: fz + Math.sin(a) * rr, s: rand(0.8, 1.7) });
    }
  }
  for (let i = 0; i < 60; i++) trees.push({ x: rand(100, WORLD - 100), z: rand(100, WORLD - 100), s: rand(0.7, 1.3) });
  const rocks = [];
  for (let i = 0; i < 46; i++) rocks.push({ x: rand(150, WORLD - 150), z: rand(150, WORLD - 150), r: rand(1.6, 4.5) });
  const start = { x: WORLD * 0.5, z: WORLD * 0.84 };
  const waypoints = [
    { x: WORLD * 0.3, z: WORLD * 0.64 },
    { x: WORLD * 0.64, z: WORLD * 0.48 },
    { x: WORLD * 0.36, z: WORLD * 0.28 },
    { x: WORLD * 0.7, z: WORLD * 0.12 },
  ];
  return { waters, lush, forests, trees, rocks, start, waypoints };
})();

// ---- three.js setup ------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.5;
el("game").appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xbfc9d4, 0.0006);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.5, 20000);
camera.position.set(world.start.x, terrainH(world.start.x, world.start.z) + EYE, world.start.z);

const controls = new PointerLockControls(camera, renderer.domElement);

// lights
const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x4b5a34, 0.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
scene.add(sun);
scene.add(sun.target);
const ambient = new THREE.AmbientLight(0x8899aa, 0.25);
scene.add(ambient);

// sky
const sky = new Sky();
sky.scale.setScalar(12000);
scene.add(sky);
sky.material.uniforms.turbidity.value = 8;
sky.material.uniforms.rayleigh.value = 2;
sky.material.uniforms.mieCoefficient.value = 0.005;
sky.material.uniforms.mieDirectionalG.value = 0.8;
const sunVec = new THREE.Vector3();

// stars
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(1500 * 3);
for (let i = 0; i < 1500; i++) {
  const r = 8000, u = Math.random(), v = Math.random();
  const th = 2 * Math.PI * u, ph = Math.acos(2 * v - 1);
  starPos[i * 3] = world.start.x + r * Math.sin(ph) * Math.cos(th);
  starPos[i * 3 + 1] = Math.abs(r * Math.cos(ph)) + 200;
  starPos[i * 3 + 2] = world.start.z + r * Math.sin(ph) * Math.sin(th);
}
starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 18, sizeAttenuation: true, transparent: true, opacity: 0 }));
scene.add(stars);

// ground
(function buildGround() {
  const seg = 200;
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, seg, seg);
  geo.rotateX(-Math.PI / 2);
  geo.translate(WORLD / 2, 0, WORLD / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainH(x, z);
    pos.setY(i, h);
    let g = 0.30 + Math.random() * 0.06;
    c.setRGB(0.16 + g * 0.2, 0.30 + g, 0.12 + g * 0.15);
    if (z < SNOW_Z) {
      const t = clamp((SNOW_Z - z) / (SNOW_Z * 0.6), 0, 1);
      c.lerp(new THREE.Color(0xdfe8ef), t * 0.85);
    }
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  scene.add(new THREE.Mesh(geo, mat));
})();

// lush grass patches (darker discs)
for (const l of world.lush) {
  const g = new THREE.CircleGeometry(l.r, 18);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.MeshStandardMaterial({ color: 0x4d6f24, roughness: 1, transparent: true, opacity: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(l.x, terrainH(l.x, l.z) + 0.25, l.z);
  scene.add(mesh);
}

// water ponds
for (const w of world.waters) {
  const g = new THREE.CircleGeometry(w.r, 28);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.MeshStandardMaterial({ color: 0x2f5f78, roughness: 0.2, metalness: 0.2, transparent: true, opacity: 0.9 });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(w.x, terrainH(w.x, w.z) - 0.4, w.z);
  scene.add(mesh);
}

// trees (instanced)
(function buildTrees() {
  const N = world.trees.length;
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 6, 6); trunkGeo.translate(0, 3, 0);
  const foliageGeo = new THREE.ConeGeometry(4.2, 12, 8); foliageGeo.translate(0, 11, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3f22, roughness: 1 });
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0x3f6d33, roughness: 1 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, N);
  const foliage = new THREE.InstancedMesh(foliageGeo, foliageMat, N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const t = world.trees[i];
    p.set(t.x, terrainH(t.x, t.z), t.z);
    q.setFromEuler(new THREE.Euler(0, rand(0, 7), 0));
    s.set(t.s, t.s * rand(0.9, 1.2), t.s);
    m.compose(p, q, s);
    trunks.setMatrixAt(i, m); foliage.setMatrixAt(i, m);
    col.setHSL(0.28, 0.4, rand(0.28, 0.42)); foliage.setColorAt(i, col);
  }
  scene.add(trunks); scene.add(foliage);
})();

// rocks (instanced)
(function buildRocks() {
  const N = world.rocks.length;
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x7d7466, roughness: 1, flatShading: true });
  const inst = new THREE.InstancedMesh(geo, mat, N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const r = world.rocks[i];
    p.set(r.x, terrainH(r.x, r.z) + r.r * 0.4, r.z);
    q.setFromEuler(new THREE.Euler(rand(0, 3), rand(0, 7), rand(0, 3)));
    s.set(r.r, r.r * 0.8, r.r);
    m.compose(p, q, s); inst.setMatrixAt(i, m);
  }
  scene.add(inst);
})();

// waypoint beacons
const beacons = world.waypoints.map((wp) => {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, 80, 12),
    new THREE.MeshBasicMaterial({ color: 0xf0c86a, transparent: true, opacity: 0.32, depthWrite: false })
  );
  beam.position.y = 40;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(4, 0.5, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0xf0c86a, emissive: 0xd8a83a, emissiveIntensity: 1.2, roughness: 0.4 })
  );
  ring.rotation.x = Math.PI / 2; ring.position.y = 3;
  const light = new THREE.PointLight(0xffcf7a, 2, 120, 2);
  light.position.y = 6;
  group.add(beam, ring, light);
  group.position.set(wp.x, terrainH(wp.x, wp.z), wp.z);
  scene.add(group);
  return { group, ring };
});

// campfire (reusable)
const campfire = (() => {
  const group = new THREE.Group();
  const logMat = new THREE.MeshStandardMaterial({ color: 0x3a2b1a, roughness: 1 });
  for (let i = 0; i < 5; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 3, 5), logMat);
    log.rotation.z = Math.PI / 2; log.rotation.y = (i / 5) * Math.PI * 2;
    log.position.y = 0.3; group.add(log);
  }
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(1.1, 3, 8),
    new THREE.MeshBasicMaterial({ color: 0xff8c2a, transparent: true, opacity: 0.9 })
  );
  flame.position.y = 1.6; group.add(flame);
  const light = new THREE.PointLight(0xff8a3a, 3, 140, 2);
  light.position.y = 2.5; group.add(light);
  group.visible = false;
  scene.add(group);
  return { group, flame, light };
})();

// weather particles
const wxCount = 1400;
const wxGeo = new THREE.BufferGeometry();
const wxOff = new Float32Array(wxCount * 3);
for (let i = 0; i < wxCount; i++) {
  wxOff[i * 3] = rand(-70, 70);
  wxOff[i * 3 + 1] = rand(0, 90);
  wxOff[i * 3 + 2] = rand(-70, 70);
}
wxGeo.setAttribute("position", new THREE.BufferAttribute(wxOff, 3));
const wxMat = new THREE.PointsMaterial({ color: 0xaac2d6, size: 1.1, sizeAttenuation: true, transparent: true, opacity: 0.75 });
const wxPoints = new THREE.Points(wxGeo, wxMat);
wxPoints.frustumCulled = false;
wxPoints.visible = false;
scene.add(wxPoints);

// horse head/neck rig (first-person mount)
const horseRig = new THREE.Group();
(function buildHorse() {
  const hide = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a1a0c, roughness: 1 });
  // withers / shoulders (in front of rider)
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 10), hide);
  shoulders.scale.set(1.3, 1, 1.6); shoulders.position.set(0, 2.0, -2.2);
  // neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.15, 3.2, 10), hide);
  neck.position.set(0, 2.7, -3.4); neck.rotation.x = -Math.PI / 3.4;
  // head
  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.0, 2.1), hide);
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.9), hide);
  muzzle.position.set(0, -0.1, -1.3);
  const earL = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 6), hide); earL.position.set(-0.35, 0.7, 0.6);
  const earR = earL.clone(); earR.position.x = 0.35;
  head.add(skull, muzzle, earL, earR);
  head.position.set(0, 3.55, -4.7); head.rotation.x = 0.32;
  // mane
  const mane = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.6, 3.0), dark);
  mane.position.set(0, 3.0, -3.5); mane.rotation.x = -Math.PI / 3.4;
  horseRig.add(shoulders, neck, head, mane);
  horseRig.userData.head = head;
})();
scene.add(horseRig);

// ---- state ---------------------------------------------------------------
let state = null;
function resetGame(riderName, horseName) {
  state = {
    rider: riderName || "rider",
    horse: horseName || "companion",
    x: world.start.x, z: world.start.z,
    speed: 0, gait: 1, blown: 0,
    m: { bond: 42, stamina: 100, health: 100, hunger: 85, thirst: 85, energy: 90, warmth: 80 },
    hour: 6, day: 1,
    weather: "Clear", weatherNext: "Cloudy", wxTime: rand(30, 55),
    camp: null, wood: 2, resting: false,
    wpIndex: 0, traveled: 0,
    prompt: "", advice: "Ride toward the golden beacon.", adviceTimer: 0,
    lightning: 0, phase: 0, over: false, won: false,
  };
  camera.position.set(world.start.x, terrainH(world.start.x, world.start.z) + EYE, world.start.z);
  camera.rotation.set(0, 0, 0);
  campfire.group.visible = false;
  beacons.forEach((b) => (b.group.visible = true));
  el("horse-name").textContent = state.horse;
  el("wp-total").textContent = String(world.waypoints.length);
}

// ---- input ---------------------------------------------------------------
const keys = new Set();
window.addEventListener("keydown", (e) => {
  if (!state || state.over) return;
  const k = e.key.toLowerCase();
  if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
  keys.add(k);
  if (k >= "1" && k <= "4") state.gait = Number(k) - 1;
  if (k === "f") gatherWood();
  if (k === "c") toggleCampfire();
  if (k === "r") toggleRest();
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

renderer.domElement.addEventListener("click", () => {
  if (state && !state.over && !controls.isLocked) controls.lock();
});
controls.addEventListener("lock", () => {
  el("lock-hint").classList.add("hidden");
  el("crosshair").classList.remove("hidden");
});
controls.addEventListener("unlock", () => {
  if (state && !state.over) el("lock-hint").classList.remove("hidden");
  el("crosshair").classList.add("hidden");
});

// ---- interactions --------------------------------------------------------
function nearestWaterEdge() {
  let bd = Infinity;
  for (const w of world.waters) bd = Math.min(bd, dist2(state.x, state.z, w.x, w.z) - w.r);
  return bd;
}
function onLush() {
  for (const l of world.lush) if (dist2(state.x, state.z, l.x, l.z) < l.r) return true;
  return false;
}
function nearForest() {
  for (const f of world.forests) if (dist2(state.x, state.z, f.x, f.z) < f.r + 12) return true;
  return false;
}
function nearCampLit() {
  return state.camp && state.camp.fuel > 0 && dist2(state.x, state.z, state.camp.x, state.camp.z) < 16;
}
function gatherWood() {
  if (state.resting || state.speed > 6) return;
  if (nearForest() && state.wood < 6) { state.wood++; toast(`Gathered wood (${state.wood}).`); }
  else if (!nearForest()) toast("No trees near enough for wood.");
}
function toggleCampfire() {
  if (state.resting || state.speed > 6) return;
  if (state.camp && state.camp.fuel > 0) {
    if (state.wood > 0) { state.wood--; state.camp.fuel = Math.min(100, state.camp.fuel + 45); toast("Fed the fire."); }
    return;
  }
  if (state.wood > 0) {
    state.wood--;
    state.camp = { x: state.x, z: state.z, fuel: 70 };
    campfire.group.position.set(state.x, terrainH(state.x, state.z), state.z);
    campfire.group.visible = true;
    toast("Campfire lit. Press R to rest.");
  } else toast("Need wood — press F near trees.");
}
function toggleRest() {
  if (state.resting) { state.resting = false; return; }
  if (nearCampLit() && state.speed < 6) { state.resting = true; toast("Resting by the fire…"); }
  else toast("Light a campfire first (C), then rest.");
}
let toastTimer = 0;
function toast(msg) { if (state) { state.prompt = msg; toastTimer = 2.4; } }

// ---- update --------------------------------------------------------------
const _dir = new THREE.Vector3();
function update(dt) {
  const s = state, m = s.m;
  const timeScale = s.resting ? 9 : 1;

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

  if (s.camp && s.camp.fuel > 0) s.camp.fuel = Math.max(0, s.camp.fuel - dt * timeScale * 1.4);
  if (s.camp && s.camp.fuel <= 0) campfire.group.visible = false;
  const warmingFire = nearCampLit();

  // resting exits on movement or dead fire
  if (s.resting && (!warmingFire || keys.has("w") || keys.has("s") || keys.has("a") || keys.has("d"))) s.resting = false;
  const resting = s.resting;

  // gait guards
  if (s.blown > 0) { s.blown -= dt; s.gait = 0; }
  if (m.stamina < 4 && s.gait > 0) s.gait = 0;
  if (m.energy < 12 && s.gait > 2) s.gait = 2;

  // ---- movement (first person) ----
  let moving = false;
  if (!resting && controls.isLocked) {
    let f = 0, r = 0;
    if (keys.has("w") || keys.has("arrowup")) f += 1;
    if (keys.has("s") || keys.has("arrowdown")) f -= 1;
    if (keys.has("d") || keys.has("arrowright")) r += 1;
    if (keys.has("a") || keys.has("arrowleft")) r -= 1;
    if (f || r) {
      moving = true;
      const g = GAITS[s.gait];
      const bondTop = 0.9 + m.bond / 500;
      const target = g.speed * wx.speedMul * bondTop * (m.health < 30 ? 0.6 : 1);
      s.speed = lerp(s.speed, target, 1 - Math.pow(0.002, dt));
      const len = Math.hypot(f, r) || 1;
      const step = s.speed * dt;
      controls.moveForward((f / len) * step);
      controls.moveRight((r / len) * step);
    } else {
      s.speed = lerp(s.speed, 0, 1 - Math.pow(0.0001, dt));
    }
  } else {
    s.speed = lerp(s.speed, 0, 1 - Math.pow(0.0001, dt));
  }

  // clamp to world + rocks; track distance
  let nx = clamp(camera.position.x, 25, WORLD - 25);
  let nz = clamp(camera.position.z, 25, WORLD - 25);
  for (const rk of world.rocks) {
    const rr = rk.r + 4;
    if (dist2(nx, nz, rk.x, rk.z) < rr) {
      const a = Math.atan2(nz - rk.z, nx - rk.x);
      nx = rk.x + Math.cos(a) * rr; nz = rk.z + Math.sin(a) * rr;
    }
  }
  s.traveled += dist2(s.x, s.z, nx, nz);
  s.x = nx; s.z = nz;

  // head bob
  if (moving && s.speed > 1) s.phase += dt * GAITS[s.gait].cadence * Math.PI * 2 * (0.6 + s.speed / 60);
  const bob = moving ? Math.sin(s.phase) * GAITS[s.gait].bob : 0;
  camera.position.x = nx; camera.position.z = nz;
  camera.position.y = terrainH(nx, nz) + EYE + bob * 0.5;

  // horse rig follows yaw, sits on terrain, bobs
  const yaw = camera.rotation.y;
  horseRig.position.set(nx, terrainH(nx, nz) + bob * 0.4, nz);
  horseRig.rotation.y = yaw;
  horseRig.userData.head.rotation.x = 0.32 + Math.sin(s.phase * 0.5) * 0.04 + (moving ? 0.05 : 0);

  // ---- stamina ----
  const g = GAITS[s.gait];
  const regenMul = (0.8 + m.bond / 125) * (m.hunger > 30 ? 1 : 0.5) * (m.thirst > 30 ? 1 : 0.6);
  if (resting) m.stamina = clamp(m.stamina + 22 * dt, 0, 100);
  else if (moving && g.drain > 0) {
    m.stamina = clamp(m.stamina - (g.drain + wx.staDrain) * dt, 0, 100);
    if (m.stamina <= 0 && s.gait >= 2 && s.blown <= 0) {
      s.blown = 3; m.health = clamp(m.health - 4, 0, 100); m.bond = clamp(m.bond - 4, 0, 100);
      toast(`${s.horse} is blown — you pushed too hard.`);
    }
  } else {
    const maxSta = m.energy < 20 ? 60 : 100;
    m.stamina = clamp(m.stamina + (moving ? 3 : 7) * regenMul * dt, 0, maxSta);
  }

  // ---- care (hold Space) ----
  const canDrink = nearestWaterEdge() < 14 && s.speed < 8;
  const canGraze = onLush() && s.speed < 8;
  const acting = keys.has(" ") && !resting;
  let hint = "";
  if (canDrink) hint = `Hold <b>Space</b> to water ${s.horse}.`;
  else if (canGraze) hint = "Hold <b>Space</b> to graze.";
  else if (nearForest()) hint = `Press <b>F</b> for wood (have ${s.wood}), <b>C</b> for a campfire.`;
  if (acting && canDrink) { m.thirst = clamp(m.thirst + 30 * dt, 0, 100); m.bond = clamp(m.bond + 1.2 * dt, 0, 100); }
  else if (acting && canGraze) { m.hunger = clamp(m.hunger + 18 * dt, 0, 100); m.bond = clamp(m.bond + 0.8 * dt, 0, 100); }

  // ---- decay ----
  const exert = moving ? [0.4, 0.8, 1.5, 2.4][s.gait] : 0.3;
  if (!(acting && canGraze)) m.hunger = clamp(m.hunger - (0.22 + exert * 0.12) * dt * timeScale, 0, 100);
  if (!(acting && canDrink)) m.thirst = clamp(m.thirst - (0.3 + exert * 0.16) * wx.thirst * dt * timeScale, 0, 100);
  m.energy = clamp(m.energy - (resting ? -14 : (night ? 0.4 : 0.16) + exert * 0.08) * dt * timeScale, 0, 100);

  // ---- warmth ----
  let wt = wx.warmth;
  if (night) wt -= 28;
  if (nz < SNOW_Z) wt -= 14;
  if (nearForest() && wx.warmth < 60) wt += 14;
  if (warmingFire) wt = 98;
  m.warmth = clamp(lerp(m.warmth, wt, 1 - Math.pow(0.4, dt)), 0, 100);

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
  const wp = world.waypoints[s.wpIndex];
  if (wp && dist2(s.x, s.z, wp.x, wp.z) < 26) {
    if (beacons[s.wpIndex]) beacons[s.wpIndex].group.visible = false;
    s.wpIndex++;
    m.bond = clamp(m.bond + 3, 0, 100);
    if (s.wpIndex >= world.waypoints.length) return finish(true);
    toast(`Beacon reached. ${world.waypoints.length - s.wpIndex} to go.`);
  }
  if (m.health <= 0) return finish(false);

  // prompts + advice
  toastTimer -= dt;
  if (toastTimer <= 0) s.prompt = controls.isLocked ? hint : "";
  s.adviceTimer -= dt;
  if (s.adviceTimer <= 0) { s.adviceTimer = 0.6; s.advice = makeAdvice(night); }

  updateSky(night);
  updateWeatherFx(dt);
  // beacon spin
  beacons.forEach((b) => (b.ring.rotation.z += dt * 1.2));
  // campfire flicker
  if (campfire.group.visible) {
    const t = performance.now() / 90;
    campfire.flame.scale.y = 1 + Math.sin(t) * 0.25;
    campfire.light.intensity = 2.6 + Math.sin(t * 1.7) * 0.8;
  }
}

function makeAdvice(night) {
  const s = state, m = s.m;
  if (m.thirst < 32) return "Your horse is parched — ride to water (dark pools).";
  if (m.hunger < 32) return "Hunger bites — halt on lush grass and graze (Space).";
  if (m.warmth < 30 || (night && !nearCampLit())) return "Cold closing in — wood (F), campfire (C), rest (R).";
  if (m.stamina < 22) return "Ease to a Walk (1) and let the legs recover.";
  if (["Snow", "Storm", "Rain"].includes(s.weatherNext)) return `${s.weatherNext} on the wind — water, graze and camp before it hits.`;
  if (m.bond > 75) return `${s.horse} trusts you fully — you can ask for more.`;
  return `Hold your line at ${GAITS[s.gait].name} toward the beacon.`;
}

// ---- sky / lighting by time ---------------------------------------------
function updateSky(night) {
  const s = state;
  const elevDeg = 62 * Math.sin(((s.hour - 6) / 12) * Math.PI);
  const az = (s.hour / 24) * Math.PI * 2 + Math.PI;
  const phi = THREE.MathUtils.degToRad(90 - elevDeg);
  const theta = az;
  sunVec.setFromSphericalCoords(1, phi, theta);
  sky.material.uniforms.sunPosition.value.copy(sunVec);
  sun.position.set(s.x + sunVec.x * 1000, sunVec.y * 1000, s.z + sunVec.z * 1000);
  sun.target.position.set(s.x, 0, s.z);
  const dayF = clamp(Math.sin(THREE.MathUtils.degToRad(Math.max(0, elevDeg + 6))), 0, 1);
  sun.intensity = 0.2 + dayF * 2.6;
  hemi.intensity = 0.25 + dayF * 0.6;
  ambient.intensity = 0.15 + dayF * 0.2;
  renderer.toneMappingExposure = 0.18 + dayF * 0.42;
  const nightF = clamp(-elevDeg / 12, 0, 1);
  stars.material.opacity = nightF * 0.9;
  // fog colour + density by time & weather
  const wx = WEATHER[state.weather];
  const day = new THREE.Color(0xbfc9d4), dusk = new THREE.Color(0x6a5560), nite = new THREE.Color(0x0b1226);
  const fc = new THREE.Color();
  if (dayF > 0.15) fc.copy(day).lerp(dusk, 1 - dayF);
  else fc.copy(dusk).lerp(nite, clamp((0.15 - dayF) / 0.15, 0, 1));
  if (state.weather === "Snow") fc.lerp(new THREE.Color(0xd8dee6), 0.4);
  scene.fog.color.copy(fc);
  scene.fog.density = wx.fog * (night ? 1.5 : 1);
  scene.background = fc;
}

function updateWeatherFx(dt) {
  const kind = state.weather;
  const rainy = kind === "Rain" || kind === "Storm";
  const snowy = kind === "Snow";
  wxPoints.visible = rainy || snowy;
  if (!wxPoints.visible) return;
  wxMat.color.set(snowy ? 0xffffff : 0xaac2d6);
  wxMat.size = snowy ? 1.7 : 1.1;
  const fall = snowy ? 16 : 65;
  const windX = kind === "Storm" ? 20 : snowy ? 3 : 6;
  const pos = wxGeo.attributes.position.array;
  for (let i = 0; i < wxCount; i++) {
    pos[i * 3 + 1] -= fall * dt;
    pos[i * 3] -= windX * dt * (snowy ? Math.sin(i) : 1);
    if (pos[i * 3 + 1] < -10) {
      pos[i * 3 + 1] = 90;
      pos[i * 3] = rand(-70, 70);
      pos[i * 3 + 2] = rand(-70, 70);
    }
    if (pos[i * 3] < -70) pos[i * 3] += 140;
  }
  wxGeo.attributes.position.needsUpdate = true;
  wxPoints.position.set(camera.position.x, camera.position.y, camera.position.z);
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
  el("gait-label").textContent = s.blown > 0 ? "Blown" : s.resting ? "Resting" : s.speed > 3 ? GAITS[s.gait].name : `${GAITS[s.gait].name} · halt`;

  const hh = Math.floor(s.hour), mmn = Math.floor((s.hour % 1) * 60);
  el("time-label").textContent = `${String(hh).padStart(2, "0")}:${String(mmn).padStart(2, "0")}`;
  el("day-label").textContent = `Day ${s.day}`;
  el("weather-now").textContent = `${WEATHER_ICON[s.weather]} ${s.weather}`;
  el("weather-next").textContent = `${WEATHER_ICON[s.weatherNext]} ${s.weatherNext}`;

  const wp = world.waypoints[s.wpIndex];
  el("wp-index").textContent = String(Math.min(s.wpIndex + 1, world.waypoints.length));
  if (wp) {
    const d = dist2(s.x, s.z, wp.x, wp.z);
    el("wp-dist").textContent = Math.round(d * METERS_PER_UNIT);
    camera.getWorldDirection(_dir);
    const facing = Math.atan2(_dir.x, _dir.z);
    const toWp = Math.atan2(wp.x - s.x, wp.z - s.z);
    el("wp-dir").style.transform = `rotate(${toWp - facing}rad)`;
  }
  el("advice").textContent = s.advice;
  const p = el("prompt");
  p.innerHTML = s.prompt || "";
  p.classList.toggle("show", !!s.prompt);
}

// ---- minimap -------------------------------------------------------------
const mm = el("minimap").getContext("2d");
function renderMinimap() {
  const s = state, S = 180 / WORLD;
  mm.clearRect(0, 0, 180, 180);
  mm.fillStyle = "#3a4a2a"; mm.fillRect(0, 0, 180, 180);
  mm.fillStyle = "rgba(230,238,245,0.4)"; mm.fillRect(0, 0, 180, SNOW_Z * S);
  mm.fillStyle = "#2f5a72";
  for (const w of world.waters) { mm.beginPath(); mm.arc(w.x * S, w.z * S, Math.max(2, w.r * S), 0, 7); mm.fill(); }
  mm.fillStyle = "#2f5326";
  for (const f of world.forests) { mm.beginPath(); mm.arc(f.x * S, f.z * S, Math.max(2, f.r * S), 0, 7); mm.fill(); }
  world.waypoints.forEach((p, i) => {
    mm.fillStyle = i < s.wpIndex ? "rgba(216,178,90,0.3)" : i === s.wpIndex ? "#f0c86a" : "rgba(216,178,90,0.6)";
    mm.beginPath(); mm.arc(p.x * S, p.z * S, 4, 0, 7); mm.fill();
  });
  if (s.camp && s.camp.fuel > 0) { mm.fillStyle = "#ff7a2a"; mm.beginPath(); mm.arc(s.camp.x * S, s.camp.z * S, 3, 0, 7); mm.fill(); }
  // player arrow
  camera.getWorldDirection(_dir);
  const ang = Math.atan2(_dir.x, _dir.z);
  mm.save(); mm.translate(s.x * S, s.z * S); mm.rotate(-ang);
  mm.fillStyle = "#fff"; mm.beginPath(); mm.moveTo(0, -6); mm.lineTo(4, 5); mm.lineTo(-4, 5); mm.closePath(); mm.fill();
  mm.restore();
  mm.strokeStyle = "#2a1c0e"; mm.strokeRect(0, 0, 180, 180);
}

// ---- end / journal -------------------------------------------------------
async function finish(won) {
  if (state.over) return;
  state.over = true; state.won = won;
  if (controls.isLocked) controls.unlock();
  el("crosshair").classList.add("hidden");
  el("lock-hint").classList.add("hidden");
  const s = state, m = s.m;
  el("end-title").textContent = won ? "YOU MADE IT" : `${s.horse.toUpperCase()} HAS FALLEN`;
  el("end-msg").textContent = won
    ? `Across ${s.day} day(s) of open country, you and ${s.horse} reached the last beacon together. The bond held.`
    : `The cold and the road were too much. ${s.horse} could go no further. Ride gentler — read the weather, and rest before the storm.`;
  el("end-stats").innerHTML = `
    <li><span class="k">Beacons</span><span class="v">${s.wpIndex}/${world.waypoints.length}</span></li>
    <li><span class="k">Distance</span><span class="v">${Math.round(s.traveled * METERS_PER_UNIT)} m</span></li>
    <li><span class="k">Days</span><span class="v">${s.day}</span></li>
    <li><span class="k">Bond</span><span class="v">${Math.round(m.bond)}</span></li>`;
  el("end").classList.remove("hidden");
  try {
    const res = await fetch("/api/expeditions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: s.rider, horse: s.horse, days: s.day, distanceKm: Math.round(s.traveled * METERS_PER_UNIT), bond: Math.round(m.bond), waypoints: s.wpIndex, outcome: won ? "arrived" : "lost" }),
    });
    renderJournal((await res.json()).log || []);
  } catch { loadJournal(); }
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
    bond.className = "j-bond"; bond.textContent = `♥ ${e.bond}`;
    li.append(name, bond); j.appendChild(li);
  });
}
async function loadJournal() {
  try { renderJournal(await (await fetch("/api/expeditions")).json()); } catch { renderJournal([]); }
}

// ---- resize + loop -------------------------------------------------------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state && !state.over) {
    update(dt);
    updateHUD();
    renderMinimap();
  }
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---- boot ----------------------------------------------------------------
el("btn-begin").addEventListener("click", () => {
  resetGame(el("rider-name").value.trim(), el("horse-input").value.trim());
  el("start").classList.add("hidden");
  el("lock-hint").classList.remove("hidden");
  last = performance.now();
});
el("btn-restart").addEventListener("click", () => {
  el("end").classList.add("hidden");
  el("start").classList.remove("hidden");
});
loadJournal();
