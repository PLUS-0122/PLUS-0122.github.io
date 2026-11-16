// Interactive lanyard badge: a real 3D rigid body hanging from two 12-link straps.
// three.js (MIT) renders it, Rapier (Apache-2.0) does the physics.
// Geometry, materials and layout are our own; the parameter values follow a
// reference portfolio that uses the same two libraries.

import * as THREE from '../vendor/three.module.min.js';
import RAPIER from '../vendor/rapier.es.js';

// card.webp is 640 x 1157: the card body spans y 148..1154 (604 px wide) and
// the metal clip occupies y 8..147.  Those numbers come from tools/cutcard.py.
const TEX_W = 640, TEX_H = 1157;
const CARD_PX_W = 604, CARD_PX_H = 1006;
const CARD_TOP_PX = 148, RING_TOP_PX = 8;

const CARD_W = 2.8;
const S = CARD_W / CARD_PX_W;          // world units per texture pixel
const CARD_H = CARD_PX_H * S;
const HH = CARD_H / 2;
const PLANE_W = TEX_W * S;
const PLANE_H = TEX_H * S;
const CARD_MID_PX = CARD_TOP_PX + CARD_PX_H / 2;      // 651
const PLANE_OFF_Y = (CARD_MID_PX - TEX_H / 2) * S;    // plane centre vs card centre
const ATTACH_Y = (CARD_MID_PX - RING_TOP_PX) * S;     // clip ring, above card top
const VIS_TOP = ATTACH_Y;             // highest visible pixel of the artwork

const MASS = 0.72;
const GRIP = 100;
const STIFF = 90;

const SPEED = 1 / 120;
const LINKS = 12;

// collision layers: card and straps only collide with the backing wall
const G_CARD = 0x0002, G_STRAP = 0x0004, G_WALL = 0x0008;
const groups = (mem, filter) => (mem << 16) | filter;

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

export async function start(stage) {
  const canvas = stage.querySelector('canvas');
  if (!canvas) return;

  await RAPIER.init();

  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: true, powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);

  const tex = await new THREE.TextureLoader().loadAsync(
    new URL('../assets/card.webp', import.meta.url).href
  );
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const rig = new THREE.Object3D();       // follows the rigid body
  scene.add(rig);

  const card = new THREE.Mesh(
    new THREE.PlaneGeometry(PLANE_W, PLANE_H),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.FrontSide })
  );
  card.position.set(0, PLANE_OFF_Y, 0);   // card body sits under the body centre
  card.renderOrder = 3;
  rig.add(card);

  /* ------------------------------ physics ------------------------------ */
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = SPEED;
  world.numSolverIterations = 32;

  world.createCollider(
    RAPIER.ColliderDesc.cuboid(50, 50, 0.2)
      .setTranslation(0, 0, -1.2)
      .setFriction(0.4)
      .setCollisionGroups(groups(G_WALL, G_CARD | G_STRAP))
  );

  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, 0, 0)
      .setLinearDamping(0.45)
      .setAngularDamping(0.65)
      .setCcdEnabled(true)
      .setCanSleep(false)
  );

  const cardCollider = RAPIER.ColliderDesc.cuboid(CARD_W / 2, HH, 0.1)
    .setMass(MASS)
    .setFriction(0.45)
    .setRestitution(0)
    .setCollisionGroups(groups(G_CARD, G_WALL));
  world.createCollider(cardCollider, body);

  // attach point of the two straps, in card-local space (clip ring in the artwork)
  const clip = (side) => ({ x: side * 0.012, y: ATTACH_Y, z: 0.05 });

  const strapDefs = [-1, 1].map((side) => {
    const anchor = { x: side * 3.25, y: 8.9, z: -0.28 };
    const attach = clip(side);
    const span = Math.hypot(anchor.x - attach.x, anchor.y - attach.y, anchor.z - attach.z);
    const segment = span / LINKS;

    const fixed = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(anchor.x, anchor.y, anchor.z)
    );

    const links = [];
    for (let k = 1; k <= LINKS; k++) {
      const t = k / LINKS;
      const link = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(
            anchor.x + (attach.x - anchor.x) * t,
            anchor.y + (attach.y - anchor.y) * t,
            anchor.z + (attach.z - anchor.z) * t
          )
          .setLinearDamping(1.6)
          .setAngularDamping(1.6)
          .setCcdEnabled(true)
          .setCanSleep(false)
      );
      link.setEnabledRotations(false, false, false, false);

      world.createCollider(
        RAPIER.ColliderDesc.capsule(0.05, segment / 2)
          .setMass(0.0125)
          .setFriction(0.4)
          .setCollisionGroups(groups(G_STRAP, G_WALL)),
        link
      );

      world.createImpulseJoint(
        RAPIER.JointData.rope(segment, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
        links.length ? links[links.length - 1] : fixed,
        link,
        true
      );
      links.push(link);
    }

    world.createImpulseJoint(
      RAPIER.JointData.spherical({ x: 0, y: 0, z: 0 }, attach),
      links[links.length - 1],
      body,
      true
    );

    // bending stiffness across 1, 2 and 3 links
    const chain = [fixed, ...links];
    for (const r of [1, 2, 3]) {
      for (let i = r; i < chain.length; i++) {
        const k = STIFF * (r === 1 ? 0.6 : r === 2 ? 1 : 0.45);
        world.createImpulseJoint(
          RAPIER.JointData.spring(
            segment * r, k, 1.4 * Math.sqrt(k * 0.0125),
            { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }
          ),
          chain[i - r],
          chain[i],
          true
        );
      }
    }

    return { anchor, attach, links, segment };
  });

  /* ------------------------------ ribbon ------------------------------ */
  const POINTS = 1 + LINKS + 1; // anchor + links + attach
  const positions = new Float32Array(POINTS * 2 * 3);
  const index = [];
  for (let i = 0; i < POINTS - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    index.push(a, b, c, b, d, c);
  }

  const ribbons = strapDefs.map(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3));
    geo.setIndex(index);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color: 0x2b3129, side: THREE.DoubleSide })
    );
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    scene.add(mesh);
    return mesh;
  });

  const W_TOP = 0.135, W_BOT = 0.078;
  const tmp = new THREE.Vector3();

  function drawRibbon(mesh, def) {
    const pts = [def.anchor];
    for (const link of def.links) {
      const t = link.translation();
      pts.push({ x: t.x, y: t.y, z: t.z });
    }
    const r = body.rotation();
    const a = def.attach;
    const c = body.translation();
    const attach = rotate({ x: a.x, y: a.y, z: a.z }, r, c);
    pts.push(attach);

    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      let tx = next.x - prev.x, ty = next.y - prev.y;
      const len = Math.hypot(tx, ty) || 1;
      tx /= len; ty /= len;
      const w = W_TOP + (W_BOT - W_TOP) * (i / (pts.length - 1));
      const nx = -ty * w, ny = tx * w;
      pos.setXYZ(i * 2, p.x + nx, p.y + ny, p.z);
      pos.setXYZ(i * 2 + 1, p.x - nx, p.y - ny, p.z);
    }
    pos.needsUpdate = true;
    mesh.geometry.computeBoundingSphere();
  }

  function rotate(v, q, origin) {
    const { x, y, z, w } = q;
    const ix = w * v.x + y * v.z - z * v.y;
    const iy = w * v.y + z * v.x - x * v.z;
    const iz = w * v.z + x * v.y - y * v.x;
    const iw = -x * v.x - y * v.y - z * v.z;
    return {
      x: ix * w + iw * -x + iy * -z - iz * -y + origin.x,
      y: iy * w + iw * -y + iz * -x - ix * -z + origin.y,
      z: iz * w + iw * -z + ix * -y - iy * -x + origin.z
    };
  }

  /* ------------------------------ camera ------------------------------ */
  const FOV = 36;
  let restY = 0;

  function fit() {
    const w = stage.clientWidth || 1, h = stage.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;

    const tanF = Math.tan(FOV * Math.PI / 360);
    const viewH = CARD_H / 0.60;          // the card fills ~60% of the height
    const d = viewH / (2 * tanF);
    const camY = (restY + VIS_TOP + 0.03 * viewH) - viewH / 2;

    camera.position.set(0, camY, d);
    camera.lookAt(0, camY, 0);
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', () => { fit(); renderOnce(); });

  /* ----------------------------- interaction -------------------------- */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

  let dragging = false;
  let grabLocal = null;
  let pointer = null;
  let lastPtr = null;
  let lastT = 0;

  function toWorld(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    return raycaster.ray.intersectPlane(plane, hit) ? hit : null;
  }

  function hitCard(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObject(card, false)[0] || null;
  }

  canvas.addEventListener('pointerdown', (e) => {
    const hit = hitCard(e);
    if (!hit) return;
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
    const c = body.translation();
    const r = body.rotation();
    const inv = { x: -r.x, y: -r.y, z: -r.z, w: r.w };
    const rel = { x: hit.point.x - c.x, y: hit.point.y - c.y, z: hit.point.z - c.z };
    grabLocal = rotate(rel, inv, { x: 0, y: 0, z: 0 });
    pointer = toWorld(e);
    wake();
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', (e) => {
    const now = performance.now();
    const dt = Math.max((now - lastT) / 1000, 0.016);

    if (dragging) {
      pointer = toWorld(e);
      lastT = now;
      lastPtr = { x: e.clientX, y: e.clientY };
      return;
    }

    const hit = hitCard(e);
    canvas.style.cursor = hit ? 'grab' : 'default';
    if (hit && lastPtr) {
      const vx = clamp((e.clientX - lastPtr.x) / dt, -12, 12);
      const vy = clamp((e.clientY - lastPtr.y) / dt, -12, 8);
      body.applyImpulseAtPoint(
        { x: vx * 0.008, y: -vy * 0.004, z: 0 },
        hit.point,
        true
      );
      wake();
    }
    lastPtr = { x: e.clientX, y: e.clientY };
    lastT = now;
  });

  const release = (e) => {
    if (!dragging) return;
    dragging = false;
    grabLocal = null;
    canvas.style.cursor = 'grab';
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    wake();
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => { if (!dragging) canvas.style.cursor = 'default'; });

  /* ------------------------------- loop ------------------------------- */
  let raf = 0, acc = 0, last = 0, still = 0;
  const quat = new THREE.Quaternion();
  const eul = new THREE.Euler();

  function step(dt) {
    if (dragging && pointer && grabLocal) {
      const c = body.translation();
      const q = body.rotation();
      const off = rotate(grabLocal, q, { x: 0, y: 0, z: 0 });

      const v = body.linvel(), av = body.angvel();
      const pointVel = {
        x: v.x + av.y * off.z - av.z * off.y,
        y: v.y + av.z * off.x - av.x * off.z,
        z: v.z + av.x * off.y - av.y * off.x
      };

      const l2 = off.x * off.x + off.y * off.y + off.z * off.z;
      const r = MASS / (1 + l2 / 0.65);
      const k = GRIP * r;
      const c2 = 2 * Math.sqrt(GRIP) * r;
      const o = 1 + (c2 * dt + k * dt * dt) / r;

      const px = c.x + off.x, py = c.y + off.y, pz = c.z + off.z;
      let ix = ((pointer.x - px) * k - pointVel.x * c2) / o;
      let iy = ((pointer.y - py) * k - pointVel.y * c2) / o;
      let iz = ((pointer.z - pz) * k - pointVel.z * c2) / o;

      const max = 110 * MASS;
      const m = Math.hypot(ix, iy, iz);
      if (m > max) { const s = max / m; ix *= s; iy *= s; iz *= s; }

      body.applyImpulseAtPoint({ x: ix * dt, y: iy * dt, z: iz * dt }, { x: px, y: py, z: pz }, true);
    }

    // swivel: the card may yaw and pitch a little, but it must not roll.
    // The real thing has a hinged clip; here a torque does the same job.
    const q0 = body.rotation();
    const e0 = eul.setFromQuaternion(quat.set(q0.x, q0.y, q0.z, q0.w), 'ZYX');
    const av0 = body.angvel();
    body.applyTorqueImpulse({
      x: (-e0.x * 34 - av0.x * 4) * dt,
      y: (-av0.y * 0.8) * dt,
      z: (-e0.z * 64 - av0.z * 5.2) * dt
    }, true);

    world.step();
  }

  function renderOnce() {
    const t = body.translation();
    const q = body.rotation();
    rig.position.set(t.x, t.y, t.z);
    rig.quaternion.set(q.x, q.y, q.z, q.w);
    rig.updateMatrixWorld();
    strapDefs.forEach((def, i) => drawRibbon(ribbons[i], def));
    renderer.render(scene, camera);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!last) last = now;
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;

    acc += dt;
    let guard = 0;
    while (acc >= SPEED && guard++ < 6) { step(SPEED); acc -= SPEED; }

    renderOnce();
    if (kick) report();

    const v = body.linvel(), a = body.angvel();
    const quiet = Math.hypot(v.x, v.y, v.z) < 0.02 && Math.hypot(a.x, a.y, a.z) < 0.02 && !dragging;
    still = quiet ? still + 1 : 0;
    if (still > 45) stop();
  }

  function wake() {
    if (!raf) { last = 0; still = 0; raf = requestAnimationFrame(frame); }
  }

  function stop() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  // settle before the first paint so the badge hangs still, then reveal
  for (let i = 0; i < 720; i++) {
    const q1 = body.rotation();
    const e1 = eul.setFromQuaternion(quat.set(q1.x, q1.y, q1.z, q1.w), 'ZYX');
    const av1 = body.angvel();
    body.applyTorqueImpulse({
      x: (-e1.x * 34 - av1.x * 4) * SPEED,
      y: (-av1.y * 0.8) * SPEED,
      z: (-e1.z * 64 - av1.z * 5.2) * SPEED
    }, true);
    world.step();
  }
  restY = body.translation().y;
  fit();
  renderOnce();
  stage.classList.add('live');

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else wake();
  });

  // a small nudge on arrival, like a badge that has just been put on
  body.applyImpulseAtPoint({ x: 0.35, y: 0, z: 0.03 }, { x: 0, y: HH - 0.7, z: 0.06 }, true);
  wake();

  // ?kick — push the badge sideways and record how far it travels in x and how
  // far it climbs in y, so the free (non-circular) path can be checked from the
  // outside; the numbers land in document.title every frame.
  const kick = location.search.includes('kick');
  const trace = { x0: 0, y0: restY, maxDx: 0, minDy: 0, maxDy: 0, t: 0 };
  if (kick) {
    trace.x0 = body.translation().x;
    trace.y0 = restY;
    trace.t = performance.now();
  }

  function report() {
    const t = body.translation();
    const e = new THREE.Euler().setFromQuaternion(
      new THREE.Quaternion(body.rotation().x, body.rotation().y, body.rotation().z, body.rotation().w),
      'ZYX'
    );
    if (kick) {
      trace.maxDx = Math.max(trace.maxDx, Math.abs(t.x - trace.x0));
      trace.minDy = Math.min(trace.minDy, t.y - trace.y0);
      trace.maxDy = Math.max(trace.maxDy, t.y - trace.y0);
    }
    document.title = JSON.stringify({
      sw: stage.clientWidth, sh: stage.clientHeight,
      d: +camera.position.z.toFixed(2), camY: +camera.position.y.toFixed(2),
      restY: +restY.toFixed(3), x: +t.x.toFixed(3), y: +t.y.toFixed(3), z: +t.z.toFixed(3),
      rx: +e.x.toFixed(3), ry: +e.y.toFixed(3), rz: +e.z.toFixed(3),
      maxDx: +trace.maxDx.toFixed(3), minDy: +trace.minDy.toFixed(3),
      maxDy: +trace.maxDy.toFixed(3), ms: Math.round(performance.now() - trace.t)
    });
  }

  if (location.search.includes('debug')) report();
  if (kick) {
    // run the solver synchronously: the tab may be in the background, where
    // requestAnimationFrame is throttled and would never advance the trace
    const mid = +(new URLSearchParams(location.search).get('mid') || 0);
    body.applyImpulse({ x: 2.2, y: 0, z: 0 }, true);
    for (let i = 0; i < (mid || 1440); i++) {
      step(SPEED);
      const t = body.translation();
      trace.maxDx = Math.max(trace.maxDx, Math.abs(t.x - trace.x0));
      trace.minDy = Math.min(trace.minDy, t.y - trace.y0);
      trace.maxDy = Math.max(trace.maxDy, t.y - trace.y0);
    }
    trace.t = performance.now() - 12000;
    report();
    renderOnce();
  }
}
