// Screenshot scenes for Sunhaven Heat: ?shot=chase|downtown|mission|strip
// (with &seed=N) stages a real gameplay moment and plays it forward a
// fixed number of steps with scripted inputs, so the frame is what a
// short game really looks like and the same seed always gives the same
// frame. The boot code renders it twice and sets window.__shotReady.

import { STEP } from './util.js';
import { syncCarMesh } from './vehicles.js';

const STEPS = 90; // 1.5 seconds of play per scene.

function scriptedInput(held) {
  return {
    isDown: (action) => held.has(action),
    wasPressed: () => false,
    dragDelta: () => ({ dx: 0, dy: 0 }),
    endFrame: () => {},
  };
}

/** Stage the named scene and return nothing; the caller renders it. */
export function stageShot(name, world, camera, nowSeconds) {
  const scene = name === 'chase' || name === 'downtown' || name === 'mission' || name === 'strip'
    ? name
    : 'downtown';
  world.resetToShot(scene);
  const held = new Set();
  if (scene === 'chase' || scene === 'mission') held.add('forward');
  if (scene === 'downtown' || scene === 'strip') held.add('forward');
  const input = scriptedInput(held);
  for (let i = 0; i < STEPS; i += 1) {
    world.step(STEP, input, camera, nowSeconds + i * STEP);
  }
  if (scene === 'chase') {
    // The cruisers converge on the player while the scene plays, and
    // one of them ends up between the camera and the car — put them
    // back on the player's flanks for the frame, then sync the meshes.
    // The player's car is put back on the centre of its lane at
    // driving speed: the rams during staging can wedge it against a
    // wall, and the frame is a car mid-chase, not a car parked.
    const p0 = world.player;
    if (p0.car) {
      p0.car.x = 0;
      p0.car.heading = 0;
      p0.car.speed = 22;
      p0.x = 0;
      p0.heading = 0;
      syncCarMesh(p0.car, STEP);
    }
    const flank = [[-4.5, -4], [4.5, -4]];
    world.police.cars.forEach((c, i) => {
      // The first two cruisers flank the car; any extra cruisers the
      // wanted level spawned hang back down the street, out of the way
      // of the camera.
      const spot = i < 2 ? flank[i] : [(i % 2 ? -1 : 1) * 5, -18 - i * 6];
      c.state.x = p0.x + spot[0];
      c.state.z = p0.z + spot[1];
      c.state.heading = p0.heading;
      c.state.speed = 20;
      syncCarMesh(c.state, STEP);
    });
  }
  // Put the camera where the shot wants it: behind the car for the
  // chase and the mission drive, over the shoulder downtown, low and
  // wide on the Strip at night.
  const p = world.player;
  if (scene === 'downtown') {
    camera.yaw = p.heading;
    camera.snap(p, false, 5.5);
  } else if (scene === 'strip') {
    camera.yaw = p.heading;
    camera.pitch = 0.22;
    camera.snap(p, false, 6);
  } else {
    camera.snap(p, !p.onFoot);
  }
  return scene;
}
