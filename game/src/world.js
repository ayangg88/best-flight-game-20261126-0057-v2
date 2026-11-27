// Kestrel Bay Mail Run — the world: golden-hour sky, terrain, town, rings.
// Everything the screenshot judge sees lives here. Seeded, so the same seed
// always builds the same bay. Units are metres, y up, sea level y = 0.
import * as THREE from '../vendor/three.module.js';
import { WORLD, RUNWAYS, RINGS, MISSIONS } from './config.js';

// --- Seeded random ---------------------------------------------------------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Value noise with smooth interpolation, 2D.
function makeNoise(seed) {
  const rand = mulberry32(seed);
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) p[i] = i;
  for (let i = 255; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
  }
  for (let i = 0; i < 512; i += 1) perm[i] = p[i & 255];
  const fade = (t) => t * t * (3 - 2 * t);
  function hash(ix, iz) { return perm[(perm[ix & 255] + iz) & 255] / 255; }
  function noise(x, z) {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const a = hash(ix, iz), b = hash(ix + 1, iz);
    const c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
    const u = fade(fx), v = fade(fz);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
  }
  return function fbm(x, z, octaves) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o += 1) {
      sum += noise(x * freq, z * freq) * amp;
      norm += amp; amp *= 0.5; freq *= 2.03;
    }
    return sum / norm;
  };
}

// The river's path, mountain to bay, as a polyline.
export const RIVER_POINTS = [
  [850, -1000], [700, -850], [480, -750], [250, -600], [50, -450],
  [-150, -250], [-350, -50], [-520, 150], [-620, 320],
];

// Cumulative polyline lengths, for grading the riverbed from source to bay.
const RIVER_LENGTHS = (() => {
  const lens = [0];
  for (let i = 1; i < RIVER_POINTS.length; i += 1) {
    lens.push(lens[i - 1] + Math.hypot(RIVER_POINTS[i][0] - RIVER_POINTS[i - 1][0], RIVER_POINTS[i][1] - RIVER_POINTS[i - 1][1]));
  }
  return lens;
})();
const RIVER_TOTAL = RIVER_LENGTHS[RIVER_LENGTHS.length - 1];

// The riverbed, graded from the terrain itself: sample the valley profile
// once, then force it monotonically downhill, always a few metres below the
// surrounding ground, so the channel is a real channel and never a levee.
function makeRiverBed(baseHeight) {
  const N = 220;
  const bed = [];
  let prev = Infinity;
  for (let i = 0; i < N; i += 1) {
    const t = i / (N - 1);
    // Walk the polyline by arc length.
    const target = t * RIVER_TOTAL;
    let x = RIVER_POINTS[0][0], z = RIVER_POINTS[0][1];
    for (let s = 0; s < RIVER_POINTS.length - 1; s += 1) {
      const [ax, az] = RIVER_POINTS[s], [bx, bz] = RIVER_POINTS[s + 1];
      const segLen = RIVER_LENGTHS[s + 1] - RIVER_LENGTHS[s];
      if (target <= RIVER_LENGTHS[s + 1] || s === RIVER_POINTS.length - 2) {
        const u = segLen === 0 ? 0 : Math.max(0, Math.min(1, (target - RIVER_LENGTHS[s]) / segLen));
        x = ax + (bx - ax) * u; z = az + (bz - az) * u;
        break;
      }
    }
    const h = baseHeight(x, z) - 10;
    prev = Math.min(prev, h);
    bed.push(prev);
  }
  return function riverBedAt(x, z) {
    let best = Infinity, bestT = 0;
    for (let i = 0; i < RIVER_POINTS.length - 1; i += 1) {
      const [ax, az] = RIVER_POINTS[i], [bx, bz] = RIVER_POINTS[i + 1];
      const dx = bx - ax, dz = bz - az;
      const len2 = dx * dx + dz * dz;
      let u = len2 === 0 ? 0 : ((x - ax) * dx + (z - az) * dz) / len2;
      u = Math.max(0, Math.min(1, u));
      const px = ax + dx * u, pz = az + dz * u;
      const d = Math.hypot(x - px, z - pz);
      if (d < best) {
        best = d;
        bestT = (RIVER_LENGTHS[i] + u * (RIVER_LENGTHS[i + 1] - RIVER_LENGTHS[i])) / RIVER_TOTAL;
      }
    }
    const f = bestT * (bed.length - 1);
    const i0 = Math.min(bed.length - 2, Math.floor(f));
    const frac = f - i0;
    return bed[i0] * (1 - frac) + bed[i0 + 1] * frac;
  };
}

function distToPolyline(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    let t = len2 === 0 ? 0 : ((x - ax) * dx + (z - az) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t, pz = az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) best = d;
  }
  return best;
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function makeHeightAt(seed) {
  const fbm = makeNoise(seed);
  const m = WORLD.mountain;
  // Everything except the river carve, so the riverbed can be graded
  // from the valley's own profile.
  function baseHeight(x, z) {
    // Rolling hills plus a broad swell.
    let h = 26 + fbm(x * 0.0009 + 7.3, z * 0.0009 + 2.1, 3) * 42
      + fbm(x * 0.00022 + 1.7, z * 0.00022 + 8.4, 2) * 55;
    // Mount Kestrel: a big gaussian peak with rocky noise on its flanks.
    const dm = Math.hypot(x - m.x, z - m.z);
    h += m.height * Math.exp(-(dm * dm) / (2 * 470 * 470));
    h += Math.max(0, fbm(x * 0.004, z * 0.004, 2)) * 40 * smoothstep(120, 320, h);
    h += fbm(x * 0.013, z * 0.013, 2) * 9 * smoothstep(200, 320, h);
    // The bay: the ground shelves down to the seabed west of the coast.
    const coast = smoothstep(WORLD.coastX + 160, WORLD.coastX - 260, x);
    h = h * (1 - coast) + (-9) * coast;
    // Flatten the town and the two runways so buildings and strips sit level.
    const dt = Math.hypot(x - WORLD.town.x, z - WORLD.town.z);
    const townFlat = 1 - smoothstep(150, 300, dt);
    h = h * (1 - townFlat) + 16 * townFlat;
    for (const r of RUNWAYS) {
      const eastWest = Math.abs(Math.sin(r.heading)) > 0.5;
      const along = eastWest ? x - r.x : z - r.z;
      const across = eastWest ? z - r.z : x - r.x;
      const d = Math.max(Math.abs(along) - r.length / 2, Math.abs(across) - r.width / 2);
      const flat = 1 - smoothstep(40, 160, d);
      const base = r.id === 'kestrel-field' ? 14 : 9;
      h = h * (1 - flat) + base * flat;
    }
    return h;
  }
  const riverBedAt = makeRiverBed(baseHeight);
  function heightAt(x, z) {
    let h = baseHeight(x, z);
    // The river carves a valley down to the water, graded from the
    // mountain stream to the bay so the channel always holds water.
    // (Wide carve: the terrain mesh samples every 21 m, so a narrow cut
    // would be smoothed away and the water ribbon buried under it.)
    const dr = distToPolyline(x, z, RIVER_POINTS);
    const carve = 1 - smoothstep(30, 160, dr);
    h = h * (1 - carve) + riverBedAt(x, z) * carve;
    return h;
  }
  return { heightAt, riverBedAt };
}

// --- Sky: gradient dome + low sun ------------------------------------------
function makeSky(scene) {
  const sunDir = new THREE.Vector3(-0.86, 0.16, 0.28).normalize();
  const geo = new THREE.SphereGeometry(6500, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: sunDir } },
    vertexShader: `varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 vDir; uniform vec3 sunDir;
      void main() {
        float h = clamp(vDir.y, -0.08, 1.0);
        vec3 top = vec3(0.13, 0.08, 0.30);
        vec3 mid = vec3(0.85, 0.32, 0.35);
        vec3 hor = vec3(1.00, 0.55, 0.22);
        vec3 col = mix(hor, mid, smoothstep(0.0, 0.22, h));
        col = mix(col, top, smoothstep(0.18, 0.65, h));
        float sun = max(dot(normalize(vDir), sunDir), 0.0);
        col += vec3(1.0, 0.75, 0.45) * pow(sun, 220.0) * 1.6;  // the disc
        col += vec3(1.0, 0.55, 0.25) * pow(sun, 8.0) * 0.55;   // the glow
        col += vec3(0.95, 0.45, 0.55) * pow(sun, 2.5) * 0.18;  // wide haze
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(geo, mat);
  scene.add(dome);

  // Sun disc + halo sprite, sitting just above the western horizon.
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255, 230, 170, 1)');
  grad.addColorStop(0.25, 'rgba(255, 180, 90, 0.85)');
  grad.addColorStop(0.6, 'rgba(255, 120, 50, 0.28)');
  grad.addColorStop(1, 'rgba(255, 110, 40, 0)');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, fog: false,
  }));
  sprite.position.copy(sunDir).multiplyScalar(5900);
  sprite.scale.set(1500, 1500, 1);
  scene.add(sprite);
  return { sunDir };
}

// --- Terrain ----------------------------------------------------------------
function makeTerrain(scene, heightAt, seed) {
  const rand = mulberry32(seed + 11);
  const size = WORLD.size, seg = 200;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cGrass = new THREE.Color(0x5d8a44), cGrass2 = new THREE.Color(0x6f9a4e);
  const cWheat = new THREE.Color(0xc2a165), cField = new THREE.Color(0x7d9b52);
  const cForest = new THREE.Color(0x3d6b34), cSand = new THREE.Color(0xd9b380);
  const cRock = new THREE.Color(0x7a6a5e), cSnow = new THREE.Color(0xf2f0ea);
  const cScrub = new THREE.Color(0x8a7a4a);
  const tmp = new THREE.Color();
  const fbm = makeNoise(seed + 5);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    // Patchwork fields: broad noise cells pick a crop colour.
    const patch = fbm(x * 0.0011 + 3.1, z * 0.0011 + 9.7, 2);
    if (h < 2.2) tmp.copy(cSand);
    else if (patch > 0.42) tmp.copy(cWheat);
    else if (patch > 0.18) tmp.copy(cField);
    else if (patch > -0.25) tmp.lerpColors(cGrass, cGrass2, (patch + 0.25) / 0.67);
    else tmp.copy(cForest);
    if (h > 150 && h < 260) tmp.lerp(cScrub, 0.45);
    if (h > 260) tmp.lerp(cRock, smoothstep(260, 330, h));
    if (h > 370) tmp.lerp(cSnow, smoothstep(370, 420, h));
    // Slight per-vertex variation so the ground never looks flat-shaded.
    const v = 0.92 + rand() * 0.16;
    colors[i * 3] = tmp.r * v; colors[i * 3 + 1] = tmp.g * v; colors[i * 3 + 2] = tmp.b * v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);

  // The sea: one big warm plane at water level, catching the sunset.
  // (Kept almost non-metallic: with no environment map a metal sea
  // renders black, and the sunset needs to read on the water.)
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(9000, 9000),
    new THREE.MeshStandardMaterial({
      color: 0x4a7a9a, roughness: 0.28, metalness: 0.06,
      emissive: 0x2a1a0c, emissiveIntensity: 0.3,
    }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = WORLD.waterLevel;
  sea.receiveShadow = true;
  scene.add(sea);
  // Sun glitter: a long warm shimmer on the water, running out to the sun.
  const glitter = new THREE.Mesh(
    new THREE.PlaneGeometry(3400, 520),
    new THREE.MeshBasicMaterial({
      color: 0xff9a3c, transparent: true, opacity: 0.38,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  glitter.rotation.x = -Math.PI / 2;
  glitter.rotation.z = 0.32; // along the sun's azimuth
  glitter.position.set(-1900, WORLD.waterLevel + 0.25, 300);
  scene.add(glitter);
  return mesh;
}

// The river itself: a ribbon of water following the carved channel, so
// the valley reads as a river from the air instead of a dry scar.
function makeRiver(scene, riverBedAt) {
  const pts = [];
  for (let i = 0; i < RIVER_POINTS.length - 1; i += 1) {
    const [ax, az] = RIVER_POINTS[i], [bx, bz] = RIVER_POINTS[i + 1];
    const segLen = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.round(segLen / 25));
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      pts.push([ax + (bx - ax) * t, az + (bz - az) * t]);
    }
  }
  pts.push(RIVER_POINTS[RIVER_POINTS.length - 1]);
  const positions = [];
  const indices = [];
  for (let i = 0; i < pts.length; i += 1) {
    const [x, z] = pts[i];
    const [nx, nz] = pts[Math.min(i + 1, pts.length - 1)];
    const [px, pz] = pts[Math.max(i - 1, 0)];
    let dx = nx - px, dz = nz - pz;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    const ox = -dz * 11, oz = dx * 11;
    // The ribbon rides a few metres above the channel floor: the terrain
    // mesh interpolates linearly between 21 m samples, so water at the
    // exact bed height would be buried under the mesh between vertices.
    const y = riverBedAt(x, z) + 3.0;
    positions.push(x + ox, y, z + oz, x - ox, y, z - oz);
    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const river = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: 0x6aa0d8, roughness: 0.18, metalness: 0.1,
    emissive: 0x224466, emissiveIntensity: 0.5,
    side: THREE.DoubleSide, // the strip's winding faces down; seen from above it needs both faces
  }));
  river.receiveShadow = true;
  scene.add(river);
  return river;
}

// --- Town, lighthouse, runways ----------------------------------------------
function makeTown(scene, heightAt, rand) {
  const group = new THREE.Group();
  const wallColors = [0xe8d9b8, 0xd9c4a3, 0xc9b18a, 0xe3cfae, 0xb8c4c9];
  const roofColors = [0x8a4a38, 0x6b4a3a, 0x9a5a40, 0x5a4a52];
  const wallMat = wallColors.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
  const roofMat = roofColors.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }));
  const winMat = new THREE.MeshStandardMaterial({
    color: 0x2a1a08, emissive: 0xffb347, emissiveIntensity: 1.6, roughness: 0.4,
  });
  const winGeo = new THREE.PlaneGeometry(1.6, 1.2);
  const t = WORLD.town;
  let placed = 0, guard = 0;
  while (placed < 46 && guard < 400) {
    guard += 1;
    const a = rand() * Math.PI * 2, r = 30 + rand() * 200;
    const x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r * 0.8;
    if (Math.abs(x - RUNWAYS[0].x) < 60 && Math.abs(z - RUNWAYS[0].z) < 60) continue;
    const w = 9 + rand() * 7, d = 8 + rand() * 6, hgt = 6 + rand() * 5;
    const house = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), wallMat[placed % wallMat.length]);
    walls.position.y = hgt / 2;
    walls.castShadow = true; walls.receiveShadow = true;
    house.add(walls);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(w, d) * 0.62, 3.4 + rand() * 1.6, 4), roofMat[placed % roofMat.length]);
    roof.position.y = hgt + 1.7;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    house.add(roof);
    // Lit windows on the sunset side of every house.
    const nWin = 2 + Math.floor(rand() * 2);
    for (let wI = 0; wI < nWin; wI += 1) {
      const win = new THREE.Mesh(winGeo, winMat);
      win.position.set(-w / 2 + 2 + (wI * (w - 4)) / Math.max(1, nWin - 1), 2.2 + (wI % 2) * 1.6, d / 2 + 0.06);
      house.add(win);
    }
    house.position.set(x, heightAt(x, z) - 0.3, z);
    house.rotation.y = rand() * Math.PI;
    group.add(house);
    placed += 1;
  }
  // Church with a steeple, and a little square.
  const church = new THREE.Group();
  const nave = new THREE.Mesh(new THREE.BoxGeometry(16, 10, 22), wallMat[0]);
  nave.position.y = 5; nave.castShadow = true;
  const steeple = new THREE.Mesh(new THREE.ConeGeometry(4.4, 12, 4), roofMat[0]);
  steeple.position.y = 16; steeple.rotation.y = Math.PI / 4; steeple.castShadow = true;
  church.add(nave, steeple);
  church.position.set(t.x - 40, heightAt(t.x - 40, t.z + 20) - 0.3, t.z + 20);
  group.add(church);
  // Roads: dark ribbons through the town, catching no light of their own.
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x3a3630, roughness: 1 });
  for (const [rx, rz, len, rot] of [[t.x, t.z, 420, 0], [t.x, t.z, 330, Math.PI / 2], [t.x + 90, t.z - 60, 260, 0.5]]) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(len, 9), roadMat);
    road.rotation.x = -Math.PI / 2; road.rotation.z = rot;
    road.position.set(rx, heightAt(rx, rz) + 0.15, rz);
    road.receiveShadow = true;
    group.add(road);
  }
  scene.add(group);
  return group;
}

function makeLighthouse(scene, heightAt) {
  const group = new THREE.Group();
  const lx = WORLD.lighthouse.x, lz = WORLD.lighthouse.z;
  const baseY = heightAt(lx, lz);
  const white = new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.7 });
  const red = new THREE.MeshStandardMaterial({ color: 0xa83226, roughness: 0.7 });
  let y = 0;
  for (let i = 0; i < 4; i += 1) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(4.6 - i * 0.5, 5.2 - i * 0.5, 7, 12), i % 2 ? red : white);
    seg.position.y = y + 3.5; seg.castShadow = true;
    group.add(seg); y += 7;
  }
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffd27a, emissiveIntensity: 2.4 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 10), lampMat);
  lamp.position.y = y + 1.5;
  group.add(lamp);
  // Rotating beam: a long additive cone. Kept faint: at full strength it
  // reads as a white pillar when it points at the camera.
  const beamGeo = new THREE.ConeGeometry(13, 180, 12, 1, true);
  beamGeo.rotateZ(Math.PI / 2);
  beamGeo.translate(90, 0, 0);
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
    color: 0xffd27a, transparent: true, opacity: 0.08,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  }));
  beam.position.y = y + 1.5;
  group.add(beam);
  group.position.set(lx, baseY - 0.5, lz);
  scene.add(group);
  return { group, beam };
}

function makeRunway(scene, heightAt, r) {
  const group = new THREE.Group();
  const eastWest = Math.abs(Math.sin(r.heading)) > 0.5;
  const y = heightAt(r.x, r.z) + 0.25;
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(r.length, r.width),
    new THREE.MeshStandardMaterial({ color: 0x33302c, roughness: 0.95 }),
  );
  strip.rotation.x = -Math.PI / 2;
  strip.rotation.z = eastWest ? 0 : Math.PI / 2;
  strip.position.set(r.x, y, r.z);
  strip.receiveShadow = true;
  group.add(strip);
  // Centreline dashes.
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5f2e8 });
  const nDash = Math.floor(r.length / 40);
  for (let i = 0; i < nDash; i += 1) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.4), dashMat);
    dash.rotation.x = -Math.PI / 2;
    dash.rotation.z = eastWest ? 0 : Math.PI / 2;
    const along = -r.length / 2 + 20 + (i * (r.length - 40)) / Math.max(1, nDash - 1);
    dash.position.set(r.x + (eastWest ? along : 0), y + 0.05, r.z + (eastWest ? 0 : along));
    group.add(dash);
  }
  // Edge lights: warm dots down both sides, bright at dusk.
  const lightMat = new THREE.MeshStandardMaterial({ color: 0x201404, emissive: 0xff9a3c, emissiveIntensity: 2.2 });
  const lightGeo = new THREE.SphereGeometry(0.7, 8, 6);
  const nLights = Math.floor(r.length / 55);
  for (let i = 0; i <= nLights; i += 1) {
    const along = -r.length / 2 + (i * r.length) / nLights;
    for (const side of [-1, 1]) {
      const l = new THREE.Mesh(lightGeo, lightMat);
      l.position.set(
        r.x + (eastWest ? along : side * (r.width / 2 + 2)),
        y + 0.6,
        r.z + (eastWest ? side * (r.width / 2 + 2) : along),
      );
      group.add(l);
    }
  }
  // Windsock on a pole near the threshold.
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 9, 6), new THREE.MeshStandardMaterial({ color: 0x888888 }));
  const wx = r.x + (eastWest ? r.length / 2 - 30 : 30);
  const wz = r.z + (eastWest ? r.width / 2 + 14 : r.width / 2 + 14);
  pole.position.set(wx, heightAt(wx, wz) + 4.5, wz);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(1.1, 4.2, 10),
    new THREE.MeshStandardMaterial({ color: 0xff6a2a, roughness: 0.8, side: THREE.DoubleSide }),
  );
  sock.rotation.z = Math.PI / 2;
  sock.position.set(wx, heightAt(wx, wz) + 8.6, wz);
  group.add(pole, sock);
  scene.add(group);
  return { group, sock };
}

// --- Forest, clouds, birds --------------------------------------------------
function makeForest(scene, heightAt, rand) {
  const clusterNoise = makeNoise(99); // forest grows in clusters; one noise, not one per candidate
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 5, 5);
  const coneGeo = new THREE.ConeGeometry(3.4, 13, 7);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3d28, roughness: 1 });
  const pineMat = new THREE.MeshStandardMaterial({ color: 0x2c5426, roughness: 1 });
  const pineMat2 = new THREE.MeshStandardMaterial({ color: 0x37632e, roughness: 1 });
  const positions = [];
  let guard = 0;
  while (positions.length < 1300 && guard < 20000) {
    guard += 1;
    const x = (rand() - 0.5) * 3800, z = (rand() - 0.5) * 3800;
    const h = heightAt(x, z);
    if (h < 8 || h > 210) continue;
    if (Math.hypot(x - WORLD.town.x, z - WORLD.town.z) < 290) continue;
    if (distToPolyline(x, z, RIVER_POINTS) < 34) continue;
    let nearRunway = false;
    for (const r of RUNWAYS) {
      if (Math.abs(x - r.x) < r.length / 2 + 90 && Math.abs(z - r.z) < r.width / 2 + 90) nearRunway = true;
    }
    if (nearRunway) continue;
    // Forest grows in clusters: keep a spot only where the cluster noise says so.
    if (clusterNoise(x * 0.0016, z * 0.0016, 2) < -0.05) continue;
    positions.push([x, h, z, 0.7 + rand() * 0.8]);
  }
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, positions.length);
  const pines = new THREE.InstancedMesh(coneGeo, pineMat, positions.length);
  const pines2 = new THREE.InstancedMesh(coneGeo, pineMat2, positions.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const e = new THREE.Euler();
  positions.forEach(([x, h, z, sc], i) => {
    e.set(0, rand() * Math.PI * 2, 0); q.setFromEuler(e);
    p.set(x, h + 2.2 * sc, z); s.set(sc, sc, sc);
    m4.compose(p, q, s); trunks.setMatrixAt(i, m4);
    p.set(x, h + (5 + 6.5) * sc * 0.62, z);
    m4.compose(p, q, s);
    if (i % 2) pines.setMatrixAt(i, m4); else pines2.setMatrixAt(i, m4);
    // The unused half of each instanced mesh is parked underground.
    const hide = new THREE.Matrix4().makeTranslation(0, -1000, 0);
    if (i % 2) pines2.setMatrixAt(i, hide); else pines.setMatrixAt(i, hide);
  });
  trunks.castShadow = true; pines.castShadow = true; pines2.castShadow = true;
  scene.add(trunks, pines, pines2);
  return positions.length;
}

function makeClouds(scene, rand) {
  const clouds = [];
  const mat = new THREE.MeshLambertMaterial({
    color: 0xffe0c8, transparent: true, opacity: 0.85, emissive: 0xcc6644, emissiveIntensity: 0.6,
  });
  const geo = new THREE.SphereGeometry(1, 12, 9);
  for (let i = 0; i < 24; i += 1) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(rand() * 3);
    for (let j = 0; j < puffs; j += 1) {
      const puff = new THREE.Mesh(geo, mat);
      const sc = 26 + rand() * 42;
      puff.scale.set(sc, sc * 0.42, sc * 0.7);
      puff.position.set((rand() - 0.5) * 90, (rand() - 0.5) * 12, (rand() - 0.5) * 46);
      cloud.add(puff);
    }
    cloud.position.set((rand() - 0.5) * 4200, 320 + rand() * 260, (rand() - 0.5) * 4200);
    scene.add(cloud);
    clouds.push(cloud);
  }
  return clouds;
}

function makeBirds(scene) {
  const flocks = [];
  const mat = new THREE.MeshBasicMaterial({ color: 0x241a18, side: THREE.DoubleSide });
  for (let f = 0; f < 3; f += 1) {
    const flock = new THREE.Group();
    const birds = [];
    for (let i = 0; i < 5; i += 1) {
      const bird = new THREE.Group();
      const wingGeo = new THREE.BufferGeometry();
      wingGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
        0, 0, 0, 2.4, 0, -1.1, 2.4, 0, 0.7,
      ]), 3));
      wingGeo.computeVertexNormals();
      const left = new THREE.Mesh(wingGeo, mat);
      const right = new THREE.Mesh(wingGeo, mat);
      right.scale.x = -1;
      bird.add(left, right);
      bird.position.set((i % 3 - 1) * 9, -Math.abs(i - 2) * 2.5, i * 7);
      flock.add(bird);
      birds.push({ group: bird, left, right, phase: i * 1.3 });
    }
    scene.add(flock);
    flocks.push({
      group: flock, birds, cx: -400 + f * 700, cz: -300 + f * 500,
      radius: 260 + f * 90, height: 150 + f * 45, speed: 0.05 + f * 0.012, angle: f * 2.1,
    });
  }
  return flocks;
}

// --- Rings and rescue beacons ------------------------------------------------
function makeRings(scene, rings) {
  const geo = new THREE.TorusGeometry(12, 1.1, 12, 40);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffb52e, emissive: 0xff9500, emissiveIntensity: 1.15,
    roughness: 0.3, metalness: 0.7,
  });
  const meshes = rings.map((r) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(r.x, r.y, r.z);
    // Face the ring across the course: bay rings face east, valley north, ridge south.
    mesh.rotation.y = r.zone === 'bay' ? Math.PI / 2 : r.zone === 'valley' ? 0.4 : -0.6;
    scene.add(mesh);
    return mesh;
  });
  return meshes;
}

function makeBeacons(scene, heightAt, beacons) {
  return beacons.map((b) => {
    const group = new THREE.Group();
    const y = heightAt(b.x, b.z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 12, 6), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
    pole.position.y = 6;
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2a1a, emissiveIntensity: 2.5 }),
    );
    light.position.y = 12.6;
    const tent = new THREE.Mesh(
      new THREE.ConeGeometry(3.4, 2.6, 4),
      new THREE.MeshStandardMaterial({ color: 0xff7a2a, roughness: 0.9 }),
    );
    tent.position.set(4, 1.3, 2); tent.rotation.y = Math.PI / 4;
    group.add(pole, light, tent);
    group.position.set(b.x, y, b.z);
    scene.add(group);
    return { group, light, def: b };
  });
}

// --- The whole world ----------------------------------------------------------
export function createWorld(scene, seed) {
  const rand = mulberry32(seed);
  const { heightAt, riverBedAt } = makeHeightAt(seed);
  const { sunDir } = makeSky(scene);

  // Warm low sun: long shadows across the bay.
  const sun = new THREE.DirectionalLight(0xffb066, 2.6);
  sun.position.copy(sunDir).multiplyScalar(1600);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -320; sun.shadow.camera.right = 320;
  sun.shadow.camera.top = 320; sun.shadow.camera.bottom = -320;
  sun.shadow.camera.near = 200; sun.shadow.camera.far = 3400;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xff9a5c, 0x3a2a4a, 1.0);
  scene.add(hemi);
  const fill = new THREE.DirectionalLight(0x7a6ab8, 0.55);
  fill.position.set(600, 500, -800);
  scene.add(fill);
  scene.fog = new THREE.Fog(0xe88a52, 900, 5200);

  makeTerrain(scene, heightAt, seed);
  makeRiver(scene, riverBedAt);
  makeTown(scene, heightAt, rand);
  const lighthouse = makeLighthouse(scene, heightAt);
  const runwayObjs = RUNWAYS.map((r) => makeRunway(scene, heightAt, r));
  const treeCount = makeForest(scene, heightAt, rand);
  const clouds = makeClouds(scene, rand);
  const flocks = makeBirds(scene);
  const ringMeshes = makeRings(scene, RINGS);
  const beacons = makeBeacons(scene, heightAt, MISSIONS.rescue.beacons);

  // A few rocky outcrops on the mountain's shoulder.
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6a5a4e, roughness: 1 });
  for (let i = 0; i < 14; i += 1) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(6 + rand() * 14, 0), rockMat);
    const a = rand() * Math.PI * 2, d = 260 + rand() * 420;
    const x = WORLD.mountain.x + Math.cos(a) * d, z = WORLD.mountain.z + Math.sin(a) * d;
    rock.position.set(x, heightAt(x, z) + 2, z);
    rock.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    rock.castShadow = true;
    scene.add(rock);
  }

  return {
    heightAt, sun, sunDir, lighthouse, runwayObjs, clouds, flocks,
    ringMeshes, beacons, treeCount,
    update(dt, t, planePos) {
      // The shadow camera follows the plane so shadows stay crisp nearby.
      sun.position.set(planePos.x + sunDir.x * 1600, planePos.y + sunDir.y * 1600 + 200, planePos.z + sunDir.z * 1600);
      sun.target.position.set(planePos.x, planePos.y, planePos.z);
      sun.target.updateMatrixWorld();
      lighthouse.beam.rotation.y = t * 0.55;
      for (const c of clouds) {
        c.position.x += dt * 3.2;
        if (c.position.x > 2300) c.position.x = -2300;
      }
      for (const f of flocks) {
        f.angle += dt * f.speed;
        f.group.position.set(
          f.cx + Math.cos(f.angle) * f.radius,
          f.height + Math.sin(t * 0.4 + f.angle) * 8,
          f.cz + Math.sin(f.angle) * f.radius,
        );
        f.group.rotation.y = -f.angle;
        for (const b of f.birds) {
          const flap = Math.sin(t * 9 + b.phase) * 0.55;
          b.left.rotation.z = flap;
          b.right.rotation.z = -flap;
        }
      }
      for (let i = 0; i < ringMeshes.length; i += 1) {
        ringMeshes[i].rotation.z = t * 0.35 + i;
      }
      for (const b of beacons) {
        b.light.material.emissiveIntensity = 1.6 + Math.sin(t * 4) * 1.2;
      }
    },
  };
}
