// Boot and the one loop for Sunhaven Heat: the renderer and sky, the
// world, the HUD, the menus, and the fixed-step simulation. The game
// moves between five screens: title, play, paused, mission and end.
// ?shot=chase|downtown|mission|strip (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import * as THREE from 'three';
import { createWorld } from './world.js';
import { Input } from './input.js';
import { FollowCamera } from './camera.js';
import { Hud } from './hud.js';
import { AudioEngine } from './audio.js';
import { saveGame, loadGame } from './save.js';
import { stageShot } from './shots.js';
import { STEP } from './util.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261117;

const canvas = document.getElementById('game');
const status = document.getElementById('status');

// --- Renderer and lights ---------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5e0);
scene.fog = new THREE.Fog(0xa8c4de, 120, 700);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 1.0);
scene.add(hemi);
// A soft floor of light so no face of the city is ever pitch black.
scene.add(new THREE.AmbientLight(0xffffff, 0.35));
const sun = new THREE.DirectionalLight(0xfff2d9, 1.7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -320;
sun.shadow.camera.right = 320;
sun.shadow.camera.top = 320;
sun.shadow.camera.bottom = -320;
sun.shadow.camera.far = 900;
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(sun.target);

// --- Sky: the time of day sets sun, sky, fog and neon -----------------
const SKY_KEYS = [
  { h: 6, sky: 0x9fc3e8, sun: 0xffe0b3, sunI: 1.2, hemi: 0.75 },
  { h: 12, sky: 0x87b5e0, sun: 0xfff2d9, sunI: 1.8, hemi: 1.0 },
  { h: 16, sky: 0xf2c078, sun: 0xffd9a0, sunI: 1.6, hemi: 0.9 },
  { h: 18, sky: 0xff9a5c, sun: 0xff8c42, sunI: 1.35, hemi: 0.7 },
  { h: 20, sky: 0x2a3550, sun: 0x8090c0, sunI: 0.5, hemi: 0.55 },
  { h: 22, sky: 0x0d1526, sun: 0x8fa8d8, sunI: 0.6, hemi: 0.5 },
  { h: 24, sky: 0x0d1526, sun: 0x8fa8d8, sunI: 0.35, hemi: 0.32 },
];

function setTimeOfDay(hour) {
  const h = ((hour % 24) + 24) % 24;
  let a = SKY_KEYS[0];
  let b = SKY_KEYS[SKY_KEYS.length - 1];
  for (let i = 0; i < SKY_KEYS.length - 1; i += 1) {
    if (h >= SKY_KEYS[i].h && h <= SKY_KEYS[i + 1].h) {
      a = SKY_KEYS[i];
      b = SKY_KEYS[i + 1];
      break;
    }
  }
  const t = b.h === a.h ? 0 : (h - a.h) / (b.h - a.h);
  const mix = (ca, cb) => {
    const colA = new THREE.Color(ca);
    const colB = new THREE.Color(cb);
    return colA.lerp(colB, t);
  };
  const skyColor = mix(a.sky, b.sky);
  scene.background = skyColor;
  scene.fog.color.copy(skyColor);
  sun.color.copy(mix(a.sun, b.sun));
  sun.intensity = a.sunI + (b.sunI - a.sunI) * t;
  hemi.intensity = a.hemi + (b.hemi - a.hemi) * t;
  // Sun arcs east to west through the day; at night it is the moon, low.
  const angle = ((h - 6) / 12) * Math.PI;
  const elevation = Math.max(0.12, Math.sin(angle));
  sun.position.set(Math.cos(angle) * 400, elevation * 420 + 40, 180);
  sun.target.position.set(0, 0, 0);
  // Neon signs blaze at night and sit quiet by day.
  const neonOn = h >= 19.5 || h < 6;
  scene.traverse((obj) => {
    if (obj.isMesh && obj.parent && obj.parent.name === 'neon') {
      obj.material.emissiveIntensity = neonOn ? 2.4 : 0.55;
    }
  });
}

// --- World, camera, HUD, input, audio ---------------------------------
const world = createWorld(scene);
const followCam = new FollowCamera(camera, world.city);
const audio = new AudioEngine();
const input = new Input(canvas);

let screen = 'title';
let titleOrbit = 0;
let savedRecord = loadGame();

function announce(message) {
  status.textContent = message;
}

function applySave(record) {
  world.missions.index = record.missionIndex ?? 0;
  world.player.cash = record.cash ?? 0;
  world.player.health = record.health ?? 100;
  world.day = record.day ?? 1;
  if (record.player) {
    world.player.x = record.player.x;
    world.player.z = record.player.z;
  } else {
    world.player.x = record.playerX ?? 0;
    world.player.z = record.playerZ ?? 0;
  }
  for (let i = 0; i < (record.coinsCollected ?? 0) && i < world.side.coins.length; i += 1) {
    world.side.coins[i].taken = true;
    world.side.coins[i].mesh.visible = false;
  }
  world.side.coinsCollected = record.coinsCollected ?? 0;
}

function doSave() {
  const ok = saveGame({
    missionIndex: world.missions.index,
    cash: world.player.cash,
    health: world.player.health,
    coinsCollected: world.side.coinsCollected,
    playerX: world.player.x,
    playerZ: world.player.z,
    day: world.day,
  });
  hud.toast(ok ? 'Game saved.' : 'Could not save in this browser.');
}

function startPlay() {
  screen = 'play';
  hud.hideAllScreens();
  hud.showHud(true);
  announce('Playing Sunhaven Heat.');
}

function startMissionBriefing() {
  world.missions.startBriefing();
  screen = 'mission';
  hud.showMission('briefing', world.missions.current);
  announce(`Day ${world.missions.current.day}: ${world.missions.current.title}.`);
}

function newGame() {
  world.missions.index = 0;
  world.missions.active = null;
  world.missions.state = 'idle';
  world.missions.beacon.visible = false;
  world.player.cash = 0;
  world.player.health = world.player.maxHealth;
  world.player.armed = false;
  world.player.ammo = 0;
  world.player.pistol.visible = false;
  world.day = 1;
  world.hour = 12;
  world.storyCompleteShown = false;
  for (const coin of world.side.coins) {
    coin.taken = false;
    coin.mesh.visible = true;
  }
  world.side.coinsCollected = 0;
  world.side.taxi = null;
  world.respawn();
  setTimeOfDay(world.hour);
  startMissionBriefing();
}

function continueGame() {
  if (!savedRecord) return;
  applySave(savedRecord);
  world.hour = 12;
  setTimeOfDay(world.hour);
  startMissionBriefing();
}

const hud = new Hud(document, {
  onNewGame: () => {
    audio.ensure();
    newGame();
  },
  onContinue: () => {
    audio.ensure();
    continueGame();
  },
  onResume: () => startPlay(),
  onSave: () => doSave(),
  onQuitToTitle: () => {
    screen = 'title';
    savedRecord = loadGame();
    hud.showTitle(!!savedRecord);
    announce('Sunhaven Heat. Press Enter or click New Game to start.');
  },
  onMissionStart: () => {
    audio.ensure();
    world.hour = world.missions.current.hour;
    world.day = world.missions.current.day;
    setTimeOfDay(world.hour);
    world.missions.begin();
    startPlay();
  },
  onMissionNext: () => {
    if (world.missions.index >= world.missionList.length) {
      screen = 'end';
      hud.showEnd('story', 'June made it out. The plane is gone, the debts are paid, and Sunhaven is hers now — free roam, taxi fares and sun coins, no one left to run from.');
      world.storyCompleteShown = true;
    } else {
      startMissionBriefing();
    }
  },
  onMissionRetry: () => {
    world.missions.retry();
    hud.showMission('briefing', world.missions.current);
  },
  onEndContinue: () => {
    if (screen === 'end' && world.missions.index >= world.missionList.length && !world.storyCompleteShown) {
      world.storyCompleteShown = true;
    }
    startPlay();
  },
});

input.onPause = () => {
  if (screen === 'play') {
    screen = 'paused';
    hud.showPause();
    announce('Paused.');
  } else if (screen === 'paused') {
    startPlay();
  }
};
input.onMute = () => {
  audio.setMuted(!audio.muted);
  hud.toast(audio.muted ? 'Sound off.' : 'Sound on.');
};
input.onConfirm = () => {
  if (screen === 'title') {
    audio.ensure();
    if (savedRecord) continueGame();
    else newGame();
  }
};

function handleWorldEvents() {
  for (const event of world.events.splice(0)) {
    if (event.type === 'toast') hud.toast(event.text);
    else if (event.type === 'enterCar') { audio.ensure(); hud.toast('You are driving. W/S to drive, Space to handbrake.'); }
    else if (event.type === 'exitCar') hud.toast('On foot. E near a car to take it.');
    else if (event.type === 'punch') audio.punch();
    else if (event.type === 'shoot') {
      if (event.kind === 'dry') hud.toast('Out of ammo — it refills at the next mission.');
      else audio.gunshot();
    } else if (event.type === 'crash') audio.crash();
    else if (event.type === 'coin') {
      audio.coin();
      hud.toast(`Sun coin ${event.count}/10 — +$50.`);
    } else if (event.type === 'taxiOffer') {
      hud.toast(`Taxi fare: pick up at ${event.taxi.from.name}, take them to ${event.taxi.to.name} — $${event.taxi.fare}.`);
    } else if (event.type === 'taxiPickup') {
      hud.toast(`Passenger aboard — drive to ${event.taxi.to.name}.`);
    } else if (event.type === 'taxiDone') {
      audio.pickup();
      hud.toast(`Fare complete — +$${event.fare}.`);
    } else if (event.type === 'missionPassed') {
      audio.missionDone();
      doSave();
      screen = 'mission';
      hud.showMission('passed', event.mission);
      announce(`Mission passed. ${event.reward} dollars.`);
    } else if (event.type === 'missionFailed') {
      audio.missionFail();
      screen = 'mission';
      hud.showMission('failed', world.missions.current, 'Try it again — the city is not going anywhere.');
      announce('Mission failed.');
    } else if (event.type === 'busted') {
      audio.busted();
      screen = 'end';
      hud.showEnd('busted', `The SPD caught up with you. Fine $${event.fine} — and the wanted level is wiped clean.`);
      announce('Busted.');
    } else if (event.type === 'wasted') {
      audio.busted();
      screen = 'end';
      hud.showEnd('wasted', `You went down. The medics patched you up for $${event.fine} and dropped you at Civic Plaza.`);
      announce('Wasted.');
    } else if (event.type === 'briefing') {
      // The mission screen is shown by the caller.
    }
  }
}

function updateHud() {
  const p = world.player;
  hud.setStars(world.police.stars);
  hud.setCash(p.cash);
  hud.setHealth(p.health, p.maxHealth);
  hud.setClock(world.day, world.hour);
  const mission = world.missions.active;
  if (mission && world.missions.state === 'active') {
    const step = world.missions.currentStep;
    let dist = null;
    if (step && step.point) dist = Math.hypot(p.x - step.point.x, p.z - step.point.z);
    hud.setObjective(`${mission.title}`, step ? step.text : '', dist, world.missions.timer > 0 ? world.missions.timer : null);
  } else if (world.missions.state === 'storyDone' || world.missions.index >= world.missionList.length) {
    hud.setObjective('FREE ROAM', 'Story complete — taxi fares and sun coins around the city.', null, null);
  } else {
    hud.setObjective('SUNHAVEN', 'Follow the next mission when you are ready.', null, null);
  }
  hud.setSpeed(p.car ? Math.abs(p.car.speed) * 3.6 : 0, !!p.car);
  hud.drawMinimap(world);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  world.hour += dt / 240; // One game hour per four real minutes.
  if (world.hour >= 24) {
    world.hour -= 24;
    world.day += 1;
  }
  setTimeOfDay(world.hour);
  world.city.seaTex.offset.x += dt * 0.004;
  if (screen === 'title') {
    // A slow orbit over the plaza behind the title screen.
    titleOrbit += dt * 0.05;
    camera.position.set(Math.sin(titleOrbit) * 90, 42, Math.cos(titleOrbit) * 90);
    camera.lookAt(0, 10, 0);
    const stub = { isDown: () => false, wasPressed: () => false, dragDelta: () => ({ dx: 0, dy: 0 }), endFrame: () => {} };
    world.step(STEP, stub, followCam, now / 1000);
    world.events.length = 0;
  } else if (screen === 'play') {
    let acc = dt;
    while (acc >= STEP) {
      world.step(STEP, input, followCam, now / 1000);
      acc -= STEP;
    }
    handleWorldEvents();
    updateHud();
    const speed = world.player.car ? Math.abs(world.player.car.speed) : 0;
    audio.engine(speed, world.player.car ? world.player.car.maxSpeed : 1);
    audio.siren(world.police.stars > 0 && world.police.cars.length > 0, now / 1000);
    input.endFrame();
  }
  renderer.render(scene, camera);
}

let last = performance.now();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === 'play') {
    screen = 'paused';
    hud.showPause();
    announce('Paused.');
  }
});

// A small debug handle for play-testing (positions, screens, missions).
window.__game = {
  world,
  screen: () => screen,
  version: 1,
};

function runShot(name) {
  stageShot(name, world, followCam, 0);
  setTimeOfDay(world.hour);
  updateHud();
  hud.showHud(true);
  let painted = 0;
  function paint() {
    renderer.render(scene, camera);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

if (shot) {
  runShot(shot);
} else {
  setTimeOfDay(world.hour);
  hud.showTitle(!!savedRecord);
  announce('Sunhaven Heat. Press Enter or click New Game to start.');
  requestAnimationFrame(frame);
}
