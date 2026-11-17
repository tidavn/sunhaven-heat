// Procedural textures for Sunhaven Heat, all drawn on canvas at boot:
// building facades with lit windows, asphalt with lane markings,
// sidewalks, sand, water and car paint. No image files are shipped,
// so the game loads nothing over the network and every texture is the
// game's own art.

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

/** A building facade: coloured plaster, a grid of windows, some lit. */
export function facadeTexture(baseColor, litRatio, rng) {
  const canvas = makeCanvas(128, 256);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 128, 256);
  // Subtle vertical shading so flat walls read as concrete.
  const shade = ctx.createLinearGradient(0, 0, 128, 0);
  shade.addColorStop(0, 'rgba(0,0,0,0.18)');
  shade.addColorStop(0.5, 'rgba(255,255,255,0.06)');
  shade.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, 128, 256);
  const cols = 8;
  const rows = 16;
  const ww = 128 / cols;
  const wh = 256 / rows;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const lit = rng() < litRatio;
      ctx.fillStyle = lit ? '#ffd98a' : '#1d2b3a';
      ctx.fillRect(c * ww + 5, r * wh + 6, ww - 10, wh - 12);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(c * ww + 5, r * wh + 6, ww - 10, 3);
    }
  }
  // Ground-floor shopfront band.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 256 - 22, 128, 22);
  return canvas;
}

/** Asphalt with a dashed centre line, tiled along a road. */
export function roadTexture() {
  const canvas = makeCanvas(128, 128);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#43464c';
  ctx.fillRect(0, 0, 128, 128);
  // Speckle so the asphalt is not a flat grey.
  for (let i = 0; i < 500; i += 1) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  ctx.fillStyle = '#c9b458';
  ctx.fillRect(62, 0, 4, 26);
  ctx.fillRect(62, 64, 4, 26);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(6, 0, 3, 128);
  ctx.fillRect(119, 0, 3, 128);
  return canvas;
}

/** Pale sidewalk slabs. */
export function sidewalkTexture() {
  const canvas = makeCanvas(128, 128);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#9a938a';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 128; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 128);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(128, i);
    ctx.stroke();
  }
  return canvas;
}

/** Warm beach sand with a few speckles. */
export function sandTexture() {
  const canvas = makeCanvas(128, 128);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e0c48f';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 700; i += 1) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(120,90,40,0.12)';
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  return canvas;
}

/** Sea water: deep blue with lighter wave streaks. */
export function waterTexture() {
  const canvas = makeCanvas(128, 128);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1d6f9e';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 9; i += 1) {
    const y = 8 + i * 14 + Math.random() * 6;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(40, y - 5, 80, y + 5, 128, y - 2);
    ctx.stroke();
  }
  return canvas;
}

/** A plain glossy car-paint colour (used as a flat material, kept here
 *  so every vehicle's paint comes from one place). */
export const CAR_PAINTS = [
  0xc0392b, 0x2e6fb7, 0xe8b93c, 0x2ecc71, 0x8e44ad, 0xecf0f1,
  0x1a1a1e, 0xd35400, 0x16a085, 0xf5f0e6, 0x5d6d7e, 0x922b21,
];
