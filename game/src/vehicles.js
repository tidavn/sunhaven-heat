// Cars: the mesh factory and the arcade driving model for Sunhaven Heat.
// Every car on the road — the player's, traffic's and the police's —
// is one of these. Physics is deliberately simple and forgiving:
// throttle, steering that bites harder the slower you go, a handbrake
// that breaks the rear loose, and circle-vs-box building collisions.

import * as THREE from 'three';
import { clamp, turnToward } from './util.js';
import { CAR_PAINTS } from './textures.js';

export const CAR_LENGTH = 4.4;
export const CAR_WIDTH = 2.0;
export const CAR_RADIUS = 2.4;

const WHEEL_GEO = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
const WHEEL_MAT = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
const GLASS_MAT = new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.15, metalness: 0.4 });
const LIGHT_MAT = new THREE.MeshStandardMaterial({ color: 0xfff6c9, emissive: 0xffedb0, emissiveIntensity: 0.9 });
const TAIL_MAT = new THREE.MeshStandardMaterial({ color: 0x7a0d0d, emissive: 0xd21f1f, emissiveIntensity: 0.7 });

/** Build a low-poly car mesh. `police` adds the black-and-white livery
 *  and a light bar; `color` is the body paint. */
export function createCarMesh({ color = 0xc0392b, police = false } = {}) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: police ? 0xf2f2f2 : color,
    roughness: 0.35,
    metalness: 0.5,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH, 0.75, CAR_LENGTH), bodyMat);
  body.position.y = 0.65;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH - 0.35, 0.62, CAR_LENGTH * 0.48), GLASS_MAT);
  cabin.position.set(0, 1.3, -0.25);
  cabin.castShadow = true;
  group.add(cabin);
  if (police) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH + 0.02, 0.3, CAR_LENGTH * 0.55), new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.4 }));
    band.position.set(0, 0.62, 0.3);
    group.add(band);
  }
  const wheels = [];
  const wheelPositions = [
    [-0.95, 1.45, true], [0.95, 1.45, true],
    [-0.95, -1.45, false], [0.95, -1.45, false],
  ];
  for (const [wx, wz, front] of wheelPositions) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, 0.38, wz);
    const wheel = new THREE.Mesh(WHEEL_GEO, WHEEL_MAT);
    wheel.rotation.z = Math.PI / 2;
    wheel.castShadow = true;
    pivot.add(wheel);
    group.add(pivot);
    wheels.push({ pivot, wheel, front });
  }
  const headL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), LIGHT_MAT);
  headL.position.set(-0.65, 0.7, CAR_LENGTH / 2 + 0.02);
  group.add(headL);
  const headR = headL.clone();
  headR.position.x = 0.65;
  group.add(headR);
  const tailL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.16, 0.1), TAIL_MAT);
  tailL.position.set(-0.65, 0.72, -CAR_LENGTH / 2 - 0.02);
  group.add(tailL);
  const tailR = tailL.clone();
  tailR.position.x = 0.65;
  group.add(tailR);
  let lightBar = null;
  let lightBarL = null;
  let lightBarR = null;
  if (police) {
    lightBar = new THREE.Group();
    lightBarL = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.22, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff0000, emissiveIntensity: 2 }),
    );
    lightBarL.position.set(-0.32, 1.72, -0.25);
    lightBarR = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.22, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x000033, emissive: 0x2244ff, emissiveIntensity: 2 }),
    );
    lightBarR.position.set(0.32, 1.72, -0.25);
    lightBar.add(lightBarL, lightBarR);
    group.add(lightBar);
  }
  return {
    group,
    wheels,
    lightBarL,
    lightBarR,
    /** Point the front wheels and spin all four by the distance rolled. */
    pose(steerAngle, distance) {
      for (const w of this.wheels) {
        if (w.front) w.pivot.rotation.y = steerAngle;
        w.wheel.rotation.x += distance / 0.38;
      }
    },
  };
}

/** A car's physics state. */
export function createCarState(x, z, heading, options = {}) {
  return {
    x,
    z,
    heading,
    speed: 0,
    steer: 0,
    maxSpeed: options.maxSpeed ?? 32,
    accel: options.accel ?? 15,
    color: options.color ?? CAR_PAINTS[Math.floor(Math.random() * CAR_PAINTS.length)],
    police: options.police ?? false,
    mesh: null,
    crashed: 0,
  };
}

/**
 * One physics step. `controls` is { throttle: -1..1, steer: -1..1,
 * handbrake: bool }. `city` supplies resolveCollision. `others` is a
 * list of other car states to bump against. Returns { hitWall, hitCar }.
 */
export function stepCar(car, controls, dt, city, others = []) {
  const events = { hitWall: false, hitCar: false };
  const maxSpeed = car.maxSpeed;
  if (controls.throttle > 0) {
    car.speed += car.accel * controls.throttle * dt;
  } else if (controls.throttle < 0) {
    if (car.speed > 0.5) car.speed += car.accel * 1.6 * controls.throttle * dt;
    else car.speed += car.accel * 0.55 * controls.throttle * dt;
  }
  if (controls.handbrake) car.speed -= Math.sign(car.speed) * 10 * dt;
  // Rolling drag and a hard cap.
  car.speed -= car.speed * 0.35 * dt;
  car.speed = clamp(car.speed, -10, maxSpeed);
  if (Math.abs(car.speed) < 0.05 && controls.throttle === 0) car.speed = 0;

  const grip = controls.handbrake ? 0.55 : 1;
  const steerTarget = controls.steer * 0.55 * grip;
  car.steer = turnToward(car.steer, steerTarget, 3.2 * dt);
  const speedFactor = clamp(Math.abs(car.speed) / 12, 0, 1);
  car.heading += car.steer * speedFactor * Math.sign(car.speed || 1) * 1.9 * dt;

  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const nx = car.x + fx * car.speed * dt;
  const nz = car.z + fz * car.speed * dt;
  const resolved = city.resolveCollision(nx, nz, CAR_RADIUS);
  if (resolved.x !== nx || resolved.z !== nz) {
    events.hitWall = true;
    // A hard hit scrubs speed; a slow scrape along a wall does not
    // wedge the car to a stop.
    if (Math.abs(car.speed) > 4) car.speed *= 0.45;
    car.crashed = 0.4;
  }
  car.x = resolved.x;
  car.z = resolved.z;
  const clamped = city.clampToCity(car.x, car.z, 6);
  car.x = clamped.x;
  car.z = clamped.z;

  // Bump against other cars (circle push, speed penalty).
  for (const other of others) {
    if (other === car) continue;
    const dx = car.x - other.x;
    const dz = car.z - other.z;
    const d = Math.hypot(dx, dz);
    const min = CAR_RADIUS * 2 - 0.6;
    if (d < min && d > 0.001) {
      const push = (min - d) / 2;
      car.x += (dx / d) * push;
      car.z += (dz / d) * push;
      other.x -= (dx / d) * push;
      other.z -= (dz / d) * push;
      car.speed *= 0.85;
      events.hitCar = true;
    }
  }
  if (car.crashed > 0) car.crashed -= dt;
  return events;
}

/** Place the mesh where the physics state says it is. */
export function syncCarMesh(car, dt = 1 / 60) {
  if (!car.mesh) return;
  car.mesh.group.position.set(car.x, 0, car.z);
  car.mesh.group.rotation.y = car.heading;
  car.mesh.pose(car.steer, car.speed * dt);
}
