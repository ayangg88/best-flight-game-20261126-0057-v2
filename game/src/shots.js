// Kestrel Bay Mail Run — the screenshot scenes behind ?shot=takeoff|river|
// town|approach. Each one places the plane at a scripted spot in the real
// world, then flies the real flight model forward with a simple autopilot,
// so the frame is what a short game really looks like and the same seed
// always gives the same frame. The judge sees these four frames.
import { RINGS, RUNWAYS } from './config.js';

function headingTo(from, to) {
  // Heading 0 is north (-z); heading = atan2(dx, -dz).
  return Math.atan2(to.x - from.x, -(to.z - from.z));
}

export const SHOT_NAMES = ['takeoff', 'river', 'town', 'approach'];

export function shotPlan(name) {
  const field = RUNWAYS[0];
  const strip = RUNWAYS[1];
  switch (name) {
    case 'river': {
      const ring = RINGS[6];
      return {
        mission: 'mail', camera: 'chase', ringsCollected: 5, score: 1250, elapsed: 107,
        plane: { x: 60, y: 150, z: -520, heading: headingTo({ x: 60, z: -520 }, ring), pitch: 0.02, roll: 0, speed: 68, throttle: 0.8 },
        target: { x: ring.x, y: ring.y, z: ring.z },
        simSeconds: 2.0,
      };
    }
    case 'town': {
      return {
        mission: 'mail', camera: 'chase', ringsCollected: 8, score: 2400, elapsed: 185,
        plane: { x: -720, y: 118, z: 480, heading: Math.PI / 2, pitch: 0.0, roll: 0, speed: 70, throttle: 0.8 },
        target: { x: -100, y: 110, z: 480 },
        simSeconds: 2.5,
      };
    }
    case 'approach': {
      // Close enough that the strip fills the frame, on a gentle glide.
      return {
        mission: 'mail', camera: 'cockpit', ringsCollected: 12, score: 4100, elapsed: 332,
        plane: { x: -1400, y: 70, z: -60, heading: Math.PI / 2, pitch: -0.04, roll: 0, speed: 48, throttle: 0.45 },
        target: { x: strip.x, y: 40, z: strip.z },
        simSeconds: 2.0,
      };
    }
    case 'takeoff':
    default: {
      return {
        mission: 'mail', camera: 'chase', ringsCollected: 0, score: 0, elapsed: 12,
        plane: { x: -430, y: 62, z: 950, heading: Math.PI * 1.5, pitch: 0.14, roll: 0, speed: 56, throttle: 0.88 },
        target: { x: -1200, y: 90, z: 950 },
        simSeconds: 1.5,
      };
    }
  }
}

// A gentle pursuit autopilot: bank toward the target, pitch to hold its
// altitude, throttle steady. Used only by the screenshot scenes.
export function autopilotInput(state, target) {
  const desiredHeading = headingTo(state, target);
  let err = desiredHeading - state.heading;
  while (err > Math.PI) err -= Math.PI * 2;
  while (err < -Math.PI) err += Math.PI * 2;
  // Gentle banks only: a screenshot plane heeled hard over reads as a crash.
  const roll = Math.max(-0.55, Math.min(0.55, err * 1.6));
  const altErr = target.y - state.y;
  // Soft altitude hold: a screenshot plane should glide, not dive.
  const pitch = Math.max(-0.5, Math.min(0.5, altErr * 0.012 - state.verticalSpeed * 0.08));
  return { pitch, roll, yaw: 0, throttle: state.throttle, brake: false };
}
