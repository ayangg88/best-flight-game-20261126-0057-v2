// Kestrel Bay Mail Run — tuning, missions and ring layouts.
// One place for every number a designer would want to change. The world is
// 4200 x 4200 metres, y up, sea level at y = 0, Mount Kestrel 447 m high.

export const WORLD = {
  size: 4200,
  seaLevel: 0,
  waterLevel: 0.4,
  seed: 20261127,
  // Mount Kestrel, the big peak in the north-east of the map.
  mountain: { x: 950, z: -1150, height: 447, radius: 900 },
  // The bay opens to the west and south-west; the coast runs roughly x < -500.
  coastX: -520,
  town: { x: -380, z: 480, radius: 260 },
  lighthouse: { x: -1180, z: -260 },
};

export const RUNWAYS = [
  {
    id: 'kestrel-field',
    name: 'Kestrel Field',
    // East-west strip; take off westbound, straight into the sunset.
    x: -150, z: 950, heading: Math.PI * 1.5, length: 620, width: 34,
  },
  {
    id: 'lighthouse-strip',
    name: 'Lighthouse Strip',
    // Short coastal strip beside the lighthouse headland.
    x: -1050, z: -60, heading: Math.PI * 0.5, length: 460, width: 26,
  },
];

// The 12 mail rings, in flying order, across three zones: the bay, the
// river valley, and the ridge around Mount Kestrel.
export const RINGS = [
  // Bay zone — low over the water, out past the lighthouse.
  { x: -700, y: 55, z: 700, zone: 'bay' },
  { x: -1150, y: 70, z: 250, zone: 'bay' },
  { x: -1250, y: 90, z: -450, zone: 'bay' },
  { x: -800, y: 110, z: -750, zone: 'bay' },
  // Valley zone — following the river inland, under the ridge line.
  { x: -250, y: 95, z: -450, zone: 'valley' },
  { x: 150, y: 120, z: -650, zone: 'valley' },
  { x: 480, y: 150, z: -750, zone: 'valley' },
  { x: 700, y: 185, z: -950, zone: 'valley' },
  // Ridge zone — high, tight turns around Mount Kestrel.
  { x: 950, y: 320, z: -1350, zone: 'ridge' },
  { x: 1250, y: 380, z: -950, zone: 'ridge' },
  { x: 1050, y: 430, z: -600, zone: 'ridge' },
  { x: 620, y: 330, z: -500, zone: 'ridge' },
];

export const MISSIONS = {
  mail: {
    id: 'mail',
    name: 'Mail Run',
    blurb: 'Fly all 12 gold rings, bay to ridge, then land on Lighthouse Strip.',
    rings: RINGS.map((r, i) => ({ ...r, index: i })),
    targetRunway: 'lighthouse-strip',
    parSeconds: 420,
  },
  rescue: {
    id: 'rescue',
    name: 'Mountain Rescue',
    blurb: 'Drop supplies to 3 stranded hiker camps, then land at Kestrel Field.',
    beacons: [
      { x: 700, y: 210, z: -1150, name: 'Camp Kestrel' },
      { x: 1250, y: 300, z: -700, name: 'Camp Ridge' },
      { x: 300, y: 150, z: -1250, name: 'Camp Tarn' },
    ],
    targetRunway: 'kestrel-field',
    parSeconds: 360,
  },
  trial: {
    id: 'trial',
    name: 'Sunset Time Trial',
    blurb: '8 rings against the clock. Beat the par time before the sun goes down.',
    rings: [RINGS[4], RINGS[5], RINGS[6], RINGS[7], RINGS[8], RINGS[9], RINGS[10], RINGS[11]]
      .map((r, i) => ({ ...r, index: i })),
    targetRunway: 'kestrel-field',
    parSeconds: 240,
  },
};

export const PHYSICS = {
  maxThrustAccel: 15,     // m/s^2 at full throttle
  dragK: 0.0016,          // drag = dragK * speed^2
  stallSpeed: 26,         // m/s; below this the wing stops flying
  maxSpeed: 98,
  rotateSpeed: 30,        // m/s; fast enough to lift off
  cruiseSpeed: 62,
  rollRate: 1.9,          // rad/s of bank change
  maxBank: 1.1,           // rad
  pitchRate: 1.1,
  maxPitchUp: 0.55,
  maxPitchDown: -0.45,
  yawRate: 0.25,
  fuelDrain: 0.32,        // %/s at full throttle
  ringRadius: 15,         // m; pass within this of a ring centre to collect it
  comboWindow: 12,        // s between rings to keep the combo alive
};

export const BEST_KEY = 'kestrel-bay-mail-run.best';
export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
