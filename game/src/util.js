// Small shared helpers for Sunhaven Heat: a seeded random stream so the
// city, traffic and screenshot scenes are the same on every run, plus the
// angle and clamping math the driving and camera code both need.

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** mulberry32: a tiny deterministic PRNG. Seed it once per scene. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Shortest signed turn from angle `from` to angle `to`, in radians. */
export function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Move `angle` toward `target` by at most `step` radians. */
export function turnToward(angle, target, step) {
  const d = angleDelta(angle, target);
  if (Math.abs(d) <= step) return target;
  return angle + Math.sign(d) * step;
}

/** Pick one element of an array with the given random stream. */
export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

/** Squared distance on the ground plane (x/z only). */
export function dist2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Format a distance in metres for the HUD ("120 m", "1.2 km"). */
export function formatDistance(m) {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

/** Format a cash amount ($1,250). */
export function formatCash(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

/** Format a mission timer as m:ss. */
export function formatTimer(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
