// The player: June Marlowe, on foot and behind the wheel. On foot she
// walks, sprints, punches and (once armed) shoots; near a car, E takes
// it. Stealing an occupied car in view raises heat. Health regens
// slowly out of trouble; at zero she is wasted.

import * as THREE from 'three';
import { clamp, dist2D } from './util.js';
import { createPersonMesh } from './traffic.js';
import { CAR_RADIUS } from './vehicles.js';

export const PLAYER_WALK_SPEED = 4.6;
export const PLAYER_SPRINT_SPEED = 8.2;

export function createPlayer(scene, x, z) {
  const mesh = createPersonMesh({ shirt: 0xb03a2e, skin: 0xc98e6a, pants: 0x1c2833 });
  mesh.group.position.set(x, 0, z);
  scene.add(mesh.group);
  // A pistol, shown only while armed.
  const pistol = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.16, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.6 }),
  );
  pistol.position.set(0.42, 0.95, 0.25);
  pistol.visible = false;
  mesh.group.add(pistol);
  return {
    x, z, heading: 0, speed: 0,
    onFoot: true, health: 100, maxHealth: 100,
    cash: 0, car: null, armed: false, ammo: 0,
    mesh, pistol,
    punchCooldown: 0, shootCooldown: 0,
    invulnerable: 0, lastDamageAt: -100,
    moving: false,
  };
}

/** Walk the player. `move` is {x, z} in world space (already rotated
 *  to the camera), `sprint` is a bool. Returns nothing. */
export function stepOnFoot(player, move, sprint, dt, city) {
  const speed = sprint ? PLAYER_SPRINT_SPEED : PLAYER_WALK_SPEED;
  const mx = move.x;
  const mz = move.z;
  const len = Math.hypot(mx, mz);
  player.moving = len > 0.1;
  if (player.moving) {
    const nx = mx / len;
    const nz = mz / len;
    player.heading = Math.atan2(nx, nz);
    const nx2 = player.x + nx * speed * dt;
    const nz2 = player.z + nz * speed * dt;
    const resolved = city.resolveCollision(nx2, nz2, 0.55);
    player.x = resolved.x;
    player.z = resolved.z;
    const clamped = city.clampToCity(player.x, player.z, 5);
    player.x = clamped.x;
    player.z = clamped.z;
    player.speed = speed;
  } else {
    player.speed = 0;
  }
  player.mesh.group.position.set(player.x, 0, player.z);
  player.mesh.group.rotation.y = player.heading;
  // Walk-cycle swing, faster when sprinting.
  const rate = player.moving ? (sprint ? 2.2 : 1.4) : 0;
  player.mesh.walkPhase += rate * dt * 6;
  const swing = player.moving ? Math.sin(player.mesh.walkPhase) * 0.6 : 0;
  player.mesh.legL.rotation.x = swing;
  player.mesh.legR.rotation.x = -swing;
  player.mesh.armL.rotation.x = -swing * 0.7;
  player.mesh.armR.rotation.x = swing * 0.7;
  if (player.punchCooldown > 0) player.punchCooldown -= dt;
  if (player.shootCooldown > 0) player.shootCooldown -= dt;
  if (player.invulnerable > 0) player.invulnerable -= dt;
  // Slow health regen after ten quiet seconds.
  if (player.health < player.maxHealth && performance.now() / 1000 - player.lastDamageAt > 10) {
    player.health = Math.min(player.maxHealth, player.health + 4 * dt);
  }
}

/** Hurt the player (police ram, a cop's punch). Returns true if wasted. */
export function damagePlayer(player, amount, nowSeconds) {
  if (player.invulnerable > 0) return false;
  player.health -= amount;
  player.lastDamageAt = nowSeconds;
  player.invulnerable = 0.6;
  return player.health <= 0;
}

/**
 * Punch the nearest pedestrian or officer within reach. Returns the
 * victim (or null). The world decides the heat for it.
 */
export function punch(player, peds, officers) {
  if (player.punchCooldown > 0 || !player.onFoot) return null;
  player.punchCooldown = 0.45;
  let best = null;
  let bestD = 2.2;
  for (const ped of peds) {
    if (ped.down > 0) continue;
    const d = dist2D(player.x, player.z, ped.x, ped.z);
    if (d < bestD) {
      bestD = d;
      best = { kind: 'ped', ref: ped };
    }
  }
  for (const cop of officers) {
    const d = dist2D(player.x, player.z, cop.x, cop.z);
    if (d < bestD) {
      bestD = d;
      best = { kind: 'cop', ref: cop };
    }
  }
  return best;
}

/**
 * Fire the pistol toward `targetHeading` (the camera's yaw). Hits the
 * nearest person or car within 32 m inside a narrow cone. Returns the
 * victim or null. Ammo is spent even on a miss.
 */
export function shoot(player, heading, peds, officers, cars) {
  if (player.shootCooldown > 0 || !player.onFoot || !player.armed) return null;
  if (player.ammo <= 0) {
    player.shootCooldown = 0.25;
    return { kind: 'dry', ref: null };
  }
  player.shootCooldown = 0.3;
  player.ammo -= 1;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  let best = null;
  let bestAlong = 32;
  const consider = (x, z, kind, ref) => {
    const dx = x - player.x;
    const dz = z - player.z;
    const along = dx * fx + dz * fz;
    if (along < 1 || along > bestAlong) return;
    const side = Math.abs(dx * fz - dz * fx);
    if (side > 1.2 + along * 0.06) return;
    bestAlong = along;
    best = { kind, ref };
  };
  for (const ped of peds) {
    if (ped.down > 0) continue;
    consider(ped.x, ped.z, 'ped', ped);
  }
  for (const cop of officers) consider(cop.x, cop.z, 'cop', cop);
  for (const car of cars) {
    if (car === player.car) continue;
    consider(car.x, car.z, 'car', car);
  }
  return best;
}

/** Nearest car the player could steal, within 4.5 m. */
export function nearestStealableCar(player, cars) {
  let best = null;
  let bestD = 4.5;
  for (const car of cars) {
    const d = dist2D(player.x, player.z, car.x, car.z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

/** Put the player in a car (driving). */
export function enterCar(player, car) {
  player.onFoot = false;
  player.car = car;
  player.mesh.group.visible = false;
}

/** Step out beside the car. */
export function exitCar(player, city) {
  const car = player.car;
  if (!car) return;
  const side = 2.6;
  const px = car.x + Math.cos(car.heading) * side;
  const pz = car.z - Math.sin(car.heading) * side;
  const resolved = city.resolveCollision(px, pz, 0.55);
  player.x = resolved.x;
  player.z = resolved.z;
  player.heading = car.heading;
  player.onFoot = true;
  player.car = null;
  player.mesh.group.visible = true;
  player.mesh.group.position.set(player.x, 0, player.z);
}
