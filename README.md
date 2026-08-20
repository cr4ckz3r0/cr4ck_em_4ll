# cr4ck_em_4ll

**THE LONG RIDE** — a realistic-leaning, atmospheric **13th-century open-world horseback
survival game** that runs in the browser. No fantasy horses: it's about the bond with your
mount, real gaits, reading the weather, planning your route, and keeping your animal alive
across the open steppe.

> Scope note: this is a hand-built 2D top-down vertical slice (HTML5 canvas, no engine).
> It captures the *concept's* pillars — bond, gaits, weather-driven routing, survival and
> camp life — in a genuinely playable form rather than photoreal 3D.

## The pillars

- **Deep bond with your horse** — care raises trust; overexertion and neglect break it.
  Bond improves stamina recovery and how much the horse will give you.
- **Real gaits** — Walk, Trot, Canter, Gallop each have distinct speed, stamina cost and
  animated leg cadence. Gallop is fastest but blows the horse if you hold it too long.
- **Route planning by weather** — a live weather system with a **forecast**; rain, snow,
  fog and storms change warmth, stamina drain, ground speed and visibility. Plan your hops
  between waypoints around what's coming.
- **Nomad survival & care** — feed (graze), water, and rest your horse; manage hunger,
  thirst, rest, warmth and health.
- **Camp life** — gather wood, build and tend a **campfire**, and **rest** by the fire to
  recover and skip the cold hours of night.
- **Vast, unspoiled nature** — a large open world of grassland, water, forests, rocky
  ground and a cold snowbound north, with a day/night cycle and a minimap.

## How to play

Set out from camp and reach all four waypoints before your horse gives out.

| Keys | Action |
| --- | --- |
| `W A S D` / arrows | Steer the horse |
| `1 2 3 4` | Set gait: Walk / Trot / Canter / Gallop |
| `Space` (hold) | Graze on lush grass · drink at water |
| `F` | Gather wood near trees |
| `C` | Build / feed a campfire |
| `R` | Rest by the fire (recovers, deepens bond, skips time) |

Watch the meters (top-left), the clock + weather forecast and next waypoint (top-right),
and the advice line for what your horse needs.

## Run it

Requires Node.js 18+.

```bash
npm install
npm start
```

Then open http://localhost:3000 (auto-reload dev mode: `npm run dev`; custom port:
`PORT=8080 npm start`).

## Tech

- **Backend:** Node.js + Express (`server.js`) — serves the game and a small JSON
  **expedition journal** API.
- **Frontend:** vanilla HTML/CSS/JS in `public/` — canvas engine, gaits, survival & bond
  simulation, weather, day/night, minimap and UI.

### API

| Method | Path               | Description                                                   |
| ------ | ------------------ | ------------------------------------------------------------- |
| GET    | `/api/health`      | Health check                                                  |
| GET    | `/api/expeditions` | Expedition journal (ranked by bond, then distance)            |
| POST   | `/api/expeditions` | Log a run `{ name, horse, days, distanceKm, bond, waypoints, outcome }` |

The journal persists to `data/expeditions.json` (git-ignored).
