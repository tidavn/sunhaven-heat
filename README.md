# sunhaven-heat

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/tidavn/sunhaven-heat/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/tidavn/sunhaven-heat/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Sunhaven Heat** — a complete open-world crime game in the browser. Three days, six missions, one getaway driver trying to leave the life. Explore Sunhaven on foot and by car, steal cars, outrun the Sunhaven Police Department under a five-star wanted level, and finish June Marlowe's story — then keep the city in free roam with taxi fares and sun coins to chase.

## What is in the game

- **An open city** — five districts (Downtown, the Strip, Old Town, Dockside, Marina), a beach and the sea, traffic and pedestrians, palms and neon.
- **Drive and steal** — arcade car physics with handbrake drifts; take any parked car for free, jack an occupied one and the police notice.
- **Wanted level** — 0 to 5 stars, police cars that chase and ram, foot officers that run you down, heat that cools when you stay clean and out of sight. Get caught and you pay a fine.
- **Six missions over three days** — steal a car for Ray, a timed courier run, a Marina pickup that goes wrong, a Dockside deal on foot, a three-star getaway and a four-star final drive to the airfield.
- **Combat and progression** — punch, and a pistol once armed; cash from missions, taxi fares and 10 hidden sun coins; health that regens out of trouble.
- **Feel and polish** — third-person camera with mouse orbit, a HUD with wanted stars, cash, health, a day clock, mission objectives and a live minimap, a start screen, pause, and save/load in the browser.
- **Look** — a sun-soaked coastal city at noon, sunset and night, built from procedural textures and a vendored three.js; every name, character and place is original.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 — no build step, no network requests, everything under `game/`.

## Controls

W A S D move / drive · Shift sprint · E steal / leave car · Space handbrake · F punch · Q or click shoot (once armed) · 1 holster pistol · drag mouse to look · Esc pause · M mute

## Screenshots

`?shot=chase|downtown|mission|strip` stages each scene deterministically in the browser (see `game/src/shots.js`).

---

<sub>Entered on [make.fun](https://make.fun/?ref=k73yfdz2&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
