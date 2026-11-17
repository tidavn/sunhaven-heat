// Sunhaven Heat's story: three days, six missions, one getaway
// driver trying to leave the life. June Marlowe owes the wrong people
// money; each mission pays a little of it off. After the last one the
// city is hers to roam, with taxi fares and sun coins to chase.
// Missions are data plus a small state machine: each step is a
// waypoint with a radius, an optional timer and an arrival hook.

import * as THREE from 'three';
import { formatCash } from './util.js';

export const LANDMARKS = {
  garage: { x: 120, z: -180, name: "Ray's Garage" },
  safehouse: { x: -60, z: 180, name: 'Safehouse' },
  marina: { x: -210, z: -120, name: 'Marina Meet' },
  docks: { x: 210, z: -60, name: 'Dockside' },
  airfield: { x: 210, z: 210, name: 'Sunhaven Airfield' },
  plaza: { x: 0, z: 0, name: 'Civic Plaza' },
};

const COURIER_POINTS = [
  { x: 0, z: -180, name: 'Courier: Old Town' },
  { x: -180, z: 60, name: 'Courier: Marina' },
  { x: 180, z: 120, name: 'Courier: The Strip' },
];

/** The six story missions, in order. */
export const MISSIONS = [
  {
    id: 'm1', day: 1, title: 'Keys to the City', hour: 12, reward: 200,
    briefing: 'Ray needs a car and you need the money. Take any car on the street — quick and quiet — and bring it to the garage.',
    steps: [
      { text: 'Steal a car (walk up to one and press E)', kind: 'steal', radius: 0 },
      { text: "Drive to Ray's Garage", kind: 'goto', point: LANDMARKS.garage, radius: 10 },
    ],
  },
  {
    id: 'm2', day: 1, title: 'Courier Run', hour: 16, reward: 300, timer: 150,
    briefing: 'Three packages, three corners of the city, two and a half minutes. Ray is counting on you — and so is the clock.',
    steps: [
      { text: 'Deliver to Old Town', kind: 'goto', point: COURIER_POINTS[0], radius: 9 },
      { text: 'Deliver to the Marina', kind: 'goto', point: COURIER_POINTS[1], radius: 9 },
      { text: 'Deliver to the Strip', kind: 'goto', point: COURIER_POINTS[2], radius: 9 },
    ],
  },
  {
    id: 'm3', day: 2, title: 'The Pickup', hour: 18, reward: 400,
    briefing: 'A contact at the Marina has something for you. The meet is clean — but the SPD has been watching the docks. Be ready to run.',
    steps: [
      { text: 'Drive to the Marina meet', kind: 'goto', point: LANDMARKS.marina, radius: 9 },
      { text: 'Lose the cops — reach the Safehouse', kind: 'escape', point: LANDMARKS.safehouse, radius: 10, wanted: 2 },
    ],
  },
  {
    id: 'm4', day: 2, title: 'Dockside Deal', hour: 21, reward: 500,
    briefing: 'On foot tonight. The case is waiting at Dockside, and so are the people who want it back. Grab it and get clear.',
    steps: [
      { text: 'Reach the Dockside drop', kind: 'goto', point: LANDMARKS.docks, radius: 9 },
      { text: 'Grab the case and get to the Safehouse', kind: 'escape', point: LANDMARKS.safehouse, radius: 10, wanted: 1 },
    ],
  },
  {
    id: 'm5', day: 3, title: 'Getaway', hour: 19, reward: 600, timer: 180,
    briefing: 'Three stars and the whole city behind you. The airfield gate is the only way out. Three minutes. Go.',
    steps: [
      { text: 'Reach the Airfield gate', kind: 'escape', point: LANDMARKS.airfield, radius: 12, wanted: 3 },
    ],
  },
  {
    id: 'm6', day: 3, title: 'The Long Way Out', hour: 22, reward: 1000,
    briefing: 'One last drive. Four stars, one runway, and a plane that leaves with or without you. Finish this.',
    steps: [
      { text: 'Reach the runway', kind: 'escape', point: LANDMARKS.airfield, radius: 10, wanted: 4 },
    ],
  },
];

export class MissionSystem {
  constructor(scene) {
    this.scene = scene;
    this.index = 0;
    this.active = null;
    this.stepIndex = 0;
    this.timer = 0;
    this.state = 'idle'; // idle | briefing | active | passed | failed | storyDone
    this.beacon = null;
    this.message = null;
    this.onEvent = null; // (type, data) — the world listens for these
    this._buildBeacon();
  }

  _buildBeacon() {
    const group = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 30;
    group.add(beam);
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(2.4),
      new THREE.MeshStandardMaterial({ color: 0xffd23c, emissive: 0xffb300, emissiveIntensity: 1.4, roughness: 0.3 }),
    );
    diamond.position.y = 12;
    group.add(diamond);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3, 4.4, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    group.add(ring);
    group.visible = false;
    this.scene.add(group);
    this.beacon = group;
    this.beaconDiamond = diamond;
  }

  get current() {
    return MISSIONS[this.index] ?? null;
  }

  get currentStep() {
    if (!this.active) return null;
    return this.active.steps[this.stepIndex] ?? null;
  }

  get waypoint() {
    const step = this.currentStep;
    return step && step.point ? step.point : null;
  }

  /** Show the briefing for the next mission. */
  startBriefing() {
    const mission = this.current;
    if (!mission) {
      this.state = 'storyDone';
      return;
    }
    this.active = mission;
    this.stepIndex = 0;
    this.timer = mission.timer ?? 0;
    this.state = 'briefing';
    if (this.onEvent) this.onEvent('briefing', { mission });
  }

  /** Begin the mission after its briefing was read. */
  begin() {
    this.state = 'active';
    if (this.onEvent) this.onEvent('missionStart', { mission: this.active });
    const step = this.currentStep;
    if (step && step.kind === 'escape' && step.wanted) {
      if (this.onEvent) this.onEvent('setWanted', { stars: step.wanted });
    }
    this._placeBeacon();
  }

  _placeBeacon() {
    const step = this.currentStep;
    if (step && step.point) {
      this.beacon.position.set(step.point.x, 0, step.point.z);
      this.beacon.visible = true;
    } else {
      this.beacon.visible = false;
    }
  }

  /** Advance a step when its condition is met. Returns 'passed' | 'failed' | null. */
  update(dt, player) {
    if (this.state !== 'active' || !this.active) return null;
    if (this.beacon.visible) {
      this.beaconDiamond.rotation.y += dt * 1.5;
      this.beaconDiamond.position.y = 12 + Math.sin(performance.now() / 350) * 1.2;
    }
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'failed';
        this.beacon.visible = false;
        if (this.onEvent) this.onEvent('missionFailed', { mission: this.active, reason: 'Time ran out.' });
        return 'failed';
      }
    }
    const step = this.currentStep;
    if (!step) return null;
    if (step.kind === 'steal') {
      if (!player.onFoot) {
        this._advance();
      }
      return null;
    }
    if (step.point) {
      const dx = player.x - step.point.x;
      const dz = player.z - step.point.z;
      if (Math.hypot(dx, dz) < step.radius) {
        if (step.kind === 'escape' && step.wanted) {
          // Escape steps complete on arrival regardless of wanted level.
        }
        this._advance();
      }
    }
    return null;
  }

  _advance() {
    this.stepIndex += 1;
    if (this.onEvent) this.onEvent('stepDone', { mission: this.active, stepIndex: this.stepIndex });
    if (this.stepIndex >= this.active.steps.length) {
      this._complete();
    } else {
      const step = this.currentStep;
      if (step && step.kind === 'escape' && step.wanted) {
        if (this.onEvent) this.onEvent('setWanted', { stars: step.wanted });
      }
      this._placeBeacon();
    }
  }

  _complete() {
    const mission = this.active;
    this.state = 'passed';
    this.beacon.visible = false;
    if (this.onEvent) this.onEvent('missionPassed', { mission, reward: mission.reward });
    this.index += 1;
    this.active = null;
  }

  retry() {
    this.state = 'idle';
    this.startBriefing();
  }

  skipToFreeRoam() {
    this.index = MISSIONS.length;
    this.active = null;
    this.state = 'storyDone';
    this.beacon.visible = false;
  }
}

/** Side activities once the player is free to roam: taxi fares and
 *  ten sun coins hidden around the city. */
export class SideActivities {
  constructor(scene) {
    this.scene = scene;
    this.taxi = null;
    this.taxiTimer = 8;
    this.coins = [];
    this.coinsCollected = 0;
    this.onEvent = null;
    this._buildCoins();
  }

  _buildCoins() {
    const spots = [
      [-210, 120], [-60, -210], [60, 210], [210, 60], [0, 120],
      [-180, -60], [120, 0], [-120, 180], [180, -180], [30, -30],
    ];
    const geo = new THREE.CylinderGeometry(1.1, 1.1, 0.25, 16);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffd23c, emissive: 0xffb300, emissiveIntensity: 1.2, metalness: 0.7, roughness: 0.3 });
    for (const [x, z] of spots) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(x, 1.2, z);
      this.scene.add(mesh);
      this.coins.push({ x, z, mesh, taken: false });
    }
  }

  update(dt, player, inCar) {
    for (const coin of this.coins) {
      if (coin.taken) continue;
      coin.mesh.rotation.z += dt * 1.5;
      coin.mesh.position.y = 1.2 + Math.sin(performance.now() / 400 + coin.x) * 0.25;
      const dx = player.x - coin.x;
      const dz = player.z - coin.z;
      if (Math.hypot(dx, dz) < 2.5) {
        coin.taken = true;
        coin.mesh.visible = false;
        this.coinsCollected += 1;
        if (this.onEvent) this.onEvent('coin', { count: this.coinsCollected, reward: 50 });
      }
    }
    // Taxi fares: a passenger waits, the player drives them over.
    this.taxiTimer -= dt;
    if (!this.taxi && this.taxiTimer <= 0 && inCar) {
      const spots = [
        { x: -180, z: -60, name: 'Marina' }, { x: 120, z: 120, name: 'The Strip' },
        { x: -60, z: -180, name: 'Old Town' }, { x: 180, z: -120, name: 'Dockside' },
      ];
      const from = spots[Math.floor(Math.random() * spots.length)];
      const to = spots[Math.floor(Math.random() * spots.length)];
      if (from !== to) {
        this.taxi = { from, to, pickedUp: false, fare: 40 + Math.floor(Math.random() * 40) };
        if (this.onEvent) this.onEvent('taxiOffer', { taxi: this.taxi });
      }
      this.taxiTimer = 12;
    }
    if (this.taxi) {
      const target = this.taxi.pickedUp ? this.taxi.to : this.taxi.from;
      const dx = player.x - target.x;
      const dz = player.z - target.z;
      if (Math.hypot(dx, dz) < 8) {
        if (!this.taxi.pickedUp) {
          this.taxi.pickedUp = true;
          if (this.onEvent) this.onEvent('taxiPickup', { taxi: this.taxi });
        } else {
          const fare = this.taxi.fare;
          this.taxi = null;
          this.taxiTimer = 15;
          if (this.onEvent) this.onEvent('taxiDone', { fare });
        }
      }
    }
  }

  get taxiTarget() {
    if (!this.taxi) return null;
    return this.taxi.pickedUp ? this.taxi.to : this.taxi.from;
  }
}
