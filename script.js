/* Lanyard badge: hangs from the top edge, leans toward the pointer,
   and can be dragged. Spring–damper, no libraries. */
(function () {
  const badge = document.getElementById('badgeImg');
  if (!badge) return;

  const MAX_TILT = 10;      // degrees either side while tracking the pointer
  const STIFF = 0.035;      // spring stiffness
  const DAMP = 0.90;        // velocity damping
  const DRAG_RATIO = 0.18;  // degrees per pixel dragged

  let angle = 0;
  let velocity = 0;
  let target = 0;
  let dragging = false;
  let startX = 0;
  let startAngle = 0;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function targetFromPointer(clientX) {
    const cx = window.innerWidth / 2;
    const norm = (clientX - cx) / (window.innerWidth / 2);
    return clamp(norm, -1, 1) * MAX_TILT;
  }

  window.addEventListener('pointermove', (e) => {
    if (dragging) return;
    target = targetFromPointer(e.clientX);
  }, { passive: true });

  window.addEventListener('pointerleave', () => {
    if (!dragging) target = 0;
  });

  badge.addEventListener('pointerdown', (e) => {
    dragging = true;
    badge.classList.add('dragging');
    badge.setPointerCapture(e.pointerId);
    startX = e.clientX;
    startAngle = angle;
    velocity = 0;
    e.preventDefault();
  });

  badge.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    angle = startAngle + (e.clientX - startX) * DRAG_RATIO;
    target = targetFromPointer(e.clientX);
  });

  function release() {
    if (!dragging) return;
    dragging = false;
    badge.classList.remove('dragging');
  }
  badge.addEventListener('pointerup', release);
  badge.addEventListener('pointercancel', release);

  function tick() {
    if (!dragging) {
      velocity += (target - angle) * STIFF;
      velocity *= DAMP;
      angle += velocity;
    }
    badge.style.transform = 'rotate(' + angle.toFixed(3) + 'deg)';
    requestAnimationFrame(tick);
  }

  velocity = 0.45; // a small nudge on load so it feels alive
  tick();
})();
