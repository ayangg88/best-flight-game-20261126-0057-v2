// Kestrel Bay Mail Run — the game itself: renderer, loop, input, cameras,
// missions, scoring and screens. A golden-hour flight game over a coastal
// bay: take off from Kestrel Field, fly the mail rings, land on the strip
// by the lighthouse before the sun goes down.
import * as THREE from '../vendor/three.module.min.js';
import { WORLD, RUNWAYS, RINGS, MISSIONS, PHYSICS, BEST_KEY, FONT } from './config.js';
import { createFlight, stepFlight, distanceTo, runwayAt, windAt } from './flight.js';
import { createWorld, mulberry32 } from './world.js';
import { createPlane } from './plane.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { shotPlan, autopilotInput, SHOT_NAMES } from './shots.js';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || WORLD.seed);
const shotName = params.get('shot');
const shotMode = shotName && SHOT_NAMES.includes(shotName);

// --- Error collector (headless playtests read this back from the DOM) ------
window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message || e.error)));
window.addEventListener('unhandledrejection', (e) => window.__errors.push('rejection: ' + String(e.reason)));

// --- Renderer, scene, camera ----------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.5, 12000);
camera.position.set(-300, 120, 1100);

const world = createWorld(scene, seed);
const plane = createPlane();
scene.add(plane.group, plane.trail);
const audio = createAudio();
const hud = createHud();

// --- State ------------------------------------------------------------------
const BEST = (() => { try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}'); } catch (e) { return {}; } })();
function saveBest() { try { localStorage.setItem(BEST_KEY, JSON.stringify(BEST)); } catch (e) { /* private mode */ } }

let screen = 'menu'; // menu | playing | paused | over | complete
let mission = MISSIONS.mail;
let flight = null;
let view = 'chase';
let throttle = 0;
let score = 0, combo = 1, lastRingAt = -99, elapsed = 0;
let ringsCollected = 0, beaconsDone = 0;
let simTime = 0, ditchTimer = 0;
let shotFrozen = false;

const keys = {};
let drag = null; // {x, y, dx, dy} while the mouse steers

// --- Overlays ---------------------------------------------------------------
function overlay(id, html) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.style.cssText = `position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:10;font-family:${FONT};background:radial-gradient(ellipse at 50% 30%,rgba(60,20,60,0.55),rgba(10,8,18,0.82));color:#fff;`;
    document.body.appendChild(el);
  }
  el.innerHTML = html;
  el.style.display = 'flex';
  return el;
}
function hideOverlay(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

function showMenu() {
  screen = 'menu';
  const bestMail = BEST.mail ? `Mail Run best: ${fmtClock(BEST.mail)}` : '';
  const bestTrial = BEST.trial ? `Time Trial best: ${fmtClock(BEST.trial)}` : '';
  const el = overlay('menu', `
    <div style="max-width:760px;width:92%;text-align:center;">
      <div style="font-size:13px;letter-spacing:4px;color:#ffb52e;font-weight:700;">GOLDEN HOUR OVER KESTREL BAY</div>
      <h1 style="font-size:52px;margin:8px 0 4px;line-height:1.02;">KESTREL BAY<br>MAIL RUN</h1>
      <p style="font-size:15px;opacity:0.9;margin:0 0 18px;">The sun is going down. Fly the mail rings, drop the rescue
      supplies, and put her down on the strip before dark.</p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
        ${Object.values(MISSIONS).map((m) => `
          <button data-mission="${m.id}" style="pointer-events:auto;cursor:pointer;width:220px;text-align:left;padding:14px;border-radius:14px;border:1px solid rgba(255,255,255,0.3);background:rgba(20,16,28,0.6);color:#fff;font-family:${FONT};">
            <div style="font-size:17px;font-weight:800;color:#ffd27a;">${m.name}</div>
            <div style="font-size:12.5px;opacity:0.9;margin-top:4px;line-height:1.45;">${m.blurb}</div>
            <div style="font-size:12px;margin-top:8px;opacity:0.75;">Par ${Math.floor(m.parSeconds / 60)}:${String(m.parSeconds % 60).padStart(2, '0')}</div>
          </button>`).join('')}
      </div>
      <p style="font-size:13px;opacity:0.85;margin:16px 0 4px;">W/S throttle &nbsp;·&nbsp; Arrows or mouse-drag to steer &nbsp;·&nbsp; A/D rudder &nbsp;·&nbsp; Space brake &nbsp;·&nbsp; V view &nbsp;·&nbsp; P pause &nbsp;·&nbsp; M mute</p>
      <p style="font-size:12px;opacity:0.7;">${bestMail} ${bestTrial ? '· ' + bestTrial : ''} &nbsp;·&nbsp; Referral ye9vf8mj</p>
    </div>`);
  el.querySelectorAll('[data-mission]').forEach((b) => {
    b.addEventListener('click', () => startMission(b.dataset.mission));
  });
}

function showPause() {
  screen = 'paused';
  const el = overlay('pause', `
    <div style="text-align:center;max-width:420px;">
      <h2 style="font-size:38px;margin:0 0 6px;">PAUSED</h2>
      <p style="opacity:0.9;">${mission.name} · ${ringsCollected} rings · ${score} pts · ${fmtClock(elapsed)}</p>
      <button id="btn-resume" style="pointer-events:auto;cursor:pointer;padding:12px 26px;margin:6px;border-radius:10px;border:0;background:#ffb52e;font-weight:800;font-size:15px;">Resume (P)</button>
      <button id="btn-restart" style="pointer-events:auto;cursor:pointer;padding:12px 26px;margin:6px;border-radius:10px;border:1px solid rgba(255,255,255,0.4);background:transparent;color:#fff;font-weight:700;font-size:15px;">Restart</button>
      <button id="btn-menu" style="pointer-events:auto;cursor:pointer;padding:12px 26px;margin:6px;border-radius:10px;border:1px solid rgba(255,255,255,0.4);background:transparent;color:#fff;font-weight:700;font-size:15px;">Missions</button>
    </div>`);
  el.querySelector('#btn-resume').addEventListener('click', () => { hideOverlay('pause'); screen = 'playing'; });
  el.querySelector('#btn-restart').addEventListener('click', () => { hideOverlay('pause'); startMission(mission.id); });
  el.querySelector('#btn-menu').addEventListener('click', () => { hideOverlay('pause'); resetToMenu(); });
}

function showEnd(title, lines, won) {
  screen = won ? 'complete' : 'over';
  if (won) audio.fanfare();
  const el = overlay('end', `
    <div style="text-align:center;max-width:520px;">
      <h2 style="font-size:42px;margin:0 0 8px;color:${won ? '#ffd27a' : '#ff8a7a'};">${title}</h2>
      ${lines.map((l) => `<p style="font-size:16px;margin:6px 0;">${l}</p>`).join('')}
      <button id="btn-again" style="pointer-events:auto;cursor:pointer;padding:12px 26px;margin:14px 6px 0;border-radius:10px;border:0;background:#ffb52e;font-weight:800;font-size:15px;">Fly again (R)</button>
      <button id="btn-menu2" style="pointer-events:auto;cursor:pointer;padding:12px 26px;margin:14px 6px 0;border-radius:10px;border:1px solid rgba(255,255,255,0.4);background:transparent;color:#fff;font-weight:700;font-size:15px;">Missions</button>
    </div>`);
  el.querySelector('#btn-again').addEventListener('click', () => { hideOverlay('end'); startMission(mission.id); });
  el.querySelector('#btn-menu2').addEventListener('click', () => { hideOverlay('end'); resetToMenu(); });
}

function fmtClock(s) {
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}

// --- Mission setup ------------------------------------------------------------
function startMission(id) {
  mission = MISSIONS[id] || MISSIONS.mail;
  hideOverlay('menu'); hideOverlay('end'); hideOverlay('pause');
  const r0 = RUNWAYS[0];
  flight = createFlight({
    startX: r0.x + (RUNWAYS[0].heading === Math.PI * 1.5 ? 220 : 0),
    startY: world.heightAt(r0.x, r0.z) + 1.6,
    startZ: r0.z,
    startHeading: RUNWAYS[0].heading,
  });
  throttle = 0; score = 0; combo = 1; lastRingAt = -99; elapsed = 0;
  ringsCollected = 0; beaconsDone = 0; ditchTimer = 0;
  for (const m of world.ringMeshes) m.visible = true;
  for (const b of world.beacons) {
    b.light.material.emissive.setHex(0xff2a1a);
    b.light.material.emissiveIntensity = 2.5;
  }
  const totalRings = mission.rings ? mission.rings.length : 0;
  const bestText = BEST[mission.id] ? `Best time ${fmtClock(BEST[mission.id])}` : 'Best time —';
  hud.setMission(mission, totalRings, bestText);
  hud.toast(mission.name + ' — ' + mission.blurb, 3200);
  screen = 'playing';
}

function resetToMenu() {
  flight = null;
  showMenu();
  // Park the camera over the bay for the menu backdrop.
  camera.position.set(-900, 260, 1250);
  camera.lookAt(-200, 40, 200);
}

// --- Input --------------------------------------------------------------------
addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  keys[e.key.toLowerCase()] = true;
  audio.unlock();
  if (e.key.toLowerCase() === 'v') {
    view = view === 'chase' ? 'cockpit' : 'chase';
    hud.setDashVisible(view === 'cockpit');
  }
  if (e.key.toLowerCase() === 'm') hud.toast(audio.toggleMute() ? 'Sound muted' : 'Sound on');
  if ((e.key.toLowerCase() === 'p' || e.key === 'Escape') && screen === 'playing') showPause();
  else if ((e.key.toLowerCase() === 'p' || e.key === 'Escape') && screen === 'paused') { hideOverlay('pause'); screen = 'playing'; }
  if (e.key.toLowerCase() === 'r' && (screen === 'over' || screen === 'complete')) { hideOverlay('end'); startMission(mission.id); }
});
addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
renderer.domElement.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
  audio.unlock();
});
addEventListener('pointermove', (e) => {
  if (!drag) return;
  drag.dx = e.clientX - drag.x;
  drag.dy = e.clientY - drag.y;
});
addEventListener('pointerup', () => { drag = null; });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function readInput() {
  let pitch = 0, roll = 0, yaw = 0;
  if (keys['arrowup']) pitch += 1;
  if (keys['arrowdown']) pitch -= 1;
  if (keys['arrowleft']) roll += 1;   // bank left, turn left
  if (keys['arrowright']) roll -= 1;
  if (keys['a']) yaw += 1;
  if (keys['d']) yaw -= 1;
  if (drag) {
    pitch += Math.max(-1, Math.min(1, -drag.dy / 120));
    roll += Math.max(-1, Math.min(1, -drag.dx / 120));
  }
  if (keys['w']) throttle = Math.min(1, throttle + 0.55 * (1 / 60));
  if (keys['s']) throttle = Math.max(0, throttle - 0.7 * (1 / 60));
  return {
    pitch: Math.max(-1, Math.min(1, pitch)),
    roll: Math.max(-1, Math.min(1, roll)),
    yaw: Math.max(-1, Math.min(1, yaw)),
    throttle,
    brake: !!keys[' '],
  };
}

// --- Mission rules --------------------------------------------------------------
function nextTarget() {
  if (mission.id === 'rescue') {
    if (beaconsDone < mission.beacons.length) return { kind: 'beacon', def: mission.beacons[beaconsDone] };
    return { kind: 'land', runway: mission.targetRunway };
  }
  if (ringsCollected < mission.rings.length) {
    return { kind: 'ring', def: mission.rings[ringsCollected] };
  }
  return { kind: 'land', runway: mission.targetRunway };
}

function targetRunway(id) { return RUNWAYS.find((r) => r.id === id); }

function checkMission(dt) {
  const target = nextTarget();
  if (target.kind === 'ring') {
    const d = distanceTo(flight, target.def);
    if (d < PHYSICS.ringRadius) {
      if (elapsed - lastRingAt <= PHYSICS.comboWindow) combo += 1; else combo = 1;
      lastRingAt = elapsed;
      const pts = 100 * combo;
      score += pts;
      ringsCollected += 1;
      world.ringMeshes[target.def.index].visible = false;
      audio.ring(combo);
      hud.toast(combo > 1 ? `RING! +${pts}  (COMBO ×${combo})` : `RING! +${pts}`);
    }
  } else if (target.kind === 'beacon') {
    const d = distanceTo(flight, { x: target.def.x, y: world.heightAt(target.def.x, target.def.z) + 12, z: target.def.z });
    if (d < 70 && flight.speed < 42 && !flight.onGround) {
      const b = world.beacons[beaconsDone];
      b.light.material.emissive.setHex(0x2aff5a);
      beaconsDone += 1;
      score += 300;
      audio.ring(2);
      hud.toast(`Supplies dropped at ${target.def.name}! +300`);
    }
  }
  // Landing completes the mission once the flying objective is done.
  if (target.kind === 'land' && flight.landed) {
    const r = targetRunway(target.runway);
    const onTarget = runwayAt(flight.x, flight.z, RUNWAYS) === target.runway;
    if (onTarget) {
      const timeBonus = Math.max(0, Math.round((mission.parSeconds - elapsed) * 5));
      const landingBonus = 500;
      score += landingBonus + timeBonus;
      if (!BEST[mission.id] || elapsed < BEST[mission.id]) { BEST[mission.id] = Math.round(elapsed); saveBest(); }
      const ringText = mission.rings ? `${ringsCollected}/${mission.rings.length} rings · ` : '';
      showEnd('MISSION COMPLETE', [
        `${mission.name} — landed on ${r.name}.`,
        `${ringText}Time ${fmtClock(elapsed)} (par ${fmtClock(mission.parSeconds)})`,
        `Landing +${landingBonus} · Time bonus +${timeBonus}`,
        `<b>Score ${score}</b> · Best time ${fmtClock(BEST[mission.id])}`,
      ], true);
    }
  }
  // Gentle touchdown without the mission done yet: a soft thud, keep flying.
  if (flight.onGround && flight.lastTouchdownVs < -2 && !flight._thudded) {
    flight._thudded = true;
    audio.thud();
  }
  if (!flight.onGround) flight._thudded = false;
  // Ditched in the bay: floating is not flying.
  if (flight.onGround && world.heightAt(flight.x, flight.z) < WORLD.waterLevel) {
    ditchTimer += dt;
    if (ditchTimer > 2) {
      flight.crashed = true;
      flight.crashReason = 'Ditched in the bay — this plane has no floats';
    }
  } else ditchTimer = 0;
  if (flight.crashed) {
    audio.crash();
    showEnd('CRASHED', [
      flight.crashReason || 'The plane came down hard.',
      `${ringsCollected} rings · Score ${score} · ${fmtClock(elapsed)}`,
      'The mail will have to wait for the next sunset.',
    ], false);
  }
}

function hudNextLabel() {
  const target = nextTarget();
  if (target.kind === 'ring') {
    const d = Math.round(distanceTo(flight, target.def));
    return `Next ring: ${d} m  ·  Zone ${target.def.zone}`;
  }
  if (target.kind === 'beacon') {
    const d = Math.round(distanceTo(flight, { x: target.def.x, y: flight.y, z: target.def.z }));
    return `${target.def.name}: ${d} m — slow below 80 kt to drop`;
  }
  const r = targetRunway(target.runway);
  const d = Math.round(Math.hypot(flight.x - r.x, flight.z - r.z));
  return `Land on ${r.name} — ${d} m`;
}

// --- Cameras ----------------------------------------------------------------------
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
const fwd = new THREE.Vector3();
const planeQuat = new THREE.Quaternion();
const euler = new THREE.Euler(0, 0, 0, 'YXZ');

function updateCamera(dt) {
  if (!flight) return;
  // NOTE: rotation.y is MINUS heading. The model faces -z, and Ry(+h)
  // maps -z to (-sin h, 0, -cos h) — the mirror of the flight model's
  // forward (sin h, 0, -cos h). With +h the plane flew backwards and the
  // cockpit camera looked 180 degrees off the runway.
  euler.set(flight.pitch, -flight.heading, flight.roll);
  planeQuat.setFromEuler(euler);
  plane.group.position.set(flight.x, flight.y, flight.z);
  plane.group.quaternion.copy(planeQuat);
  fwd.set(Math.sin(flight.heading) * Math.cos(flight.pitch), Math.sin(flight.pitch), -Math.cos(flight.heading) * Math.cos(flight.pitch));

  if (view === 'cockpit') {
    // Sit in the cockpit, just behind the canopy, looking over the nose.
    // The canopy hides in this view: from inside, its glass fills the
    // frame, so you see the nose, the prop and the runway instead.
    // The eye sits high and forward, so the fat nose is a bump at the
    // bottom of the windscreen instead of a dome filling the frame.
    plane.canopy.visible = false;
    const eye = new THREE.Vector3(0, 1.6, -1.2).applyQuaternion(planeQuat).add(plane.group.position);
    if (shotMode) camera.position.copy(eye);
    else camera.position.lerp(eye, 1 - Math.exp(-dt * 30));
    camera.quaternion.copy(planeQuat);
    // Cockpit view pitches with the plane but never rolls the horizon away:
    // keep the camera level in roll so the dials stay readable.
    camera.rotateZ(-flight.roll * 0.55);
  } else {
    plane.canopy.visible = true;
    // Chase: back, above and a touch to the side, so the frame shows the
    // plane three-quarter-on with its sunlit side, not dead astern.
    const right = new THREE.Vector3(Math.cos(flight.heading), 0, Math.sin(flight.heading));
    const behind = new THREE.Vector3()
      .copy(fwd).multiplyScalar(-16)
      .add(new THREE.Vector3(0, 5.2, 0))
      .addScaledVector(right, -2.2)
      .add(plane.group.position);
    // Keep the chase camera out of the ground.
    behind.y = Math.max(behind.y, world.heightAt(behind.x, behind.z) + 3);
    // Screenshot scenes snap the camera: under virtual time the lerp
    // never converges, and the plane ends up a speck on the horizon.
    if (shotMode) camera.position.copy(behind);
    else camera.position.lerp(behind, 1 - Math.exp(-dt * 5.5));
    camTarget.copy(plane.group.position).addScaledVector(fwd, 34);
    camTarget.y += 6;
    camera.lookAt(camTarget);
  }
}

// --- Shot mode ----------------------------------------------------------------------
let plan = null;
let shotFrames = 0;
if (shotMode) {
  plan = shotPlan(shotName);
  startMission(plan.mission);
  Object.assign(flight, {
    x: plan.plane.x, y: plan.plane.y, z: plan.plane.z,
    heading: plan.plane.heading, pitch: plan.plane.pitch, roll: plan.plane.roll,
    speed: plan.plane.speed, onGround: false,
  });
  throttle = plan.plane.throttle;
  flight.throttle = throttle;
  ringsCollected = plan.ringsCollected;
  score = plan.score;
  elapsed = plan.elapsed;
  // Hide the rings already "collected" in this staged scene.
  if (mission.rings) {
    for (let i = 0; i < ringsCollected && i < mission.rings.length; i += 1) {
      world.ringMeshes[mission.rings[i].index].visible = false;
    }
  }
  view = plan.camera;
  hud.setDashVisible(view === 'cockpit');
  // Stage the scene with a fixed-step simulation, synchronously, at load:
  // under a headless virtual clock the rAF loop's dt is unreliable, so the
  // shot must not depend on it. The plane then hangs frozen in its pose.
  {
    const env = {
      heightAt: world.heightAt, waterLevel: WORLD.waterLevel, time: 0,
      onRunway: (x, z) => runwayAt(x, z, RUNWAYS),
    };
    const steps = Math.round(plan.simSeconds * 60);
    for (let i = 0; i < steps; i += 1) {
      env.time = i / 60;
      const input = autopilotInput(flight, plan.target);
      input.throttle = throttle;
      stepFlight(flight, input, env, 1 / 60);
      if (flight.crashed) break;
    }
  }
  shotFrozen = true;
  hideOverlay('menu');
  screen = 'playing';
  // Freeze the staged score/time so the frame reads as the plan says.
  window.__shotReady = false;
}

// --- Main loop ------------------------------------------------------------------------
const clock = new THREE.Clock();
let menuOrbit = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  simTime += dt;

  if (screen === 'playing' && flight) {
    let input;
    if (shotMode) {
      // Frozen: the plane hangs in its staged pose for the screenshot.
    } else {
      input = readInput();
      elapsed += dt;
      stepFlight(flight, input, {
        heightAt: world.heightAt,
        waterLevel: WORLD.waterLevel,
        time: simTime,
        onRunway: (x, z) => runwayAt(x, z, RUNWAYS),
      }, dt);
      checkMission(dt);
      audio.update(throttle, flight.speed, !flight.onGround);
    }
    if (shotMode) {
      // The staged HUD never advances.
      hud.update(flight, mission, {
        score: plan.score, elapsed: plan.elapsed,
        ringsCollected: plan.ringsCollected, totalRings: mission.rings.length,
        combo: plan.ringsCollected > 4 ? 3 : 1,
        nextLabel: hudNextLabel(),
      });
    } else {
      hud.update(flight, mission, {
        score, elapsed, ringsCollected,
        totalRings: mission.rings ? mission.rings.length : 0,
        combo,
        nextLabel: hudNextLabel(),
      });
    }
    plane.update(dt, simTime, flight, flight.speed / 98);
  } else if (screen === 'menu') {
    // Slow orbit over the bay behind the menu.
    menuOrbit += dt * 0.02;
    camera.position.set(-900 + Math.sin(menuOrbit) * 350, 240 + Math.sin(menuOrbit * 0.7) * 40, 1250 - Math.cos(menuOrbit) * 200);
    camera.lookAt(-200, 40, 200);
    // Park the plane on the runway for the backdrop.
    if (flight) {
      plane.group.position.set(flight.x, flight.y, flight.z);
      plane.group.rotation.set(0, -flight.heading, 0);
    }
  }

  world.update(dt, simTime, flight ? new THREE.Vector3(flight.x, flight.y, flight.z) : new THREE.Vector3(-200, 60, 500));
  // The menu runs its own slow orbit; every other screen chases the plane.
  if (screen !== 'menu') updateCamera(dt);
  renderer.render(scene, camera);

  if (shotMode) {
    shotFrames += 1;
    if (shotFrames > 150 && !window.__shotReady) {
      window.__shotReady = true;
      document.title = 'shot-ready';
    }
  }
}

// Expose a handle for headless playtests.
window.__game = {
  get screen() { return screen; },
  get flight() { return flight; },
  get mission() { return mission; },
  get score() { return score; },
  get ringsCollected() { return ringsCollected; },
  startMission, showMenu,
};

if (shotMode) {
  animate();
} else {
  showMenu();
  // A parked plane on the runway for the menu backdrop.
  const r0 = RUNWAYS[0];
  flight = createFlight({
    startX: r0.x + 220, startY: world.heightAt(r0.x, r0.z) + 1.6, startZ: r0.z,
    startHeading: RUNWAYS[0].heading,
  });
  animate();
}
