// Kestrel Bay Mail Run — the aircraft: a low-poly mail plane in cream,
// teal and sunset orange, with a spinning prop, blinking nav lights and
// wingtip contrails. Built from primitives; no external model files.
import * as THREE from '../vendor/three.module.js';

export function createPlane() {
  const group = new THREE.Group();
  const cream = new THREE.MeshStandardMaterial({ color: 0xf2e7d0, roughness: 0.55, metalness: 0.15 });
  const teal = new THREE.MeshStandardMaterial({ color: 0x1f7a72, roughness: 0.5, metalness: 0.2 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xe86a1e, roughness: 0.5, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.6, metalness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x9fc4e0, roughness: 0.08, metalness: 0.4,
    emissive: 0xff9a4a, emissiveIntensity: 0.08,
    transparent: true, opacity: 0.3,
  });

  // Fuselage: a tapered cylinder with a rounded nose and a mail-plane tail.
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.55, 5.6, 12), cream);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.castShadow = true;
  group.add(fuselage);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.72, 12, 10), teal);
  nose.scale.set(1, 1, 0.6);
  nose.position.z = -2.8;
  nose.castShadow = true;
  group.add(nose);
  // Teal cheatline stripe down the fuselage.
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.58, 5.0, 12, 1, true, 0, Math.PI * 2), teal);
  stripe.rotation.x = Math.PI / 2;
  stripe.scale.set(1, 1, 0.32);
  stripe.position.y = -0.12;
  group.add(stripe);
  // Canopy: a glass bubble with the pilot's headrest inside.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 10), glass);
  canopy.scale.set(1, 0.75, 1.7);
  canopy.position.set(0, 0.72, -0.7);
  canopy.castShadow = true;
  group.add(canopy);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.4), dark);
  seat.position.set(0, 0.55, -0.35);
  group.add(seat);

  // Wings: a low wing with orange tips and a slight dihedral.
  const wingGeo = new THREE.BoxGeometry(4.6, 0.16, 1.35);
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(wingGeo, cream);
    wing.position.set(side * 2.55, -0.15, -0.35);
    wing.rotation.z = side * 0.06;
    wing.castShadow = true;
    group.add(wing);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 1.35), orange);
    tip.position.set(side * 5.1, -0.15 + side * 0.06 * 2.55, -0.35);
    tip.rotation.z = side * 0.06;
    tip.castShadow = true;
    group.add(tip);
    // Wingtip nav light: red on the left, green on the right.
    const navMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      emissive: side < 0 ? 0xff2020 : 0x20ff50,
      emissiveIntensity: 2.5,
    });
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), navMat);
    nav.position.set(side * 5.5, -0.05, -0.35);
    group.add(nav);
  }
  // Tail: vertical fin in teal with an orange flash, plus stabilisers.
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.5, 1.3), teal);
  fin.position.set(0, 0.85, 2.55);
  fin.rotation.x = -0.18;
  fin.castShadow = true;
  group.add(fin);
  const flash = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 1.0), orange);
  flash.position.set(0, 1.15, 2.5);
  flash.rotation.x = -0.18;
  group.add(flash);
  for (const side of [-1, 1]) {
    const stab = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.85), cream);
    stab.position.set(side * 1.0, 0.2, 2.6);
    stab.castShadow = true;
    group.add(stab);
  }
  // Tail beacon: a white strobe that blinks.
  const strobeMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffffff, emissiveIntensity: 3 });
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), strobeMat);
  strobe.position.set(0, 1.55, 2.75);
  group.add(strobe);

  // Propeller: a hub with two blades, plus a spinner. Spins with RPM.
  const prop = new THREE.Group();
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.8, 10), orange);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -3.35;
  prop.add(spinner);
  const bladeGeo = new THREE.BoxGeometry(0.22, 1.9, 0.09);
  bladeGeo.translate(0, 0.82, 0);
  for (const angle of [0, Math.PI]) {
    const blade = new THREE.Mesh(bladeGeo, dark);
    blade.rotation.z = angle;
    blade.castShadow = true;
    prop.add(blade);
  }
  prop.position.z = -3.1;
  group.add(prop);
  // Engine glow: a warm disc behind the prop that brightens with throttle.
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xff8a2a, transparent: true, opacity: 0.0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.8, 16), glowMat);
  glow.position.z = -3.2;
  group.add(glow);

  // Fixed landing gear: two wheels and a tail wheel.
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 6), dark);
    strut.position.set(side * 0.85, -1.05, -0.5);
    strut.rotation.z = side * 0.25;
    const wheel = new THREE.Mesh(wheelGeo, dark);
    wheel.position.set(side * 1.05, -1.55, -0.5);
    wheel.castShadow = true;
    group.add(strut, wheel);
  }

  // Wingtip contrails: two fading ribbon trails, rebuilt every frame from
  // the last N wingtip positions.
  const TRAIL_N = 42;
  const trailGeo = new THREE.BufferGeometry();
  const trailPos = new Float32Array(TRAIL_N * 3 * 2);
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  const trailMat = new THREE.LineBasicMaterial({
    color: 0xfff2dd, transparent: true, opacity: 0.5,
  });
  const trail = new THREE.Line(trailGeo, trailMat);
  trail.frustumCulled = false;
  // NOTE: the trail lives in world space (its points are world wingtip
  // positions), so main.js adds it to the scene, not to the plane group.
  const trailPoints = [[], []];

  function wingtipWorld(side, out) {
    out.set(side * 5.45, -0.1, -0.35);
    return group.localToWorld(out);
  }

  const tmpV = new THREE.Vector3();
  return {
    group, prop, strobeMat, glowMat, trail, canopy,
    update(dt, t, state, speedNorm) {
      // Prop spins faster with throttle; the blades blur past 60% RPM.
      const rpm = 4 + state.throttle * 46;
      prop.rotation.z -= rpm * dt;
      // Strobe double-blinks once a second.
      const phase = t % 1;
      strobeMat.emissiveIntensity = (phase < 0.06 || (phase > 0.14 && phase < 0.2)) ? 4 : 0.15;
      // Engine glow grows with throttle.
      glowMat.opacity = state.throttle * 0.35;
      // Contrails only when fast and turning or climbing hard.
      const showTrail = state.speed > 55 && (Math.abs(state.roll) > 0.25 || state.pitch > 0.2);
      trail.visible = showTrail;
      if (showTrail) {
        for (let s = 0; s < 2; s += 1) {
          const side = s === 0 ? -1 : 1;
          const pts = trailPoints[s];
          wingtipWorld(side, tmpV);
          pts.unshift(tmpV.clone());
          if (pts.length > TRAIL_N) pts.pop();
          for (let i = 0; i < TRAIL_N; i += 1) {
            const p = pts[Math.min(i, pts.length - 1)] || tmpV;
            trailPos[(s * TRAIL_N + i) * 3] = p.x;
            trailPos[(s * TRAIL_N + i) * 3 + 1] = p.y;
            trailPos[(s * TRAIL_N + i) * 3 + 2] = p.z;
          }
        }
        trailGeo.attributes.position.needsUpdate = true;
        trailMat.opacity = 0.15 + speedNorm * 0.35;
      } else {
        trailPoints[0].length = 0;
        trailPoints[1].length = 0;
      }
    },
  };
}
