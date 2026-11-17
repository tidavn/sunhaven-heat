// The third-person camera for Sunhaven Heat. It trails behind the
// player on foot and behind the car while driving, eased so it never
// snaps, and the mouse drag orbits it. It pulls in when a building
// would block the view, so the player is never hidden behind a wall.

import * as THREE from 'three';
import { clamp, lerp, angleDelta } from './util.js';

export class FollowCamera {
  constructor(camera, city) {
    this.camera = camera;
    this.city = city;
    this.yaw = 0;
    this.pitch = 0.32;
    this.distance = 8;
    this.position = new THREE.Vector3(0, 6, -10);
    this.lookAt = new THREE.Vector3(0, 2, 0);
  }

  /** Mouse drag orbits the camera (dx: yaw, dy: pitch). */
  orbit(dx, dy) {
    this.yaw -= dx * 0.005;
    this.pitch = clamp(this.pitch + dy * 0.003, 0.08, 0.9);
  }

  /** Where the player is facing (the camera's yaw), for movement. */
  get heading() {
    return this.yaw;
  }

  step(dt, target, inCar, speed) {
    const wantDist = inCar ? 11 + Math.min(4, Math.abs(speed) * 0.12) : 7.5;
    const wantHeight = inCar ? 4.2 : 3.1;
    this.distance = lerp(this.distance, wantDist, 1 - Math.exp(-4 * dt));
    // The camera trails the player's heading when driving, and the
    // orbit yaw on foot; blend between them so entering a car is smooth.
    // Behind the car means the camera sits at target - forward * dist,
    // so the yaw to use is the heading itself.
    const targetYaw = inCar ? target.heading : this.yaw;
    // Keep the orbit yaw in sync with the car so leaving the car feels right.
    if (inCar) this.yaw = targetYaw;
    const cx = target.x - Math.sin(targetYaw) * this.distance * Math.cos(this.pitch);
    const cz = target.z - Math.cos(targetYaw) * this.distance * Math.cos(this.pitch);
    const cy = wantHeight + this.distance * Math.sin(this.pitch);
    // Pull the camera in when a building stands between it and the player.
    let dist = this.distance;
    const resolved = this.city.resolveCollision(cx, cz, 1.2);
    if (resolved.x !== cx || resolved.z !== cz) {
      dist = Math.max(3, this.distance * 0.45);
    }
    const fx = target.x - Math.sin(targetYaw) * dist * Math.cos(this.pitch);
    const fz = target.z - Math.cos(targetYaw) * dist * Math.cos(this.pitch);
    const fy = wantHeight + dist * Math.sin(this.pitch);
    const k = 1 - Math.exp(-10 * dt);
    this.position.x = lerp(this.position.x, fx, k);
    this.position.y = lerp(this.position.y, Math.max(fy, 1.6), k);
    this.position.z = lerp(this.position.z, fz, k);
    const lookTarget = new THREE.Vector3(
      target.x + Math.sin(target.heading || targetYaw) * 2,
      inCar ? 1.6 : 1.5,
      target.z + Math.cos(target.heading || targetYaw) * 2,
    );
    this.lookAt.lerp(lookTarget, 1 - Math.exp(-12 * dt));
    this.camera.position.copy(this.position);
    this.camera.lookAt(this.lookAt);
  }

  /** Snap the camera behind the target (used when staging screenshots). */
  snap(target, inCar, distOverride) {
    const dist = distOverride ?? (inCar ? 11 : 7.5);
    const yaw = inCar ? target.heading : this.yaw;
    this.position.set(
      target.x - Math.sin(yaw) * dist,
      distOverride ? (inCar ? 4.2 : 2.4) : (inCar ? 4.2 : 3.1),
      target.z - Math.cos(yaw) * dist,
    );
    this.lookAt.set(target.x, 1.6, target.z);
    this.camera.position.copy(this.position);
    this.camera.lookAt(this.lookAt);
  }
}
