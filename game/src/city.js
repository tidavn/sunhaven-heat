// Sunhaven: the city itself. A 9x9 road grid around a downtown core,
// five districts, procedural buildings with lit facades, a beach and
// sea to the west, palms along the Strip. Everything the car and the
// player can hit is an axis-aligned box in `colliders`, and the road
// network is a plain list of coordinates the traffic code drives on.

import * as THREE from 'three';
import { mulberry32, pick, clamp } from './util.js';
import {
  facadeTexture,
  roadTexture,
  sidewalkTexture,
  sandTexture,
  waterTexture,
} from './textures.js';

export const ROAD_STEP = 60;
export const ROAD_COORDS = [-240, -180, -120, -60, 0, 60, 120, 180, 240];
export const ROAD_WIDTH = 14;
export const CITY_EXTENT = 270;
export const BEACH_X = -300;

const DISTRICT_COLORS = {
  downtown: ['#7d8aa0', '#5d6b7d', '#8a7d6b', '#6b7d8a'],
  strip: ['#e8a87c', '#d98a7a', '#c9b458', '#7fb3c8'],
  oldtown: ['#a08a6a', '#8a6f5d', '#96705a'],
  dockside: ['#6e7a6e', '#7a6e5d', '#5d6b6e'],
  marina: ['#8ab3c8', '#c8b08a', '#7d9ab0'],
  midtown: ['#8a94a0', '#a08a7d', '#7d8a7d'],
};

export function districtAt(x, z) {
  if (x < -150) return 'marina';
  if (Math.abs(x) < 90 && Math.abs(z) < 90) return 'downtown';
  if (z < -120) return 'oldtown';
  if (x > 120) return 'dockside';
  if (z > 120) return 'strip';
  return 'midtown';
}

function heightFor(district, rng) {
  if (district === 'downtown') return 40 + rng() * 70;
  if (district === 'strip') return 25 + rng() * 35;
  if (district === 'dockside') return 8 + rng() * 10;
  if (district === 'oldtown') return 10 + rng() * 15;
  if (district === 'marina') return 15 + rng() * 20;
  return 15 + rng() * 30;
}

/** True when the point is on a road (within the asphalt). */
export function isOnRoad(x, z) {
  const near = (v) => {
    for (const c of ROAD_COORDS) if (Math.abs(v - c) <= ROAD_WIDTH / 2) return true;
    return false;
  };
  return near(x) || near(z);
}

/** Nearest point on the road network to (x, z). */
export function nearestRoadPoint(x, z) {
  let bestX = ROAD_COORDS[0];
  let bestZ = ROAD_COORDS[0];
  for (const c of ROAD_COORDS) {
    if (Math.abs(x - c) < Math.abs(x - bestX)) bestX = c;
    if (Math.abs(z - c) < Math.abs(z - bestZ)) bestZ = c;
  }
  // Snap to the nearer axis road.
  if (Math.abs(x - bestX) < Math.abs(z - bestZ)) return { x: bestX, z };
  return { x, z: bestZ };
}

export function buildCity(scene, seed = 20261117) {
  const rng = mulberry32(seed);
  const colliders = [];
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);

  // Facade materials, one per district colour (shared across buildings).
  const facadeMats = {};
  for (const [district, colors] of Object.entries(DISTRICT_COLORS)) {
    facadeMats[district] = colors.map((color) => {
      const tex = new THREE.CanvasTexture(facadeTexture(color, 0.28, rng));
      tex.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
    });
  }
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 1 });

  // Ground, roads, sidewalks.
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x77796b, roughness: 1 });
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_EXTENT * 2 + 120, CITY_EXTENT * 2 + 120),
    groundMat,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(-30, 0, 0);
  ground.receiveShadow = true;
  group.add(ground);

  const roadTex = new THREE.CanvasTexture(roadTexture());
  roadTex.colorSpace = THREE.SRGBColorSpace;
  roadTex.wrapS = THREE.RepeatWrapping;
  roadTex.wrapT = THREE.RepeatWrapping;
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95 });
  const walkTex = new THREE.CanvasTexture(sidewalkTexture());
  walkTex.colorSpace = THREE.SRGBColorSpace;
  walkTex.wrapS = THREE.RepeatWrapping;
  walkTex.wrapT = THREE.RepeatWrapping;
  const walkMat = new THREE.MeshStandardMaterial({ map: walkTex, roughness: 1 });

  for (const c of ROAD_COORDS) {
    const roadNS = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, CITY_EXTENT * 2 + 40), roadMat.clone());
    roadNS.material.map = roadTex.clone();
    roadNS.material.map.needsUpdate = true;
    roadNS.material.map.repeat.set(1, (CITY_EXTENT * 2 + 40) / 14);
    roadNS.rotation.x = -Math.PI / 2;
    roadNS.position.set(c, 0.02, 0);
    roadNS.receiveShadow = true;
    group.add(roadNS);
    const roadEW = new THREE.Mesh(new THREE.PlaneGeometry(CITY_EXTENT * 2 + 40, ROAD_WIDTH), roadMat.clone());
    roadEW.material.map = roadTex.clone();
    roadEW.material.map.needsUpdate = true;
    roadEW.material.map.repeat.set((CITY_EXTENT * 2 + 40) / 14, 1);
    roadEW.rotation.x = -Math.PI / 2;
    roadEW.position.set(0, 0.03, c);
    roadEW.receiveShadow = true;
    group.add(roadEW);
  }

  // Neon signs live on the faces of Strip buildings, so they are
  // always flush with a wall the street can see.
  const neonMats = [0xff2d78, 0x00e5ff, 0xffd23c, 0x7c5cff].map((c) => new THREE.MeshStandardMaterial({
    color: 0x111111, emissive: c, emissiveIntensity: 2.2,
  }));
  let neonIdx = 0;
  // The neon signs live under one group so the boot code can dim them
  // by day and blaze them at night.
  const neonGroup = new THREE.Group();
  neonGroup.name = 'neon';
  group.add(neonGroup);

  // Buildings, one or two per block.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const acGeo = new THREE.BoxGeometry(1, 1, 1);
  for (let ix = 0; ix < ROAD_COORDS.length - 1; ix += 1) {
    for (let iz = 0; iz < ROAD_COORDS.length - 1; iz += 1) {
      const cx = (ROAD_COORDS[ix] + ROAD_COORDS[ix + 1]) / 2;
      const cz = (ROAD_COORDS[iz] + ROAD_COORDS[iz + 1]) / 2;
      const district = districtAt(cx, cz);
      const count = district === 'dockside' ? 1 : rng() < 0.55 ? 2 : 1;
      for (let b = 0; b < count; b += 1) {
        const w = 18 + rng() * 20;
        const d = 18 + rng() * 20;
        const h = heightFor(district, rng);
        const ox = count === 1 ? 0 : (b === 0 ? -11 : 11);
        const oz = count === 1 ? 0 : (b === 0 ? 9 : -9);
        const x = cx + ox;
        const z = cz + oz;
        const mat = pick(rng, facadeMats[district]);
        const mesh = new THREE.Mesh(boxGeo, mat);
        mesh.scale.set(w, h, d);
        mesh.position.set(x, h / 2, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        const roof = new THREE.Mesh(acGeo, roofMat);
        roof.scale.set(Math.min(6, w * 0.3), 2, Math.min(6, d * 0.3));
        roof.position.set(x + w * 0.15, h + 1, z - d * 0.15);
        roof.castShadow = true;
        group.add(roof);
        if (district === 'strip' && rng() > 0.35) {
          const signMat = neonMats[neonIdx % neonMats.length];
          neonIdx += 1;
          // Hang the sign on the corner nearest the road, so it reads
          // down the street instead of hiding at the building's centre.
          const signX = x + (x < 0 ? w / 2 - 3 : -(w / 2 - 3));
          const signY = Math.min(8, h * 0.3);
          const signS = new THREE.Mesh(new THREE.BoxGeometry(12, 3, 0.6), signMat);
          signS.position.set(signX, signY, z + d / 2 + 0.35);
          neonGroup.add(signS);
          const signN = new THREE.Mesh(new THREE.BoxGeometry(12, 3, 0.6), signMat);
          signN.position.set(signX, signY, z - d / 2 - 0.35);
          neonGroup.add(signN);
        }
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      }
      // Sidewalk slab for the block.
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(46, 46), walkMat.clone());
      walk.material.map = walkTex.clone();
      walk.material.map.needsUpdate = true;
      walk.material.map.repeat.set(3, 3);
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(cx, 0.05, cz);
      walk.receiveShadow = true;
      group.add(walk);
    }
  }

  // Beach and sea to the west.
  const sandTex = new THREE.CanvasTexture(sandTexture());
  sandTex.colorSpace = THREE.SRGBColorSpace;
  sandTex.wrapS = THREE.RepeatWrapping;
  sandTex.wrapT = THREE.RepeatWrapping;
  sandTex.repeat.set(6, 10);
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(60, CITY_EXTENT * 2 + 120),
    new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(-300, 0.04, 0);
  sand.receiveShadow = true;
  group.add(sand);

  const seaTex = new THREE.CanvasTexture(waterTexture());
  seaTex.colorSpace = THREE.SRGBColorSpace;
  seaTex.wrapS = THREE.RepeatWrapping;
  seaTex.wrapT = THREE.RepeatWrapping;
  seaTex.repeat.set(10, 12);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(400, CITY_EXTENT * 2 + 200),
    new THREE.MeshStandardMaterial({ map: seaTex, roughness: 0.35, metalness: 0.1 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(-530, -0.4, 0);
  group.add(sea);

  // Palm trees along the Strip and the beachfront.
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e8b57, roughness: 0.9 });
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 7, 6);
  const leafGeo = new THREE.IcosahedronGeometry(2.2, 0);
  const palmSpots = [];
  for (let z = -240; z <= 240; z += 30) {
    palmSpots.push([-262, z + 8]);
    palmSpots.push([252, z + 8]);
  }
  for (let x = -240; x <= 240; x += 40) {
    palmSpots.push([x + 8, 252]);
  }
  for (const [px, pz] of palmSpots) {
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(px, 3.5, pz);
    trunk.castShadow = true;
    group.add(trunk);
    const leaves = new THREE.Mesh(leafGeo, leafMat);
    leaves.scale.set(1, 0.55, 1);
    leaves.position.set(px, 7.6, pz);
    leaves.castShadow = true;
    group.add(leaves);
  }

  return {
    group,
    colliders,
    sea,
    seaTex,
    /** Push a circle (x, z, radius) out of every building it overlaps. */
    resolveCollision(x, z, radius) {
      let px = x;
      let pz = z;
      for (const c of colliders) {
        const cx = clamp(px, c.minX, c.maxX);
        const cz = clamp(pz, c.minZ, c.maxZ);
        const dx = px - cx;
        const dz = pz - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < radius * radius) {
          if (d2 > 0.0001) {
            const d = Math.sqrt(d2);
            px = cx + (dx / d) * radius;
            pz = cz + (dz / d) * radius;
          } else {
            // Dead centre: push out along the smallest penetration axis.
            const pl = px - (c.minX - radius);
            const pr = (c.maxX + radius) - px;
            const pt = pz - (c.minZ - radius);
            const pb = (c.maxZ + radius) - pz;
            const m = Math.min(pl, pr, pt, pb);
            if (m === pl) px = c.minX - radius;
            else if (m === pr) px = c.maxX + radius;
            else if (m === pt) pz = c.minZ - radius;
            else pz = c.maxZ + radius;
          }
        }
      }
      return { x: px, z: pz };
    },
    /** Keep a point inside the playable city (plus the beach). */
    clampToCity(x, z, margin = 4) {
      return {
        x: clamp(x, BEACH_X + margin, CITY_EXTENT - margin),
        z: clamp(z, -CITY_EXTENT + margin, CITY_EXTENT - margin),
      };
    },
  };
}
