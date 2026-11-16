/* Lanyard physics — two-rope model.

   The badge is not a rigid pendulum on a hinge. It is a body hanging from two
   strap halves, each of which is a rope: it pulls when taut and goes slack when
   the badge swings toward it. That is what makes the motion free instead of a
   compass arc — the badge can rise, bob, and twist, and the two sides take
   turns carrying the weight.

   The pointer only pushes while it is moving (a hand sweeping past), never while
   it is parked, which is what removed the jitter. */

(function () {
  const badge = document.getElementById('badge');
  const card = document.getElementById('cardImg');
  const cordA = document.getElementById('cordA');
  const cordB = document.getElementById('cordB');
  const sheenA = document.getElementById('sheenA');
  const sheenB = document.getElementById('sheenB');
  if (!badge || !card) return;

  const GRAV = 2600;      // px/s^2
  const K = 240;          // rope stiffness, per s^2
  const DAMP = 1.25;      // velocity damping, per second
  const TAIL = 8.0;       // extra damping as the swing dies away
  const TAILREF = 90;     // px/s: full tail damping below this
  const SLACK = 0.10;     // a rope may stretch this much before it becomes rigid
  const VMAX = 900;       // px/s, keeps a yank from launching the badge off screen
  const NEAR = 220;       // px, full pointer influence inside this radius
  const FAR = 800;        // px, no influence beyond this
  const SAMPLES = 18;

  // measured off card-shadow.webp: the strap enters at the very top centre of
  // the image, the metal ring hangs 5px left of the image centre, and the photo
  // itself is rotated 6.1 degrees, which is taken out so the card hangs level
  const IMG_W = 728, IMG_H = 1111;
  const PIVOT_X = 301, PIVOT_Y = 0;
  const BASE = 0.1065;    // rad, photo's own tilt

  let W = 1, H = 1;
  let neckL = { x: 0, y: 0 };
  let neckR = { x: 0, y: 0 };
  let rope = 1;           // rest length of each rope half
  let restX = 0, restY = 0;
  let restPx = 0, restPy = 0;
  let scale = 0.3, originX = 0, originY = 0, strapW = 12;

  // particle: top centre of the card
  let px = 0, py = 0, vx = 0, vy = 0;
  // card's own rotation
  let angle = 0, angVel = 0;

  let pointerX = null, pointerY = null, lastPointerX = null, lastSpeed = 0;
  let dragging = false;
  let dragOffX = 0, dragOffY = 0;
  let lastT = 0, running = false;
  let stillFrames = 0;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function measure() {
    const r = badge.getBoundingClientRect();
    W = r.width || window.innerWidth;
    H = r.height || window.innerHeight;

    const spread = 0.075 * W;
    const neckY = -0.32 * H;
    neckL = { x: W / 2 - spread, y: neckY };
    neckR = { x: W / 2 + spread, y: neckY };

    restX = W / 2;
    restY = 0.19 * H;
    rope = Math.hypot(restX - neckL.x, restY - neckL.y);

    // scale of the card image, so the strap width and the clip position stay
    // locked to the artwork at any viewport size
    scale = (card.clientHeight || 0.61 * H) / IMG_H;
    originX = PIVOT_X * scale;
    originY = PIVOT_Y * scale;
    card.style.transformOrigin = originX.toFixed(1) + 'px ' + originY.toFixed(1) + 'px';
    strapW = Math.max(6, 33 * scale);

    // start at the rest pose, then let the ropes take the weight so the badge
    // does not visibly drop on load
    px = restX; py = restY; vx = vy = 0; angle = 0; angVel = 0;
    for (let i = 0; i < 360; i++) step(1 / 120, null);
    vx = vy = 0; angVel = 0;
    // where the ropes actually hold it, so it can be snapped back there exactly
    restPx = px; restPy = py;
  }

  function step(dt, air) {
    let ax = 0, ay = GRAV;

    for (const n of [neckL, neckR]) {
      const dx = px - n.x, dy = py - n.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > rope) {
        const f = -K * (d - rope);
        ax += (f * dx) / d;
        ay += (f * dy) / d;
      }
    }
    if (air !== null) ax += air;

    vx += ax * dt;
    vy += ay * dt;
    // a light drag while it swings, a much heavier one as it dies away, so the
    // badge does not keep micro-swinging for ten seconds after one flick
    const sp0 = Math.hypot(vx, vy);
    const drag = DAMP + TAIL * (1 - Math.min(1, sp0 / TAILREF));
    vx -= vx * drag * dt;
    vy -= vy * drag * dt;

    const sp = Math.hypot(vx, vy);
    if (sp > VMAX) { vx *= VMAX / sp; vy *= VMAX / sp; }

    px += vx * dt;
    py += vy * dt;

    // a rope cannot stretch past its limit: kill only the outward component, so
    // the tangential swing survives
    for (const n of [neckL, neckR]) {
      const dx = px - n.x, dy = py - n.y;
      const d = Math.hypot(dx, dy) || 1;
      const lim = rope * (1 + SLACK);
      if (d > lim) {
        const nx = dx / d, ny = dy / d;
        px = n.x + nx * lim;
        py = n.y + ny * lim;
        const vr = vx * nx + vy * ny;
        if (vr > 0) { vx -= vr * nx; vy -= vr * ny; }
      }
    }

    // the badge hangs from the clip, so it turns to face the pull, with a little
    // lag of its own
    const mx = (neckL.x + neckR.x) / 2, my = (neckL.y + neckR.y) / 2;
    const target = Math.atan2(px - mx, Math.max(1, py - my));
    angVel += ((target - angle) * 110 - angVel * 13) * dt;
    angle += angVel * dt;
    angle = clamp(angle, -0.5, 0.5);
  }

  function ribbon(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const d = Math.hypot(dx, dy) || 1;
    const slack = Math.max(0, rope * 1.02 - d);
    const bow = slack * 0.55;
    const nx0 = -dy / d, ny0 = dx / d;
    const ctrl = { x: (from.x + to.x) / 2 + nx0 * bow, y: (from.y + to.y) / 2 + ny0 * bow };

    const wTop = strapW;
    const wBot = strapW * 0.9;   // a lanyard strap is a flat band, barely tapered

    const left = [], right = [], spine = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES, it = 1 - t;
      const x = it * it * from.x + 2 * it * t * ctrl.x + t * t * to.x;
      const y = it * it * from.y + 2 * it * t * ctrl.y + t * t * to.y;
      const tx = 2 * it * (ctrl.x - from.x) + 2 * t * (to.x - ctrl.x);
      const ty = 2 * it * (ctrl.y - from.y) + 2 * t * (to.y - ctrl.y);
      const len = Math.hypot(tx, ty) || 1;
      const nx = -ty / len, ny = tx / len;
      const w = (wTop * (1 - t) + wBot * t) / 2;
      left.push([x + nx * w, y + ny * w]);
      right.push([x - nx * w, y - ny * w]);
      spine.push([x + nx * w * 0.35, y + ny * w * 0.35]);
    }

    const poly = left.concat(right.reverse())
      .map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') + ' Z';
    const line = spine
      .map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    return { poly, line };
  }

  function render() {
    const vis = angle + BASE;
    card.style.transform =
      'translate(' + px.toFixed(2) + 'px,' + py.toFixed(2) + 'px) translate(' +
      (-originX).toFixed(1) + 'px,' + (-originY).toFixed(1) + 'px) rotate(' +
      ((vis * 180) / Math.PI).toFixed(3) + 'deg)';

    // the strap ends inside the metal ring, behind the card, so it can never
    // look detached — the clip covers the join at every angle
    const ca = Math.cos(vis), sa = Math.sin(vis);
    const hookAt = (ox, oy) => ({ x: px + ox * ca - oy * sa, y: py + ox * sa + oy * ca });

    const rx = 5 * scale, ry = 30 * scale, spread = 5 * scale;

    const a = ribbon(neckL, hookAt(rx - spread, ry));
    const b = ribbon(neckR, hookAt(rx + spread, ry));
    cordA.setAttribute('d', a.poly);
    cordB.setAttribute('d', b.poly);
    if (sheenA) sheenA.setAttribute('d', a.line);
    if (sheenB) sheenB.setAttribute('d', b.line);
  }

  function frame(t) {
    const dt = Math.min(0.05, Math.max(0.001, (t - (lastT || t)) / 1000));
    lastT = t;

    let speed = 0;
    if (pointerX !== null) {
      speed = (pointerX - lastPointerX) / dt;
      lastPointerX = pointerX;
    }
    speed = speed * 0.5 + lastSpeed * 0.5;
    lastSpeed = speed;

    let air = null;
    if (!dragging && pointerX !== null) {
      const dist = Math.hypot(pointerX - px, pointerY - (py + 0.29 * H));
      let weight = 1 - clamp((dist - NEAR) / (FAR - NEAR), 0, 1);
      weight *= weight;
      air = clamp(speed * 0.9, -3000, 3000) * weight;
    }

    const ox = px, oy = py, oa = angle;
    if (dragging) {
      // follow the hand, through an ease so a dropped frame cannot teleport it
      const tx = pointerX - dragOffX, ty = pointerY - dragOffY;
      const k = Math.min(1, dt * 22);
      px += (tx - px) * k;
      py += (ty - py) * k;
      vx = (px - ox) / dt;
      vy = (py - oy) / dt;
      const mx = (neckL.x + neckR.x) / 2, my = (neckL.y + neckR.y) / 2;
      const tg = Math.atan2(px - mx, Math.max(1, py - my));
      angle += (tg - angle) * Math.min(1, dt * 14);
      angVel = 0;
    } else {
      step(dt, air);
    }

    render();

    // Park the loop once the badge has truly come to rest. This needs a run of
    // frames, not a single one: at the top of a swing the velocity passes
    // through zero for an instant, and parking there would freeze the badge
    // mid-air, hanging off-centre and tilted.
    const still = !dragging &&
      Math.abs(px - ox) < 0.02 && Math.abs(py - oy) < 0.02 &&
      Math.abs(angle - oa) < 0.0002 && Math.hypot(vx, vy) < 1.2 && Math.abs(angVel) < 0.02;
    stillFrames = still ? stillFrames + 1 : 0;
    if (stillFrames > 30) {
      // the last few hundredths of a pixel are invisible; snap to the exact
      // hanging pose so the page is perfectly still once it has settled
      px = restPx; py = restPy; angle = 0;
      vx = vy = 0; angVel = 0;
      stillFrames = 0;
      running = false;
      render();
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
  }, { passive: true });

  window.addEventListener('pointerleave', () => {
    pointerX = null; pointerY = null; lastPointerX = null; lastSpeed = 0;
  });
  window.addEventListener('blur', () => {
    pointerX = null; pointerY = null; lastPointerX = null; lastSpeed = 0;
  });

  card.addEventListener('pointerdown', (e) => {
    dragging = true;
    card.classList.add('dragging');
    card.setPointerCapture(e.pointerId);
    // grab where the finger landed, so the card does not jump under the cursor
    const r = card.getBoundingClientRect();
    dragOffX = e.clientX - (r.left + r.width / 2);
    dragOffY = e.clientY - r.top;
    vx = vy = 0;
    wake();
    e.preventDefault();
  });

  function release(e) {
    if (!dragging) return;
    dragging = false;
    card.classList.remove('dragging');
    if (e && e.pointerId !== undefined && card.hasPointerCapture &&
        card.hasPointerCapture(e.pointerId)) {
      card.releasePointerCapture(e.pointerId);
    }
    vx = clamp(vx, -VMAX, VMAX);
    vy = clamp(vy, -VMAX, VMAX);
    wake();
  }
  card.addEventListener('pointerup', release);
  card.addEventListener('pointercancel', release);
  window.addEventListener('pointerup', release);

  measure();
  // a small nudge on load, so the page is alive before anyone touches it
  vx = 240;
  render();
  wake();
  window.addEventListener('resize', () => { measure(); wake(); });
})();
