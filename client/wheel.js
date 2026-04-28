import { state, TYPE_COLORS, REDUCED_MOTION } from './state.js';
import { getValidPool } from './pokemon.js';
// showSilhouette imported lazily (circular dep with screens.js is safe in ESM)
import { showSilhouette } from './screens.js';

let wheelAngle = 0;
let animFrame = null;
let lastTimestamp = null;
let settleTimeout = null;
let cpmTimestamps = [];
let cpmTimeout = null;

export function buildWheel() {
  const valid = getValidPool();
  const group = document.getElementById('wheel-group');
  const defs = document.getElementById('wheel-defs');
  const container = document.getElementById('wheel-container');
  const emptyMsg = document.getElementById('empty-wheel-msg');

  group.innerHTML = '';
  defs.innerHTML = '';

  if (valid.length === 0) {
    container.style.display = 'none';
    emptyMsg.style.display = 'block';
    return;
  }
  container.style.display = 'block';
  emptyMsg.style.display = 'none';

  const R = 250;
  const anglePerSlice = (2 * Math.PI) / valid.length;

  for (let i = 0; i < valid.length; i++) {
    const p = valid[i];
    const startAngle = i * anglePerSlice - Math.PI / 2;
    const endAngle = startAngle + anglePerSlice;

    const c1 = TYPE_COLORS[p.type1] || '#888';
    const c2 = p.type2 ? (TYPE_COLORS[p.type2] || '#888') : null;

    let fill;
    if (!c2) {
      fill = c1;
    } else {
      const midAngleDeg = ((startAngle + endAngle) / 2) * 180 / Math.PI;
      const pid = `pat_${i}`;
      const pat = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
      pat.setAttribute('id', pid);
      pat.setAttribute('patternUnits', 'userSpaceOnUse');
      pat.setAttribute('width', '50');
      pat.setAttribute('height', '50');
      pat.setAttribute('patternTransform', `rotate(${midAngleDeg + 45})`);
      pat.innerHTML = `<rect width="50" height="50" fill="${c1}"/><rect width="25" height="50" fill="${c2}"/>`;
      defs.appendChild(pat);
      fill = `url(#${pid})`;
    }

    let el;
    if (valid.length === 1) {
      el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      el.setAttribute('cx', 0);
      el.setAttribute('cy', 0);
      el.setAttribute('r', R);
    } else {
      const x1 = Math.cos(startAngle) * R;
      const y1 = Math.sin(startAngle) * R;
      const x2 = Math.cos(endAngle) * R;
      const y2 = Math.sin(endAngle) * R;
      const largeArc = anglePerSlice > Math.PI ? 1 : 0;
      el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      el.setAttribute('d', `M 0 0 L ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} Z`);
    }
    el.setAttribute('fill', fill);
    el.setAttribute('data-index', i);
    group.appendChild(el);
  }

  if (valid.length > 1) {
    for (let i = 0; i < valid.length; i++) {
      const startAngle = i * anglePerSlice - Math.PI / 2;
      const endAngle   = startAngle + anglePerSlice;
      const x1 = Math.cos(startAngle) * R, y1 = Math.sin(startAngle) * R;
      const x2 = Math.cos(endAngle)   * R, y2 = Math.sin(endAngle)   * R;
      const largeArc = anglePerSlice > Math.PI ? 1 : 0;

      const gradId = `sg_${i}`;
      const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
      grad.setAttribute('id', gradId);
      grad.setAttribute('gradientUnits', 'userSpaceOnUse');
      grad.setAttribute('x1', Math.cos(startAngle) * R * 0.5);
      grad.setAttribute('y1', Math.sin(startAngle) * R * 0.5);
      grad.setAttribute('x2', Math.cos(endAngle)   * R * 0.5);
      grad.setAttribute('y2', Math.sin(endAngle)   * R * 0.5);
      const s0 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      s0.setAttribute('offset', '0%');   s0.setAttribute('stop-color', 'rgba(0,0,0,0)');
      const s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      s1.setAttribute('offset', '100%'); s1.setAttribute('stop-color', 'rgba(0,0,0,0.2)');
      grad.append(s0, s1);
      defs.appendChild(grad);

      const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      overlay.setAttribute('d', `M 0 0 L ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} Z`);
      overlay.setAttribute('fill', `url(#${gradId})`);
      group.appendChild(overlay);
    }
  }

  updateCenterText();
}

export function updateCenterText() {
  const centerText = document.getElementById('wheel-center-text');
  centerText.innerHTML = state.spinState === 'idle'
    ? '<div class="spin-prompt">Click to spin</div>'
    : '';
}

export function applyWheelRotation() {
  const deg = wheelAngle * 180 / Math.PI;
  document.getElementById('wheel-group').style.transform = `rotate(${deg}deg)`;
}

export function startIdleSpin() {
  if (REDUCED_MOTION) return;
  if (state.spinState !== 'idle') return;
  stopAnimation();
  document.getElementById('wheel-group').classList.add('idle-spinning');
}

export function stopAnimation() {
  if (animFrame) {
    cancelAnimationFrame(animFrame);
    animFrame = null;
  }
  document.getElementById('wheel-group').classList.remove('idle-spinning');
}

function animLoop(ts) {
  if (!lastTimestamp) lastTimestamp = ts;
  const dt = Math.min((ts - lastTimestamp) / 1000, 0.1);
  lastTimestamp = ts;

  if (state.spinState === 'spinning') {
    const friction = 0.98;
    state.wheelVelocity *= Math.pow(friction, dt * 60);
    wheelAngle += state.wheelVelocity * dt;
    applyWheelRotation();

    if (state.wheelVelocity < 0.05) {
      settleWheel();
    } else {
      animFrame = requestAnimationFrame(animLoop);
    }
  }
}

function readPointerWinner() {
  const valid = getValidPool();
  if (valid.length === 0) return null;
  const anglePerSlice = (2 * Math.PI) / valid.length;
  const relAngle = ((-wheelAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const idx = Math.floor(relAngle / anglePerSlice) % valid.length;
  return valid[idx];
}

function settleWheel() {
  stopAnimation();
  state.winner = readPointerWinner();
  if (!state.winner) return;
  state.spinState = 'settled';
  updateCenterText();
  settleTimeout = setTimeout(() => showSilhouette(state.winner), 600);
}

export function activateSpin() {
  const valid = getValidPool();
  if (valid.length === 0) return;

  if (state.spinState === 'idle') {
    state.winner = null;
    state.spinState = 'spinning';
    state.wheelVelocity = 15 + Math.random() * 5;
    updateCenterText();
    const group = document.getElementById('wheel-group');
    if (group.classList.contains('idle-spinning')) {
      const m = new DOMMatrix(getComputedStyle(group).transform);
      wheelAngle = Math.atan2(m.b, m.a);
      group.classList.remove('idle-spinning');
      group.style.transform = `rotate(${wheelAngle * 180 / Math.PI}deg)`;
    }
    if (!animFrame) {
      lastTimestamp = null;
      animFrame = requestAnimationFrame(animLoop);
    }
  } else if (state.spinState === 'spinning') {
    const boost = 2 + state.wheelVelocity * 0.3;
    state.wheelVelocity += boost;
    const now = Date.now();
    cpmTimestamps = cpmTimestamps.filter(t => now - t < 3000);
    cpmTimestamps.push(now);
    if (cpmTimestamps.length >= 2) {
      const windowMs = now - cpmTimestamps[0];
      const cps = cpmTimestamps.length / windowMs * 1000;
      if (cps >= 5) {
        document.getElementById('wheel-center-text').innerHTML =
          `<div class="cpm-display"><span class="cpm-value">${cps.toFixed(1)}</span><span class="cpm-label">CPS</span></div>`;
      }
      clearTimeout(cpmTimeout);
      cpmTimeout = setTimeout(() => updateCenterText(), 1500);
    }
  }
}
