// Sunhaven Heat — the entrypoint for make.fun's "Make GTA 6" bounty
// (Node 22, standard library only). It hands the game in: it copies
// this directory's game/ and screenshots/ to /output and writes
// /output/dossier.json, the summary the judge reads, with the vendored
// make.fun library (vendor/makefun-game.ts, the kit's copy, unchanged).
// The game itself is plain static files under game/ — a three.js open
// world that plays in desktop Chrome with no network request.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');

function countEntries(dir) {
  let total = 0;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    total += 1;
    if (statSync(path).isDirectory()) total += countEntries(path);
  }
  return total;
}

if (!existsSync(join(gameDir, 'index.html'))) {
  throw new Error('game/index.html is missing: the game cannot be handed in without it.');
}

// Pre-flight checks the scorer would refuse later: the judge reads the
// screenshots first, so an entry with too few shots, or a shot over the
// 256 KiB cap, or an index.html over its 1 MiB cap, is caught here with a
// plain message instead of a silent bad hand-in.
const shotNames = existsSync(shotsDir)
  ? readdirSync(shotsDir).filter((n) => !n.startsWith('.')).sort()
  : [];
if (shotNames.length < 3) {
  throw new Error(`need at least 3 screenshots, found ${shotNames.length}.`);
}
for (const name of shotNames) {
  const size = statSync(join(shotsDir, name)).size;
  if (size > 262144) throw new Error(`screenshot ${name} is ${size} bytes, over the 256 KiB cap.`);
}
if (statSync(join(gameDir, 'index.html')).size > 1048576) {
  throw new Error('game/index.html is over its 1 MiB cap.');
}

mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes
// the bytes; the others refuse an entry the scorer would refuse — more
// than 4 screenshots or one over 256 KiB; more than 993 files in game/
// or 48 MiB of game files in all, or a path under game/ over 1000 bytes.
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);

console.log(
  `Sunhaven Heat handed in: ${countEntries(gameDir)} game entries, ` +
  `${shotNames.length} screenshot(s) (${shotNames.join(', ') || 'none'}), ` +
  `dossier ${Buffer.byteLength(dossier, 'utf8')} bytes -> ${out}`,
);
