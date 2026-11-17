// Traffic and pedestrians for Sunhaven Heat. Traffic cars loop the
// road grid, slowing for the car ahead; pedestrians stroll the
// sidewalks and scatter when a car bears down on them or a fight
// breaks out nearby. All of them are plain figures the world steps
// every frame — no pathfinding library, just road coordinates.

import * as THREE from 'three';
import { mulberry32, pick, clamp, angleDelta, turnToward, dist2D } from './util.js';
import { ROAD_COORDS, ROAD_WIDTH, isOnRoad, nearestRoadPoint } from './city.js';
import { createCarState, stepCar, syncCarMesh, createCarMesh, CAR_RADIUS } from './vehicles.js';
import { CAR_PAINTS } from './textures.js';

const TRAFFIC_COUNT = 22;
const PED_COUNT = 36;

/** A simple walking figure: body, head and swinging legs. */
export function createPersonMesh({ shirt = 0x3a7bd5, skin = 0xc98e6a, pants = 0x2c3e50 } = {}) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.75, 0.32),
    new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.85 }),
  );
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 10, 8),
    new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 }),
  );
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);
  const legGeo = new THREE.BoxGeometry(0.2, 0.7, 0.22);
  const legMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
  const legL = new THREE.Mesh(legGeo, legMat);
  legL.position.set(-0.14, 0.35, 0);
  group.add(legL);
  const legR = new THREE.Mesh(legGeo, legMat);
  legR.position.set(0.14, 0.35, 0);
  group.add(legR);
  const armGeo = new THREE.BoxGeometry(0.16, 0.62, 0.18);
  const armMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.85 });
  const armL = new THREE.Mesh(armGeo, armMat);
  armL.position.set(-0.38, 1.05, 0);
  group.add(armL);
  const armR = new THREE.Mesh(armGeo, armMat);
  armR.position.set(0.38, 1.05, 0);
  group.add(armR);
  return { group, legL, legR, armL, armR, walkPhase: 0 };
}

function posePerson(person, speed, dt) {
  person.walkPhase += speed * dt * 2.4;
  const swing = Math.sin(person.walkPhase) * Math.min(0.7, speed * 0.25);
  person.legL.rotation.x = swing;
  person.legR.rotation.x = -swing;
  person.armL.rotation.x = -swing * 0.7;
  person.armR.rotation.x = swing * 0.7;
}

export class Traffic {
  constructor(scene, city, seed = 777) {
    this.scene = scene;
    this.city = city;
    this.rng = mulberry32(seed);
    this.cars = [];
    this.peds = [];
    this._buildCars();
    this._buildPeds();
  }

  _randomRoadPoint() {
    const axis = this.rng() < 0.5 ? 'x' : 'z';
    const road = pick(this.rng, ROAD_COORDS);
    const along = -240 + this.rng() * 480;
    return axis === 'x' ? { x: road, z: along } : { x: along, z: road };
  }

  _buildCars() {
    for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
      const p = this._randomRoadPoint();
      const heading = this.rng() * Math.PI * 2;
      const state = createCarState(p.x, p.z, heading, {
        maxSpeed: 13 + this.rng() * 5,
        accel: 8,
        color: pick(this.rng, CAR_PAINTS),
      });
      state.mesh = createCarMesh({ color: state.color });
      this.scene.add(state.mesh.group);
      const target = this._randomRoadPoint();
      this.cars.push({ state, target, stuck: 0 });
    }
  }

  _buildPeds() {
    const shirts = [0x3a7bd5, 0xd35400, 0x27ae60, 0x8e44ad, 0xe8b93c, 0xecf0f1, 0x922b21];
    for (let i = 0; i < PED_COUNT; i += 1) {
      const p = this._randomRoadPoint();
      const mesh = createPersonMesh({ shirt: pick(this.rng, shirts) });
      mesh.group.position.set(p.x, 0, p.z);
      this.scene.add(mesh.group);
      const target = this._randomRoadPoint();
      this.peds.push({
        x: p.x, z: p.z, heading: this.rng() * Math.PI * 2,
        speed: 1.2 + this.rng() * 0.8, mesh, target,
        flee: 0, down: 0,
      });
    }
  }

  /** Drive one traffic car toward its target intersection. */
  _driveTraffic(car, dt, allCars, playerPos, playerSpeed) {
    const s = car.state;
    const dx = car.target.x - s.x;
    const dz = car.target.z - s.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 6) {
      car.target = this._randomRoadPoint();
      car.stuck = 0;
      return;
    }
    const wantHeading = Math.atan2(dx, dz);
    const steer = clamp(angleDelta(s.heading, wantHeading) * 1.6, -1, 1);
    // Slow for the car ahead (a crude forward check).
    let throttle = 0.55;
    const fx = Math.sin(s.heading);
    const fz = Math.cos(s.heading);
    for (const other of allCars) {
      if (other === s) continue;
      const ox = other.x - s.x;
      const oz = other.z - s.z;
      const ahead = ox * fx + oz * fz;
      const side = Math.abs(ox * fz - oz * fx);
      if (ahead > 0 && ahead < 10 && side < 3) {
        throttle = -0.4;
        break;
      }
    }
    // Yield a little when the player's car is right in front.
    if (playerPos && playerSpeed > 1) {
      const pdx = playerPos.x - s.x;
      const pdz = playerPos.z - s.z;
      const ahead = pdx * fx + pdz * fz;
      const side = Math.abs(pdx * fz - pdz * fx);
      if (ahead > 0 && ahead < 12 && side < 3.5) throttle = -0.4;
    }
    stepCar(s, { throttle, steer, handbrake: false }, dt, this.city, allCars);
    syncCarMesh(s, dt);
  }

  _walkPed(ped, dt, danger) {
    if (ped.down > 0) {
      ped.down -= dt;
      ped.mesh.group.rotation.x = ped.down > 0 ? -Math.PI / 2 + 0.2 : 0;
      return;
    }
    ped.mesh.group.rotation.x = 0;
    let tx = ped.target.x;
    let tz = ped.target.z;
    if (ped.flee > 0) {
      ped.flee -= dt;
      // Run away from the danger point.
      const dx = ped.x - danger.x;
      const dz = ped.z - danger.z;
      const d = Math.hypot(dx, dz) || 1;
      tx = ped.x + (dx / d) * 30;
      tz = ped.z + (dz / d) * 30;
    }
    const dx = tx - ped.x;
    const dz = tz - ped.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 4) {
      ped.target = this._randomRoadPoint();
      return;
    }
    const want = Math.atan2(dx, dz);
    ped.heading = turnToward(ped.heading, want, 3 * dt);
    const speed = ped.flee > 0 ? ped.speed * 2.6 : ped.speed;
    ped.x += Math.sin(ped.heading) * speed * dt;
    ped.z += Math.cos(ped.heading) * speed * dt;
    const clamped = this.city.clampToCity(ped.x, ped.z, 8);
    ped.x = clamped.x;
    ped.z = clamped.z;
    // Stay near roads: if deep inside a block, drift back to the road.
    if (!isOnRoad(ped.x, ped.z)) {
      const rp = nearestRoadPoint(ped.x, ped.z);
      ped.x += (rp.x - ped.x) * 0.4 * dt;
      ped.z += (rp.z - ped.z) * 0.4 * dt;
    }
    ped.mesh.group.position.set(ped.x, 0, ped.z);
    ped.mesh.group.rotation.y = ped.heading;
    posePerson(ped.mesh, speed, dt);
  }

  /** Step every car and pedestrian. `danger` is {x, z} when the player
   *  is speeding or fighting nearby, so peds scatter. */
  step(dt, allCars, playerState, danger) {
    const playerPos = playerState ? { x: playerState.x, z: playerState.z } : null;
    const playerSpeed = playerState ? Math.abs(playerState.speed) : 0;
    for (const car of this.cars) {
      this._driveTraffic(car, dt, allCars, playerPos, playerSpeed);
    }
    for (const ped of this.peds) {
      if (danger && dist2D(ped.x, ped.z, danger.x, danger.z) < 14) ped.flee = 1.5;
      this._walkPed(ped, dt, danger);
    }
  }

  /** Knock a pedestrian down (a punch or a car bump). */
  knockDown(ped) {
    ped.down = 2.5;
  }
}
