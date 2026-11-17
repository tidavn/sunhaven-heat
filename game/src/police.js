// The wanted system and the Sunhaven Police Department. Heat rises
// when the player commits crimes in view; stars decay when the player
// stays clean and out of sight. Police cars spawn on the road network
// and chase, foot officers run the player down on foot, and getting
// caught costs cash and the wanted level — never the story.

import * as THREE from 'three';
import { mulberry32, clamp, angleDelta, dist2D } from './util.js';
import { ROAD_COORDS, nearestRoadPoint } from './city.js';
import { createCarState, stepCar, syncCarMesh, createCarMesh } from './vehicles.js';

export const MAX_STARS = 5;
const DECAY_QUIET_SECONDS = 20;
const HEAT_PER_STAR = 1;

export class Police {
  constructor(scene, city, seed = 4242) {
    this.scene = scene;
    this.city = city;
    this.rng = mulberry32(seed);
    this.stars = 0;
    this.heat = 0;
    this.quietTimer = 0;
    this.cars = [];
    this.officers = [];
    this.bustedTimer = 0;
    this.flash = 0;
  }

  /** Raise heat. `amount` is in stars (1 = a full star). */
  addHeat(amount, reason) {
    if (this.stars >= MAX_STARS && this.heat >= HEAT_PER_STAR) return;
    this.heat += amount;
    this.quietTimer = 0;
    while (this.heat >= HEAT_PER_STAR && this.stars < MAX_STARS) {
      this.heat -= HEAT_PER_STAR;
      this.stars += 1;
    }
    if (this.stars >= MAX_STARS) this.heat = Math.min(this.heat, HEAT_PER_STAR);
  }

  clear() {
    this.stars = 0;
    this.heat = 0;
    this.quietTimer = 0;
    this.bustedTimer = 0;
    for (const car of this.cars) this.scene.remove(car.state.mesh.group);
    for (const cop of this.officers) this.scene.remove(cop.mesh.group);
    this.cars = [];
    this.officers = [];
  }

  _spawnPointNear(x, z, minDist, maxDist) {
    for (let tries = 0; tries < 12; tries += 1) {
      const road = ROAD_COORDS[Math.floor(this.rng() * ROAD_COORDS.length)];
      const along = -240 + this.rng() * 480;
      const horizontal = this.rng() < 0.5;
      const px = horizontal ? road : along;
      const pz = horizontal ? along : road;
      const d = dist2D(px, pz, x, z);
      if (d >= minDist && d <= maxDist) return { x: px, z: pz };
    }
    const rp = nearestRoadPoint(x + 70, z + 70);
    return { x: rp.x, z: rp.z };
  }

  _spawnCar(x, z) {
    const p = this._spawnPointNear(x, z, 55, 110);
    const state = createCarState(p.x, p.z, this.rng() * Math.PI * 2, {
      maxSpeed: 30 + this.stars * 1.6,
      accel: 20,
      police: true,
    });
    state.mesh = createCarMesh({ police: true });
    this.scene.add(state.mesh.group);
    this.cars.push({ state, sirenPhase: this.rng() * Math.PI * 2 });
  }

  _spawnOfficer(x, z, meshFactory) {
    const p = this._spawnPointNear(x, z, 25, 60);
    const mesh = meshFactory({ shirt: 0x1a2a4a, skin: 0xc98e6a, pants: 0x1a1a1a });
    mesh.group.position.set(p.x, 0, p.z);
    this.scene.add(mesh.group);
    this.officers.push({ x: p.x, z: p.z, heading: 0, speed: 5.2, mesh, holdTimer: 0 });
  }

  /**
   * Step the wanted system. `player` is the player state (x, z, speed,
   * onFoot, car), `allCars` every car state, `meshFactory` builds a
   * person mesh for foot officers. Returns 'busted' when the player is
   * caught, else null.
   */
  step(dt, player, allCars, meshFactory) {
    this.flash += dt;
    // Decay: stay clean and unseen and the heat cools off.
    let nearestCop = Infinity;
    for (const car of this.cars) {
      nearestCop = Math.min(nearestCop, dist2D(car.state.x, car.state.z, player.x, player.z));
    }
    for (const cop of this.officers) {
      nearestCop = Math.min(nearestCop, dist2D(cop.x, cop.z, player.x, player.z));
    }
    if (this.stars > 0) {
      this.quietTimer += dt;
      if (this.quietTimer > DECAY_QUIET_SECONDS && nearestCop > 45) {
        this.heat -= dt / 25;
        if (this.heat < 0) {
          this.heat = 0.8;
          this.stars -= 1;
          if (this.stars === 0) this.heat = 0;
        }
      }
    }

    // Keep the right number of police cars on the road.
    const wantCars = Math.min(this.stars, 4);
    while (this.cars.length < wantCars) this._spawnCar(player.x, player.z);
    while (this.cars.length > wantCars) {
      const car = this.cars.pop();
      this.scene.remove(car.state.mesh.group);
    }
    // Foot officers only while the player is on foot.
    const wantCops = player.onFoot ? Math.min(this.stars, 2) : 0;
    while (this.officers.length < wantCops) this._spawnOfficer(player.x, player.z, meshFactory);
    while (this.officers.length > wantCops) {
      const cop = this.officers.pop();
      this.scene.remove(cop.mesh.group);
    }

    // Chase: police cars steer at the player's predicted position.
    const playerSpeed = player.onFoot ? 0 : Math.abs(player.car ? player.car.speed : 0);
    for (const car of this.cars) {
      const s = car.state;
      const lookX = player.x + Math.sin(player.heading || 0) * playerSpeed * 0.4;
      const lookZ = player.z + Math.cos(player.heading || 0) * playerSpeed * 0.4;
      const want = Math.atan2(lookX - s.x, lookZ - s.z);
      const steer = clamp(angleDelta(s.heading, want) * 1.8, -1, 1);
      stepCar(s, { throttle: 1, steer, handbrake: false }, dt, this.city, allCars);
      syncCarMesh(s, dt);
      // Flash the light bar.
      const on = Math.sin(this.flash * 9 + car.sirenPhase) > 0;
      if (s.mesh.lightBarL) s.mesh.lightBarL.material.emissiveIntensity = on ? 2.4 : 0.15;
      if (s.mesh.lightBarR) s.mesh.lightBarR.material.emissiveIntensity = on ? 0.15 : 2.4;
    }

    // Foot officers run at the player and grab them.
    for (const cop of this.officers) {
      const dx = player.x - cop.x;
      const dz = player.z - cop.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.01) {
        cop.heading = Math.atan2(dx, dz);
        cop.x += Math.sin(cop.heading) * cop.speed * dt;
        cop.z += Math.cos(cop.heading) * cop.speed * dt;
      }
      cop.mesh.group.position.set(cop.x, 0, cop.z);
      cop.mesh.group.rotation.y = cop.heading;
      if (d < 1.4) cop.holdTimer += dt;
      else cop.holdTimer = 0;
      if (cop.holdTimer > 2) return 'busted';
    }

    // Busted by car: a police car sits on the player while they crawl.
    const playerSlow = player.onFoot || playerSpeed < 3;
    let touching = false;
    for (const car of this.cars) {
      if (dist2D(car.state.x, car.state.z, player.x, player.z) < 5) touching = true;
    }
    if (this.stars > 0 && touching && playerSlow) {
      this.bustedTimer += dt;
      if (this.bustedTimer > 2.5) return 'busted';
    } else {
      this.bustedTimer = Math.max(0, this.bustedTimer - dt * 2);
    }
    return null;
  }
}
