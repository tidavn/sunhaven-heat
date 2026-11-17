// The world: everything in Sunhaven that moves, and the rules that
// tie it together. The world owns the city, the traffic, the police,
// the missions, the side activities and the player, and steps them in
// one fixed order every frame. It returns events (mission passed,
// busted, coin picked up...) for the boot code to show and sound.

import * as THREE from 'three';
import { buildCity, nearestRoadPoint } from './city.js';
import { createCarState, createCarMesh, stepCar, syncCarMesh, CAR_RADIUS } from './vehicles.js';
import { Traffic, createPersonMesh } from './traffic.js';
import { Police } from './police.js';
import { MissionSystem, SideActivities, MISSIONS } from './missions.js';
import {
  createPlayer, stepOnFoot, damagePlayer, punch, shoot,
  nearestStealableCar, enterCar, exitCar, PLAYER_WALK_SPEED,
} from './player.js';
import { mulberry32, pick, clamp, dist2D } from './util.js';
import { CAR_PAINTS } from './textures.js';

const PARKED_SPOTS = [
  { x: 30, z: -60 }, { x: -90, z: 30 }, { x: 60, z: 120 },
  { x: -150, z: -180 }, { x: 150, z: 60 }, { x: -30, z: 180 },
  { x: 210, z: -30 }, { x: -210, z: 150 },
];

export function createWorld(scene) {
  const city = buildCity(scene);
  const traffic = new Traffic(scene, city);
  const police = new Police(scene, city);
  const missions = new MissionSystem(scene);
  const side = new SideActivities(scene);
  const player = createPlayer(scene, 0, 0);
  const rng = mulberry32(99);

  // Empty parked cars the player can take for free.
  const parked = [];
  for (const spot of PARKED_SPOTS) {
    const state = createCarState(spot.x, spot.z, (rng() * Math.PI * 2), {
      maxSpeed: 30, color: pick(rng, CAR_PAINTS),
    });
    state.mesh = createCarMesh({ color: state.color });
    state.mesh.group.position.set(state.x, 0, state.z);
    state.mesh.group.rotation.y = state.heading;
    scene.add(state.mesh.group);
    parked.push(state);
  }

  const world = {
    scene,
    city,
    traffic,
    police,
    missions,
    side,
    player,
    parked,
    hour: 12,
    day: 1,
    events: [],
    storyCompleteShown: false,
    time: 0,
  };

  /** Every car state in the world (traffic + parked + police + player's). */
  function allCars() {
    const list = [];
    for (const c of traffic.cars) list.push(c.state);
    for (const c of parked) list.push(c);
    for (const c of police.cars) list.push(c.state);
    if (player.car && !list.includes(player.car)) list.push(player.car);
    return list;
  }

  function emit(type, data = {}) {
    world.events.push({ type, ...data });
  }

  missions.onEvent = (type, data) => {
    if (type === 'missionPassed') {
      player.cash += data.reward;
      emit('missionPassed', data);
    } else if (type === 'setWanted') {
      police.stars = Math.max(police.stars, data.stars);
      police.heat = 0;
      police.quietTimer = 0;
    } else {
      emit(type, data);
    }
  };
  side.onEvent = (type, data) => {
    if (type === 'coin') {
      player.cash += data.reward;
      emit('coin', data);
    } else if (type === 'taxiDone') {
      player.cash += data.fare;
      emit('taxiDone', data);
    } else {
      emit(type, data);
    }
  };

  /** Put the player at a landmark and clear trouble (used after busted/wasted). */
  function respawn() {
    if (player.car) {
      parked.push(player.car);
      player.car = null;
    }
    player.x = 0;
    player.z = 0;
    player.heading = 0;
    player.onFoot = true;
    player.health = player.maxHealth;
    player.mesh.group.visible = true;
    player.mesh.group.position.set(0, 0, 0);
    police.clear();
  }

  function handleBusted() {
    const fine = Math.min(player.cash, 150);
    player.cash -= fine;
    respawn();
    emit('busted', { fine });
  }

  function handleWasted() {
    const fine = Math.min(player.cash, 100);
    player.cash -= fine;
    respawn();
    emit('wasted', { fine });
  }

  /** Step the whole simulation one fixed step. */
  function step(dt, input, camera, nowSeconds) {
    world.time += dt;
    const p = player;
    const cars = allCars();

    // --- Player -------------------------------------------------------
    if (p.onFoot) {
      const drag = input.dragDelta();
      camera.orbit(drag.dx, drag.dy);
      // Movement relative to the camera's yaw.
      const yaw = camera.heading;
      let mx = 0;
      let mz = 0;
      if (input.isDown('forward')) { mx += Math.sin(yaw); mz += Math.cos(yaw); }
      if (input.isDown('back')) { mx -= Math.sin(yaw); mz -= Math.cos(yaw); }
      if (input.isDown('left')) { mx -= Math.cos(yaw); mz += Math.sin(yaw); }
      if (input.isDown('right')) { mx += Math.cos(yaw); mz -= Math.sin(yaw); }
      stepOnFoot(p, { x: mx, z: mz }, input.isDown('sprint'), dt, city);

      if (input.wasPressed('enterCar')) {
        const car = nearestStealableCar(p, cars);
        if (car) {
          const wasTraffic = traffic.cars.some((c) => c.state === car);
          if (wasTraffic) {
            traffic.cars = traffic.cars.filter((c) => c.state !== car);
            police.addHeat(0.5, 'car theft');
            emit('toast', { text: 'You jacked a car! The SPD noticed.' });
          } else {
            parked.splice(parked.indexOf(car), 1);
          }
          enterCar(p, car);
          emit('enterCar', {});
        }
      }
      if (input.wasPressed('punch')) {
        const victim = punch(p, traffic.peds, police.officers);
        if (victim) {
          emit('punch', { kind: victim.kind });
          if (victim.kind === 'ped') {
            traffic.knockDown(victim.ref);
            police.addHeat(0.25, 'assault');
          } else {
            const idx = police.officers.indexOf(victim.ref);
            if (idx >= 0) {
              scene.remove(victim.ref.mesh.group);
              police.officers.splice(idx, 1);
            }
            police.addHeat(0.75, 'assault on officer');
          }
        }
      }
      if (input.wasPressed('shoot')) {
        const victim = shoot(p, camera.heading, traffic.peds, police.officers, cars);
        if (victim) {
          emit('shoot', { kind: victim.kind });
          if (victim.kind === 'ped') {
            traffic.knockDown(victim.ref);
            police.addHeat(0.5, 'shooting');
          } else if (victim.kind === 'cop') {
            const idx = police.officers.indexOf(victim.ref);
            if (idx >= 0) {
              scene.remove(victim.ref.mesh.group);
              police.officers.splice(idx, 1);
            }
            police.addHeat(1, 'shooting an officer');
          } else if (victim.kind === 'car') {
            victim.ref.speed *= 0.4;
          }
        }
      }
      if (input.wasPressed('weapon')) {
        if (p.armed) {
          p.pistol.visible = !p.pistol.visible;
          emit('toast', { text: p.pistol.visible ? 'Pistol out.' : 'Pistol away.' });
        }
      }
      // Police cars can run the player over on foot.
      for (const car of police.cars) {
        const d = dist2D(car.state.x, car.state.z, p.x, p.z);
        if (d < 2.6 && Math.abs(car.state.speed) > 2) {
          if (damagePlayer(p, 18, nowSeconds)) {
            handleWasted();
            return;
          }
          p.x += (p.x - car.state.x) * 0.6;
          p.z += (p.z - car.state.z) * 0.6;
        }
      }
    } else if (p.car) {
      // --- Driving ----------------------------------------------------
      const throttle = (input.isDown('forward') ? 1 : 0) + (input.isDown('back') ? -1 : 0);
      const steer = (input.isDown('left') ? -1 : 0) + (input.isDown('right') ? 1 : 0);
      const drag = input.dragDelta();
      camera.orbit(drag.dx, drag.dy);
      const before = p.car.speed;
      const events = stepCar(p.car, { throttle, steer, handbrake: input.isDown('handbrake') }, dt, city, cars);
      syncCarMesh(p.car, dt);
      p.x = p.car.x;
      p.z = p.car.z;
      p.heading = p.car.heading;
      if (events.hitWall && Math.abs(before) > 8) emit('crash', {});
      if (input.wasPressed('enterCar')) {
        const car = p.car;
        exitCar(p, city);
        parked.push(car);
        emit('exitCar', {});
      }
      // Running over a pedestrian is a crime, and it shows.
      for (const ped of traffic.peds) {
        if (ped.down > 0) continue;
        const d = dist2D(ped.x, ped.z, p.x, p.z);
        if (d < 2.2 && Math.abs(p.car.speed) > 3) {
          traffic.knockDown(ped);
          police.addHeat(0.5, 'hit pedestrian');
          emit('toast', { text: 'You hit a pedestrian!' });
        }
      }
      // Ramming a police car raises the heat.
      for (const car of police.cars) {
        const d = dist2D(car.state.x, car.state.z, p.x, p.z);
        if (d < CAR_RADIUS * 2 && Math.abs(p.car.speed) > 6) {
          police.addHeat(0.2, 'ramming police');
        }
      }
    }

    // --- Traffic, police, missions, side activities -------------------
    const danger = (p.car && Math.abs(p.car.speed) > 12) || (!p.onFoot && p.car)
      ? { x: p.x, z: p.z }
      : null;
    traffic.step(dt, allCars(), p.car, danger);
    const policeResult = police.step(dt, p, allCars(), (opts) => createPersonMesh(opts));
    if (policeResult === 'busted') {
      handleBusted();
      return;
    }
    const missionResult = missions.update(dt, p);
    if (missionResult === 'failed') emit('missionFailed', {});
    side.update(dt, p, !!p.car);

    // Pistol unlock: after the third mission's briefing the player is armed.
    if (missions.index >= 2 && !p.armed) {
      p.armed = true;
      p.ammo = 12;
      p.pistol.visible = true;
    }
    if (p.ammo === 0 && p.armed) {
      // Ammo refills at each new mission.
      if (missions.state === 'briefing') p.ammo = 12;
    }

    // Camera follows the player.
    camera.step(dt, p, !p.onFoot, p.car ? Math.abs(p.car.speed) : p.speed);
  }

  /** Reset the world to a known scene for screenshots and tests. */
  function resetToShot(name) {
    respawn();
    player.cash = 1250;
    missions.skipToFreeRoam();
    side.coins = side.coins; // keep coins as built
    if (name === 'chase') {
      world.hour = 19;
      world.day = 3;
      // Mission 5 is live: three stars, one gate, the whole SPD behind you.
      missions.index = 4;
      missions.startBriefing();
      missions.begin();
      const car = parked[0];
      parked.splice(0, 1);
      enterCar(player, car);
      player.car.x = 0;
      player.car.z = -60;
      player.car.heading = 0;
      player.car.speed = 22;
      player.x = 0;
      player.z = -60;
      player.heading = 0;
      police._spawnCar(0, -60);
      police._spawnCar(0, -60);
      // Flank the player car, alongside and just behind it, so both
      // cruisers read in frame without blocking the camera.
      const flank = [[-8, -3], [8, -4]];
      police.cars.forEach((c, i) => {
        c.state.x = player.x + flank[i][0];
        c.state.z = player.z + flank[i][1];
        c.state.heading = 0;
        c.state.speed = 20;
      });
      // The getaway car is a bright red coupe so it reads at a glance.
      player.car.mesh.group.children[0].material.color.setHex(0xd23c2a);
    } else if (name === 'downtown') {
      world.hour = 12;
      world.day = 1;
      // Day 1 before the first mission: the city, not the epilogue.
      missions.index = 0;
      missions.state = 'idle';
      player.x = 0;
      player.z = 30;
      player.heading = Math.PI;
      // Put the street to work: traffic on the road and pedestrians on
      // the sidewalks around the player, so the frame is a living city.
      const carSpots = [
        { z: 70, heading: 0, targetZ: 180 },
        { z: 100, heading: Math.PI, targetZ: -180 },
        { z: -25, heading: 0, targetZ: 180 },
        { z: -55, heading: Math.PI, targetZ: -180 },
      ];
      carSpots.forEach((spot, i) => {
        const car = traffic.cars[i];
        if (!car) return;
        car.state.x = 0;
        car.state.z = spot.z;
        car.state.heading = spot.heading;
        car.state.speed = 8 + i;
        car.target = { x: 0, z: spot.targetZ };
      });
      const pedSpots = [
        { x: -9, z: 45 }, { x: 9, z: 15 }, { x: -9, z: 5 },
        { x: 9, z: 55 }, { x: -9, z: 60 },
      ];
      pedSpots.forEach((spot, i) => {
        const ped = traffic.peds[i];
        if (!ped) return;
        ped.x = spot.x;
        ped.z = spot.z;
        ped.heading = Math.PI * (i % 2);
        ped.target = { x: -spot.x, z: spot.z + 40 };
      });
    } else if (name === 'mission') {
      world.hour = 16;
      world.day = 1;
      missions.index = 1;
      missions.startBriefing();
      missions.begin();
      const car = parked[2];
      parked.splice(2, 1);
      enterCar(player, car);
      player.car.x = 0;
      player.car.z = 60;
      player.car.heading = Math.PI;
      player.car.speed = 14;
      player.x = 0;
      player.z = 60;
      player.heading = Math.PI;
    } else if (name === 'strip') {
      world.hour = 22;
      world.day = 3;
      // On the road into the Strip at night, walking south toward the
      // neon row — the hotels and their signs flank the street ahead.
      player.x = 0;
      player.z = 120;
      player.heading = 0;
      player.armed = true;
      player.ammo = 12;
      player.pistol.visible = true;
    }
    player.mesh.group.position.set(player.x, 0, player.z);
    player.mesh.group.rotation.y = player.heading;
  }

  world.step = step;
  world.respawn = respawn;
  world.allCars = allCars;
  world.resetToShot = resetToShot;
  world.missionList = MISSIONS;
  return world;
}
