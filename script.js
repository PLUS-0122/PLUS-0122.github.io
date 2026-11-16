/* Lanyard: the card is a pendulum hanging from a point above the viewport.
   The two cords are drawn every frame and go slack on the side it swings away
   from, which is what makes it read as a real lanyard rather than a rotating
   picture. */

(function () {
  const badge = document.getElementById('badge');
  const card = document.getElementById('cardImg');
  const cordA = document.getElementById('cordA');
  const cordB = document.getElementById('cordB');
  const sheenA = document.getElementById('sheenA');
  const sheenB = document.getElementById('sheenB');
  if (!badge || !card) return;

  const G = 1500;       // "gravity" in px/s^2
  const DAMP = 0.95;    // angular damping per second
  const PULL = 14.0;    // how hard the pointer pulls the card
  const MAX_TILT = 0.60; // rad, pointer's maximum influence
  const CORD_W = 13;

  let W = 1, H = 1;
  let pivot = { x: 0, y: 0 };
  let rest = { x: 0, y: 0 };
  let L = 1;
  let neckL = { x: 0, y: 0 };
  let neckR = { x: 0, y: 0 };
  let cordLen = 1;

  let phi = 0;          // angle of the hanging line, radians
  let omega = 0;        // angular velocity
  let targetPhi = 0;
  let dragging = false;
  let dragStartX = 0;
  let dragStartPhi = 0;
  let lastPhi = 0;
  let lastT = 0;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function measure() {
    const r = badge.getBoundingClientRect();
    W = r.width || window.innerWidth;
    H = r.height || window.innerHeight;

    pivot = { x: W / 2, y: -0.32 * H };
    rest = { x: W / 2, y: 0.19 * H };
    L = rest.y - pivot.y;

    const spread = 0.075 * W;
    neckL = { x: W / 2 - spread, y: -0.32 * H };
    neckR = { x: W / 2 + spread, y: -0.32 * H };
    cordLen = Math.hypot(rest.x - neckL.x, rest.y - neckL.y) * 1.015;
  }

  // A lanyard strap is a flat ribbon: wide where it leaves the neck, narrow
  // where it meets the clip, and it bends instead of stretching. Sampled as a
  // polygon so the taper and the bend can both be animated.
  const SAMPLES = 22;

  function ribbon(p, c) {
    const dx = c.x - p.x;
    const dy = c.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    const slack = Math.max(0, cordLen - d);
    const bow = slack * 0.45;
    const nx0 = -dy / d;
    const ny0 = dx / d;
    const ctrl = { x: (p.x + c.x) / 2 + nx0 * bow, y: (p.y + c.y) / 2 + ny0 * bow };

    const wTop = Math.min(15, Math.max(10, W * 0.0088));
    const wBot = wTop * 0.55;

    const left = [];
    const right = [];
    const spine = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const it = 1 - t;
      const x = it * it * p.x + 2 * it * t * ctrl.x + t * t * c.x;
      const y = it * it * p.y + 2 * it * t * ctrl.y + t * t * c.y;
      // tangent of the quadratic
      const tx = 2 * it * (ctrl.x - p.x) + 2 * t * (c.x - ctrl.x);
      const ty = 2 * it * (ctrl.y - p.y) + 2 * t * (c.y - ctrl.y);
      const len = Math.hypot(tx, ty) || 1;
      const nx = -ty / len;
      const ny = tx / len;
      const w = (wTop * (1 - t) + wBot * t) / 2;
      left.push([x + nx * w, y + ny * w]);
      right.push([x - nx * w, y - ny * w]);
      spine.push([x + nx * w * 0.35, y + ny * w * 0.35]);
    }

    const poly = left.concat(right.reverse())
      .map((pt, i) => (i ? 'L' : 'M') + pt[0].toFixed(1) + ',' + pt[1].toFixed(1))
      .join(' ') + ' Z';
    const line = spine
      .map((pt, i) => (i ? 'L' : 'M') + pt[0].toFixed(1) + ',' + pt[1].toFixed(1))
      .join(' ');
    return { poly: poly, line: line };
  }

  function render() {
    const cx = pivot.x + Math.sin(phi) * L;
    const cy = pivot.y + Math.cos(phi) * L;

    // the card lags the cord slightly, so it whips on release
    const cardPhi = phi + clamp(omega * 0.06, -0.22, 0.22);
    card.style.transform =
      'translate(' + cx.toFixed(2) + 'px,' + cy.toFixed(2) + 'px) translate(-50%,0) rotate(' +
      (cardPhi * 180 / Math.PI).toFixed(3) + 'deg)';

    const a = ribbon(neckL, { x: cx - 5, y: cy - 1 });
    const b = ribbon(neckR, { x: cx + 5, y: cy - 1 });
    cordA.setAttribute('d', a.poly);
    cordB.setAttribute('d', b.poly);
    if (sheenA) sheenA.setAttribute('d', a.line);
    if (sheenB) sheenB.setAttribute('d', b.line);
  }

  function frame(t) {
    const dt = Math.min(0.033, (t - (lastT || t)) / 1000);
    lastT = t;

    if (!dragging) {
      const accel = (targetPhi - phi) * PULL - (G / L) * Math.sin(phi);
      omega += (accel - DAMP * omega) * dt;
      phi += omega * dt;
    } else {
      phi = clamp(phi, -1.2, 1.2);
      omega = (phi - lastPhi) / (dt || 0.016);
      lastPhi = phi;
    }

    render();
    requestAnimationFrame(frame);
  }

  window.addEventListener('pointermove', (e) => {
    if (dragging) return;
    const norm = clamp((e.clientX - W / 2) / (W / 2), -1, 1);
    targetPhi = norm * MAX_TILT;
  }, { passive: true });

  window.addEventListener('pointerleave', () => {
    if (!dragging) targetPhi = 0;
  });

  card.addEventListener('pointerdown', (e) => {
    dragging = true;
    card.classList.add('dragging');
    card.setPointerCapture(e.pointerId);
    dragStartX = e.clientX;
    dragStartPhi = phi;
    lastPhi = phi;
    omega = 0;
    e.preventDefault();
  });

  card.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    phi = dragStartPhi + (e.clientX - dragStartX) / (0.85 * L);
  });

  function release() {
    if (!dragging) return;
    dragging = false;
    card.classList.remove('dragging');
  }
  card.addEventListener('pointerup', release);
  card.addEventListener('pointercancel', release);

  measure();
  window.addEventListener('resize', measure);
  render();
  omega = 0.35; // a nudge on load
  requestAnimationFrame(frame);
})();
