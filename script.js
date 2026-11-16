/* Lanyard physics.
   The badge is a pendulum: gravity pulls it down, the two strap halves go slack
   on whichever side it swings away from. The pointer only nudges it when it is
   close to the badge (a mouse three metres away should not move it), and the
   pointer is sampled once per frame instead of once per event, which is what
   kills the jitter. */

(function () {
  const badge = document.getElementById('badge');
  const card = document.getElementById('cardImg');
  const cordA = document.getElementById('cordA');
  const cordB = document.getElementById('cordB');
  const sheenA = document.getElementById('sheenA');
  const sheenB = document.getElementById('sheenB');
  if (!badge || !card) return;

  const GRAV = 2600;      // px/s^2 — sets the swing period
  const DAMP = 1.55;      // angular damping, per second
  const NEAR = 220;       // px, full pointer influence inside this radius
  const FAR = 800;        // px, no influence beyond this
  const SAMPLES = 20;

  let W = 1, H = 1;
  let pivot = { x: 0, y: 0 };
  let rest = { x: 0, y: 0 };
  let L = 1;
  let neckL = { x: 0, y: 0 };
  let neckR = { x: 0, y: 0 };
  let cordLen = 1;

  let phi = 0;
  let omega = 0;
  let vel = 0;
  let pointerX = null;
  let lastPointerX = null;
  let lastSpeed = 0;
  let pointerY = null;
  let dragging = false;
  let dragStartX = 0;
  let dragStartPhi = 0;
  let dragPhi = 0;
  let lastT = 0;
  let running = false;

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

  /* flat ribbon: wide at the neck, narrow at the clip, and it bends */
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

    const cardPhi = phi + clamp(omega * 0.05, -0.10, 0.10);
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
    const dt = Math.min(0.05, Math.max(0.001, (t - (lastT || t)) / 1000));
    lastT = t;

    // The pointer pushes the badge like a hand sweeping past it: what counts
    // is how fast the mouse is moving, not where it is parked. A resting mouse
    // therefore exerts exactly nothing, which is what stopped the jitter.
    let speed = 0;
    if (pointerX !== null) {
      speed = (pointerX - lastPointerX) / dt;
      lastPointerX = pointerX;
    }
    speed = speed * 0.5 + lastSpeed * 0.5; // tame one-frame spikes
    lastSpeed = speed;

    const cx0 = pivot.x + Math.sin(phi) * L;
    const cy0 = pivot.y + Math.cos(phi) * L;
    let weight = 0;
    if (pointerX !== null && !dragging) {
      const dist = Math.hypot(pointerX - cx0, pointerY - (cy0 + 0.29 * H));
      weight = 1 - clamp((dist - NEAR) / (FAR - NEAR), 0, 1);
      weight *= weight;
    }
    const air = clamp(speed * 0.6, -2600, 2600) * weight;

    const prev = phi;
    if (dragging) {
      // the card follows the hand, but through a fast ease so a dropped frame
      // or a jumpy mouse can never teleport it
      phi += (dragPhi - phi) * Math.min(1, dt * 30);
    } else {
      const accel = air / L - (GRAV / L) * Math.sin(phi);
      omega += (accel - DAMP * omega) * dt;
      omega = clamp(omega, -4.5, 4.5);
      phi += omega * dt;
    }
    const raw = (phi - prev) / dt;
    vel = vel * 0.72 + raw * 0.28;

    if (!dragging) phi = clamp(phi, -1.0, 1.0);

    render();

    // park the loop once the badge has actually stopped moving. Asking "is it
    // near its target" never becomes true while the pointer holds it away from
    // rest, and a loop that never parks keeps the compositor busy forever.
    const settled = !dragging && Math.abs(phi - prev) < 0.00002 && Math.abs(omega) < 0.004;
    if (settled) {
      omega = 0;
      vel = 0;
      running = false;
      return;
    }
    requestAnimationFrame(frame);
  }

  function wake() {
    if (running) return;
    running = true;
    lastT = 0;
    requestAnimationFrame(frame);
  }

  window.addEventListener('pointermove', (e) => {
    if (lastPointerX === null) lastPointerX = e.clientX;
    pointerX = e.clientX;
    pointerY = e.clientY;
    wake();
    if (!dragging) return;
    dragPhi = clamp(dragStartPhi + (e.clientX - dragStartX) / (0.8 * L), -1.1, 1.1);
  }, { passive: true });

  window.addEventListener('pointerleave', () => { pointerX = null; pointerY = null; lastPointerX = null; });
  window.addEventListener('blur', () => { pointerX = null; pointerY = null; lastPointerX = null; });

  card.addEventListener('pointerdown', (e) => {
    dragging = true;
    card.classList.add('dragging');
    card.setPointerCapture(e.pointerId);
    dragStartX = e.clientX;
    dragStartPhi = phi;
    dragPhi = phi;
    omega = 0;
    wake();
    e.preventDefault();
  });

  function release(e) {
    if (!dragging) return;
    dragging = false;
    card.classList.remove('dragging');
    if (card.hasPointerCapture && e && e.pointerId !== undefined &&
        card.hasPointerCapture(e.pointerId)) {
      card.releasePointerCapture(e.pointerId);
    }
    // the badge keeps the speed of the hand, but not more than a lanyard can
    omega = clamp(vel, -3.5, 3.5);
    wake();
  }
  card.addEventListener('pointerup', release);
  card.addEventListener('pointercancel', release);
  window.addEventListener('pointerup', release);

  measure();
  window.addEventListener('resize', () => { measure(); wake(); });
  render();
  omega = 0.5;
  wake();
})();
