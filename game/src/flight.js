// Kestrel Bay Mail Run — the flight model, pure maths, no rendering.
// It runs identically in the browser and in Node, so the same code that
// flies the game can be simulated headlessly for tests. Units: metres,
// seconds, radians. y is up; heading 0 is north (-z), PI/2 is east (+x).

export const STALL_SPEED = 26;
export const ROTATE_SPEED = 30;
export const MAX_THRUST = 15;
export const DRAG_K = 0.0016;
export const GEAR_HEIGHT = 1.6; // plane's centre of mass above the ground

export function createFlight(env) {
  return {
    x: env.startX, y: env.startY, z: env.startZ,
    heading: env.startHeading, pitch: 0, roll: 0,
    speed: 0, throttle: 0, fuel: 100,
    onGround: true, crashed: false, landed: false, crashReason: '',
    verticalSpeed: 0, airTime: 0, distanceFlown: 0,
    // Last touchdown quality, for the landing report.
    lastTouchdownVs: 0,
  };
}

// Wind gusts: a slow, smooth, deterministic function of position and time,
// so the same flight always meets the same air. Returns {x, z} in m/s.
export function windAt(x, z, t) {
  const a = Math.sin(t * 0.11 + x * 0.0011 + z * 0.0007) * 2.2;
  const b = Math.cos(t * 0.073 + x * 0.0006 - z * 0.0013) * 1.8;
  return { x: a + 1.5, z: b - 0.8 };
}

// input: { pitch: -1..1 (stick back = climb), roll: -1..1, yaw: -1..1,
//          throttle: 0..1 (absolute), brake: bool }
// env: { heightAt(x,z), waterLevel, time, onRunway(x,z) -> runway id or null }
export function stepFlight(s, input, env, dt) {
  if (s.crashed) return s;
  const t = env.time;

  // --- Throttle and fuel -------------------------------------------------
  s.throttle = Math.max(0, Math.min(1, input.throttle));
  if (!s.onGround || s.speed > 2) {
    s.fuel = Math.max(0, s.fuel - s.throttle * 0.32 * dt);
  }
  if (s.onGround && s.speed < 5 && s.throttle < 0.05) s.fuel = Math.min(100, s.fuel + 22 * dt);

  // --- Attitude ----------------------------------------------------------
  const rollTarget = Math.max(-1.1, Math.min(1.1, input.roll * 1.1));
  s.roll += (rollTarget - s.roll) * Math.min(1, 3.2 * dt);
  const pitchTarget = Math.max(-0.45, Math.min(0.55, input.pitch * 0.55));
  s.pitch += (pitchTarget - s.pitch) * Math.min(1, 2.4 * dt);

  // Coordinated turn: banking turns the nose. Yaw (rudder) adds a little.
  const turnRate = -9.81 * Math.tan(s.roll) / Math.max(18, s.speed) + input.yaw * 0.22;
  s.heading += turnRate * dt;

  // --- Speed -------------------------------------------------------------
  const thrust = s.fuel > 0 ? s.throttle * MAX_THRUST : 0;
  const drag = DRAG_K * s.speed * s.speed;
  const gravityAlong = -9.81 * Math.sin(s.pitch);
  let accel = thrust - drag + gravityAlong;
  if (s.onGround) {
    // Rolling resistance, plus brakes.
    accel -= 0.6 + (input.brake ? 7 : 0);
    if (s.speed < 0.5 && accel < 0) accel = 0;
  }
  s.speed = Math.max(0, Math.min(98, s.speed + accel * dt));

  // --- Lift, stall and sink ----------------------------------------------
  const stalled = s.speed < STALL_SPEED;
  let sink = 0;
  if (stalled && !s.onGround) {
    sink = (STALL_SPEED - s.speed) * 0.55; // m/s of extra sink
    // A stalled wing drops its nose.
    s.pitch += (-0.18 - s.pitch) * Math.min(1, 1.5 * dt);
  }

  // --- Motion ------------------------------------------------------------
  const fx = Math.sin(s.heading) * Math.cos(s.pitch);
  const fy = Math.sin(s.pitch);
  const fz = -Math.cos(s.heading) * Math.cos(s.pitch);
  const wind = windAt(s.x, s.z, t);
  const vx = fx * s.speed + wind.x * 0.25;
  const vy = fy * s.speed - sink;
  const vz = fz * s.speed + wind.z * 0.25;
  s.verticalSpeed = vy;
  s.x += vx * dt;
  s.y += vy * dt;
  s.z += vz * dt;
  if (!s.onGround) {
    s.airTime += dt;
    s.distanceFlown += s.speed * dt;
  }

  // --- Ground and water --------------------------------------------------
  const ground = env.heightAt(s.x, s.z);
  const gearY = ground + GEAR_HEIGHT;
  const overWater = ground < env.waterLevel;
  if (s.y <= gearY) {
    if (overWater) {
      if (s.speed > 12 || vy < -4) {
        s.crashed = true;
        s.crashReason = 'Ditched in the bay';
      } else {
        s.y = env.waterLevel + GEAR_HEIGHT;
        s.onGround = true;
        s.speed = Math.max(0, s.speed - 30 * dt);
      }
    } else if (s.onGround) {
      s.y = gearY;
      if (s.speed < 6 && env.onRunway && env.onRunway(s.x, s.z)) {
        s.landed = true;
      }
    } else if (vy < -7 || Math.abs(s.roll) > 0.7 || s.speed > 58) {
      s.crashed = true;
      s.crashReason = vy < -7
        ? 'Hit the ground too hard'
        : Math.abs(s.roll) > 0.7 ? 'Cartwheeled on touchdown' : 'Overspeed touchdown';
    } else {
      // Touchdown: gentle enough to roll out.
      s.lastTouchdownVs = vy;
      s.onGround = true;
      s.y = gearY;
      s.pitch = 0;
      s.roll *= 0.4;
      if (s.speed < 6 && env.onRunway && env.onRunway(s.x, s.z)) s.landed = true;
    }
  } else if (s.onGround && s.y > gearY + 0.4) {
    // Lifted off (or drove off a cliff edge).
    if (s.speed >= ROTATE_SPEED || s.y > gearY + 2) {
      s.onGround = false;
      s.landed = false; // a fresh flight needs a fresh landing
    } else s.y = gearY; // still rolling, keep wheels on the ground
  }

  // Out of fuel in the air: glide down, the engine is dead.
  if (s.fuel <= 0 && !s.onGround) s.throttle = 0;
  return s;
}

// Distance from the plane to a point, for ring / beacon checks.
export function distanceTo(s, p) {
  const dx = s.x - p.x, dy = s.y - p.y, dz = s.z - p.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Is the plane inside a runway rectangle? Runways are axis-aligned in the
// local frame: heading PI/2 or 3PI/2 means the strip runs east-west.
export function runwayAt(x, z, runways) {
  for (const r of runways) {
    const eastWest = Math.abs(Math.sin(r.heading)) > 0.5;
    const along = eastWest ? x - r.x : z - r.z;
    const across = eastWest ? z - r.z : x - r.x;
    if (Math.abs(along) <= r.length / 2 && Math.abs(across) <= r.width / 2 + 6) return r.id;
  }
  return null;
}
