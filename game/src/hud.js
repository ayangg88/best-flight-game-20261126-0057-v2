// Kestrel Bay Mail Run — the HUD: glass-style panels, a compass strip, and
// a six-dial cockpit dashboard drawn on canvas. Everything is DOM/canvas so
// it stays crisp in screenshots at any resolution.
import { FONT } from './config.js';

const GLASS = 'background:rgba(20,16,28,0.55);backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,0.22);border-radius:12px;box-shadow:0 4px 18px rgba(0,0,0,0.35);color:#fff;';

export function createHud() {
  const root = document.createElement('div');
  root.id = 'hud';
  root.style.cssText = `position:fixed;inset:0;pointer-events:none;font-family:${FONT};z-index:5;`;

  root.innerHTML = `
    <div id="hud-mission" style="position:absolute;top:14px;left:14px;padding:10px 14px;${GLASS}">
      <div id="hud-mission-name" style="font-size:17px;font-weight:700;letter-spacing:0.4px;">Mail Run</div>
      <div id="hud-mission-goal" style="font-size:12px;opacity:0.85;margin-top:2px;">Fly the rings, then land.</div>
      <div id="hud-rings" style="font-size:15px;font-weight:700;margin-top:6px;color:#ffd27a;">◉ Rings 0 / 12</div>
      <div id="hud-combo" style="font-size:12px;color:#ff9a5c;font-weight:700;height:16px;"></div>
    </div>
    <div id="hud-score" style="position:absolute;top:14px;right:14px;padding:10px 14px;text-align:right;${GLASS}">
      <div style="font-size:12px;opacity:0.8;">SCORE</div>
      <div id="hud-score-val" style="font-size:24px;font-weight:800;line-height:1;">0</div>
      <div id="hud-timer" style="font-size:15px;font-weight:700;margin-top:4px;">00:00</div>
      <div id="hud-best" style="font-size:11px;opacity:0.8;">Best time —</div>
    </div>
    <div id="hud-compass" style="position:absolute;top:14px;left:50%;transform:translateX(-50%);padding:6px 10px;${GLASS}">
      <canvas id="hud-compass-canvas" width="360" height="46"></canvas>
    </div>
    <div id="hud-flight" style="position:absolute;left:14px;bottom:14px;padding:10px 14px;${GLASS}">
      <div style="display:flex;gap:18px;">
        <div><div style="font-size:11px;opacity:0.8;">ALTITUDE</div><div id="hud-alt" style="font-size:26px;font-weight:800;">0 m</div></div>
        <div><div style="font-size:11px;opacity:0.8;">AIRSPEED</div><div id="hud-spd" style="font-size:26px;font-weight:800;">0 kt</div></div>
        <div><div style="font-size:11px;opacity:0.8;">VERTICAL</div><div id="hud-vs" style="font-size:26px;font-weight:800;">0 m/s</div></div>
      </div>
      <div id="hud-warn" style="font-size:13px;font-weight:700;color:#ff5a4a;height:18px;margin-top:4px;"></div>
    </div>
    <div id="hud-power" style="position:absolute;right:14px;bottom:14px;padding:10px 14px;width:210px;${GLASS}">
      <div style="display:flex;justify-content:space-between;font-size:11px;opacity:0.85;"><span>THROTTLE</span><span id="hud-thr-val">0%</span></div>
      <div style="height:10px;background:rgba(255,255,255,0.18);border-radius:5px;margin:3px 0 8px;overflow:hidden;"><div id="hud-thr-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#ff7a2a,#ffb52e);"></div></div>
      <div style="display:flex;justify-content:space-between;font-size:11px;opacity:0.85;"><span>FUEL</span><span id="hud-fuel-val">100%</span></div>
      <div style="height:10px;background:rgba(255,255,255,0.18);border-radius:5px;margin:3px 0 0;overflow:hidden;"><div id="hud-fuel-bar" style="height:100%;width:100%;background:linear-gradient(90deg,#2ec4b6,#7be3c3);"></div></div>
    </div>
    <div id="hud-next" style="position:absolute;bottom:14px;left:50%;transform:translateX(-50%);padding:8px 16px;font-size:14px;font-weight:700;${GLASS}">Next ring: 420 m</div>
    <div id="hud-toast" style="position:absolute;top:96px;left:50%;transform:translateX(-50%);padding:10px 20px;font-size:19px;font-weight:800;text-align:center;${GLASS}opacity:0;transition:opacity 0.25s;"></div>
    <canvas id="hud-dash" width="620" height="118" style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);display:none;"></canvas>
  `;
  document.body.appendChild(root);

  const $ = (id) => root.querySelector('#' + id);
  const compassCanvas = $('hud-compass-canvas');
  const compassCtx = compassCanvas.getContext('2d');
  const dashCanvas = $('hud-dash');
  const dashCtx = dashCanvas.getContext('2d');

  function fmtTime(s) {
    const m = Math.floor(s / 60), ss = Math.floor(s % 60);
    return String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
  }

  function drawCompass(headingDeg) {
    const ctx = compassCtx, W = 360, H = 46;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '700 13px ' + FONT;
    ctx.textAlign = 'center';
    const labels = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let d = -180; d <= 180; d += 5) {
      let deg = (headingDeg + d + 360) % 360;
      const x = W / 2 + (d / 180) * 170;
      const major = deg % 45 === 0;
      const mid = deg % 15 === 0;
      ctx.fillRect(x, major ? 22 : 28, 1.5, major ? 14 : 8);
      if (major) ctx.fillText(labels[deg] || String(deg), x, 16);
      else if (mid) { ctx.font = '11px ' + FONT; ctx.fillText(String(deg), x, 16); ctx.font = '700 13px ' + FONT; }
    }
    ctx.fillStyle = '#ffb52e';
    ctx.beginPath();
    ctx.moveTo(W / 2 - 7, 2); ctx.lineTo(W / 2 + 7, 2); ctx.lineTo(W / 2, 10); ctx.closePath();
    ctx.fill();
    ctx.font = '700 13px ' + FONT;
    ctx.fillStyle = '#ffd27a';
    ctx.fillText(Math.round(headingDeg) + '°', W / 2, 44);
  }

  function drawDial(ctx, cx, cy, r, label, valueText, frac, color) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(12,10,20,0.72)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.stroke();
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 7, a0, a0 + (a1 - a0) * Math.max(0, Math.min(1, frac)));
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.stroke();
    // Needle.
    const na = a0 + (a1 - a0) * Math.max(0, Math.min(1, frac));
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(na) * (r - 12), cy + Math.sin(na) * (r - 12));
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd27a';
    ctx.font = '700 11px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, cy + r * 0.42);
    ctx.fillStyle = '#fff';
    ctx.font = '700 13px ' + FONT;
    ctx.fillText(valueText, cx, cy + r * 0.62);
    ctx.restore();
  }

  function drawDash(state, mission, elapsed) {
    const ctx = dashCtx, W = 620, H = 118;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(14,12,22,0.78)';
    ctx.beginPath();
    ctx.roundRect(6, 6, W - 12, H - 12, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const altM = Math.max(0, state.y);
    const kt = state.speed * 1.944;
    const hdg = ((state.heading * 180 / Math.PI) % 360 + 360) % 360;
    drawDial(ctx, 62, 59, 40, 'AIRSPEED', Math.round(kt) + ' kt', Math.min(1, kt / 180), '#2ec4b6');
    drawDial(ctx, 162, 59, 40, 'ALTITUDE', Math.round(altM) + ' m', Math.min(1, altM / 500), '#ffb52e');
    drawDial(ctx, 262, 59, 40, 'HEADING', Math.round(hdg) + '°', hdg / 360, '#7be3c3');
    drawDial(ctx, 362, 59, 40, 'VERT SPD', (state.verticalSpeed >= 0 ? '+' : '') + state.verticalSpeed.toFixed(1), Math.min(1, Math.max(0, (state.verticalSpeed + 12) / 24)), '#ff9a5c');
    drawDial(ctx, 462, 59, 40, 'FUEL', Math.round(state.fuel) + '%', state.fuel / 100, '#e86a9a');
    drawDial(ctx, 556, 59, 40, 'RPM', Math.round(state.throttle * 2400), state.throttle, '#ff7a2a');
  }

  let toastTimer = 0;
  return {
    root,
    setMission(mission, totalRings, bestText) {
      $('hud-mission-name').textContent = mission.name;
      $('hud-mission-goal').textContent = mission.blurb;
      $('hud-best').textContent = bestText || 'Best time —';
      $('hud-rings').textContent = '◉ Rings 0 / ' + totalRings;
    },
    setDashVisible(on) {
      dashCanvas.style.display = on ? 'block' : 'none';
      // The dashboard strip sits at the bottom centre, where the
      // next-target label lives: lift the label above it in cockpit view.
      $('hud-next').style.bottom = on ? '132px' : '14px';
    },
    toast(text, ms = 2200) {
      const el = $('hud-toast');
      el.textContent = text;
      el.style.opacity = '1';
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { el.style.opacity = '0'; }, ms);
    },
    update(state, mission, info) {
      const altM = Math.max(0, state.y);
      $('hud-alt').textContent = Math.round(altM) + ' m';
      $('hud-spd').textContent = Math.round(state.speed * 1.944) + ' kt';
      $('hud-vs').textContent = (state.verticalSpeed >= 0 ? '+' : '') + state.verticalSpeed.toFixed(1) + ' m/s';
      $('hud-score-val').textContent = String(info.score);
      $('hud-timer').textContent = fmtTime(info.elapsed);
      $('hud-thr-val').textContent = Math.round(state.throttle * 100) + '%';
      $('hud-thr-bar').style.width = (state.throttle * 100).toFixed(0) + '%';
      $('hud-fuel-val').textContent = Math.round(state.fuel) + '%';
      const fuelBar = $('hud-fuel-bar');
      fuelBar.style.width = state.fuel.toFixed(0) + '%';
      fuelBar.style.background = state.fuel < 20
        ? 'linear-gradient(90deg,#e53b2e,#ff7a5c)'
        : 'linear-gradient(90deg,#2ec4b6,#7be3c3)';
      $('hud-rings').textContent = '◉ Rings ' + info.ringsCollected + ' / ' + info.totalRings;
      const comboEl = $('hud-combo');
      comboEl.textContent = info.combo > 1 ? 'COMBO ×' + info.combo + ' — keep the rings coming!' : '';
      const warn = $('hud-warn');
      if (state.crashed) warn.textContent = '';
      else if (state.fuel <= 0) warn.textContent = '⚠ OUT OF FUEL — glide to a runway!';
      else if (state.fuel < 20) warn.textContent = '⚠ LOW FUEL — land and refuel soon';
      else if (!state.onGround && state.speed < 26) warn.textContent = '⚠ STALL — nose down, full throttle!';
      else if (!state.onGround && state.speed < 34) warn.textContent = '⚠ Slow — near stall speed';
      else warn.textContent = '';
      const hdg = ((state.heading * 180 / Math.PI) % 360 + 360) % 360;
      drawCompass(hdg);
      const nextEl = $('hud-next');
      if (info.nextLabel) { nextEl.style.display = 'block'; nextEl.textContent = info.nextLabel; }
      else nextEl.style.display = 'none';
      if (dashCanvas.style.display === 'block') drawDash(state, mission, info.elapsed);
    },
  };
}
