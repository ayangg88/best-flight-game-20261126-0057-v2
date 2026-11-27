// Kestrel Bay Mail Run — procedural sound, no audio files.
// Engine drone, wind rush, ring chimes, touchdown thud and crash noise are
// all synthesised with WebAudio the first time the player touches a control.
export function createAudio() {
  let ctx = null, master = null;
  let engineOsc1 = null, engineOsc2 = null, engineGain = null, engineFilter = null;
  let windGain = null, windFilter = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return false; }
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    // Engine: two detuned saws through a lowpass, pitch follows throttle.
    engineOsc1 = ctx.createOscillator();
    engineOsc1.type = 'sawtooth';
    engineOsc1.frequency.value = 62;
    engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'square';
    engineOsc2.frequency.value = 31;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc1.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc1.start();
    engineOsc2.start();

    // Wind: looped noise through a bandpass, gain follows airspeed.
    const len = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    windFilter.Q.value = 0.6;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    noise.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    noise.start();
    started = true;
    return true;
  }

  function chimeNote(freq, when, dur) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.5, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }

  return {
    get muted() { return muted; },
    unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    update(throttle, speed, airborne) {
      if (!started || !ctx) return;
      const now = ctx.currentTime;
      const rpm = 55 + throttle * 95;
      engineOsc1.frequency.setTargetAtTime(rpm, now, 0.08);
      engineOsc2.frequency.setTargetAtTime(rpm * 0.5 + 3, now, 0.08);
      engineFilter.frequency.setTargetAtTime(320 + throttle * 900, now, 0.1);
      engineGain.gain.setTargetAtTime(airborne || throttle > 0.05 ? 0.05 + throttle * 0.11 : 0.02, now, 0.1);
      windFilter.frequency.setTargetAtTime(500 + speed * 9, now, 0.1);
      windGain.gain.setTargetAtTime(Math.min(0.22, Math.max(0, speed - 18) * 0.0035), now, 0.12);
    },
    ring(combo) {
      if (!ensure()) return;
      const base = 660 * Math.pow(1.059463, Math.min(combo, 8));
      const now = ctx.currentTime;
      chimeNote(base, now, 0.5);
      chimeNote(base * 1.25, now + 0.07, 0.5);
      chimeNote(base * 1.5, now + 0.14, 0.7);
    },
    thud() {
      if (!ensure()) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(90, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.22);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(g); g.connect(master);
      osc.start(now); osc.stop(now + 0.32);
    },
    crash() {
      if (!ensure()) return;
      const now = ctx.currentTime;
      const len = ctx.sampleRate * 0.7;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.7, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
      src.connect(filter); filter.connect(g); g.connect(master);
      src.start(now);
    },
    fanfare() {
      if (!ensure()) return;
      const now = ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => chimeNote(f, now + i * 0.11, 0.8));
    },
  };
}
