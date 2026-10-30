/* survey/render.js — CAD-style commissioning plate of the ACTUAL colony.
   Renders the live scene graph with report-only materials into an offscreen
   target, restores every live property in `finally`, then composes paper,
   hatching, outline, leader lines and the factual record on a 2D canvas.
   Nothing here touches the store or the gameplay camera. */
import * as THREE from 'three';
import { rng, closingLine, candidateLabels } from './facts.js';
import { placeLabels } from './labels.js';

const PAPER = '#f1ece1', GRAPHITE = '#3a3733', TEAL = '#3f7f84', TEAL_SOFT = '#9fc2c3', MUTE = '#7a756d';
const W = 1600, H = 1180, MARGIN = 96;

/** Frame a camera on the world's bounding sphere from a fixed documentation azimuth. */
function surveyCamera(handles, aspect) {
  const box = new THREE.Box3().setFromObject(handles.world);
  const sph = box.getBoundingSphere(new THREE.Sphere());
  const cam = new THREE.PerspectiveCamera(30, aspect, .1, 500);
  const dist = sph.radius / Math.sin(THREE.MathUtils.degToRad(15)) * .62;   // Box3 of the shell is generous; tighten
  cam.position.copy(sph.center).add(new THREE.Vector3(.55, .42, 1).normalize().multiplyScalar(dist));
  cam.lookAt(sph.center); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  return cam;
}

/** Render the scene into an RGBA target with a material override; returns ImageData. */
function renderPass(handles, cam, w, h, setup) {
  const { renderer, scene } = handles;
  const rt = new THREE.WebGLRenderTarget(w, h, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType });
  const saved = { target: renderer.getRenderTarget(), clear: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(), tone: renderer.toneMapping, fog: scene.fog, bg: scene.background, override: scene.overrideMaterial };
  const vis = [];
  try {
    scene.traverse(o => { if (o.isPoints) { vis.push([o, o.visible]); o.visible = false } });   // no stars on paper
    setup?.(vis);
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.toneMapping = THREE.NoToneMapping; scene.fog = null; scene.background = null;
    renderer.clear(); renderer.render(scene, cam);
    const px = new Uint8Array(w * h * 4); renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
    // flip Y (GL origin is bottom-left)
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) out.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    return new ImageData(out, w, h);
  } finally {
    vis.forEach(([o, v]) => o.visible = v);
    scene.overrideMaterial = saved.override; scene.fog = saved.fog; scene.background = saved.bg;
    renderer.toneMapping = saved.tone; renderer.setClearColor(saved.clear, saved.alpha); renderer.setRenderTarget(saved.target);
    rt.dispose();
  }
}

/** Sobel edge of the alpha/colour mask → graphite contour. Returns a canvas. */
function outlineFrom(img, color, thick = 1) {
  const { width: w, height: h, data } = img;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); const out = ctx.createImageData(w, h);
  const lum = (x, y) => { const i = (y * w + x) * 4; return data[i + 3] ? (data[i] + data[i + 1] + data[i + 2]) / 3 : -255 };
  const [r, g, b] = color;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const gx = -lum(x - 1, y - 1) - 2 * lum(x - 1, y) - lum(x - 1, y + 1) + lum(x + 1, y - 1) + 2 * lum(x + 1, y) + lum(x + 1, y + 1);
    const gy = -lum(x - 1, y - 1) - 2 * lum(x, y - 1) - lum(x + 1, y - 1) + lum(x - 1, y + 1) + 2 * lum(x, y + 1) + lum(x + 1, y + 1);
    const m = Math.min(255, Math.hypot(gx, gy) / 2);
    if (m > 40) { const i = (y * w + x) * 4; out.data[i] = r; out.data[i + 1] = g; out.data[i + 2] = b; out.data[i + 3] = Math.min(255, m * thick) }
  }
  ctx.putImageData(out, 0, 0); return c;
}

function project(cam, v, w, h) { const p = v.clone().project(cam); return { x: (p.x + 1) / 2 * w, y: (1 - p.y) / 2 * h, z: p.z } }

/**
 * Build the plate. Returns { canvas, labels, view }. Caller owns disposal of nothing:
 * every GPU resource is released before return.
 * @param view 'survey' | 'current'
 */
export function renderSurvey(handles, facts, view = 'survey') {
  const { materials, cells, rock, camera: liveCam } = handles;
  const rw = 1000, rh = 700;                                    // render window inside the plate
  const cam = view === 'current' ? (() => { const c = liveCam.clone(); c.aspect = rw / rh; c.updateProjectionMatrix(); c.updateMatrixWorld(true); return c })() : surveyCamera(handles, rw / rh);

  // --- pass 1: rock mask (flat), everything else hidden → clean silhouette for the Sobel
  // Hide objects matching pred. Objects already invisible in the live scene (unbuilt hex
  // cells, hidden drones, unspawned leaves) stay hidden: the plate draws what EXISTS.
  const hide = (pred, vis) => handles.scene.traverse(o => { if (o.isMesh || o.isLine || o.isLineSegments) { if (pred(o)) { vis.push([o, o.visible]); o.visible = false } } });
  const builtCell = o => o.isLineSegments && o.parent && o.parent.visible && cells.some(c => c.mesh === o.parent);
  const flat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const rockImg = renderPass(handles, cam, rw, rh, vis => { hide(o => o !== rock, vis); handles.scene.overrideMaterial = flat });
  flat.dispose();
  // --- pass 2: soft tone of the rock (lit, grey) for sparse shading reference
  const grey = new THREE.MeshLambertMaterial({ color: 0xd8d2c6 });
  const toneImg = renderPass(handles, cam, rw, rh, vis => { hide(o => o !== rock, vis); handles.scene.overrideMaterial = grey });
  grey.dispose();
  // --- pass 3: hex structure as thin teal edges only (reuse existing EdgesGeometry lines)
  const edgeTeal = new THREE.LineBasicMaterial({ color: 0x3f7f84, transparent: true, opacity: .95 });
  const hexImg = renderPass(handles, cam, rw, rh, vis => { hide(o => !builtCell(o), vis); handles.scene.overrideMaterial = edgeTeal });
  edgeTeal.dispose();
  // --- pass 4: plants + robot as graphite silhouettes
  const ink = new THREE.MeshBasicMaterial({ color: 0x5a8c6a });   // vegetation + miner: muted green-graphite, distinct from the teal structure
  const inkImg = renderPass(handles, cam, rw, rh, vis => { hide(o => { let p = o; while (p) { if (p === handles.plantLayer || p === handles.robot) return false; p = p.parent } return true }, vis); handles.scene.overrideMaterial = ink });
  ink.dispose();

  // --- compose
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const r = rng(facts.seed + 'p');
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
  // paper grain: sparse seeded speckle
  ctx.fillStyle = 'rgba(58,55,51,.05)'; for (let i = 0; i < 2600; i++) ctx.fillRect(r() * W, r() * H, 1, 1);
  // frame + title block rules
  ctx.strokeStyle = GRAPHITE; ctx.lineWidth = 1.2; ctx.strokeRect(MARGIN / 2, MARGIN / 2, W - MARGIN, H - MARGIN);
  ctx.lineWidth = .6; ctx.strokeRect(MARGIN / 2 + 8, MARGIN / 2 + 8, W - MARGIN - 16, H - MARGIN - 16);

  const ox = (W - rw) / 2, oy = 150;
  // render window: tone (very light), then hatch inside rock mask, then outline, hexes, ink
  const tmp = document.createElement('canvas'); tmp.width = rw; tmp.height = rh; const tc = tmp.getContext('2d');
  tc.putImageData(toneImg, 0, 0); ctx.globalAlpha = .55; ctx.drawImage(tmp, ox, oy); ctx.globalAlpha = 1;
  // sparse hatching clipped to the rock mask, on the shadow side
  tc.putImageData(rockImg, 0, 0);
  ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, rw, rh); ctx.clip();
  const maskC = document.createElement('canvas'); maskC.width = rw; maskC.height = rh; const mc = maskC.getContext('2d');
  mc.putImageData(rockImg, 0, 0); mc.globalCompositeOperation = 'source-in';
  mc.strokeStyle = 'rgba(58,55,51,.22)'; mc.lineWidth = .7;
  const hatchOff = r() * 14; for (let d = -rh; d < rw + rh; d += 14) { mc.beginPath(); mc.moveTo(d + hatchOff, 0); mc.lineTo(d + hatchOff - rh * .6, rh); mc.stroke() }
  ctx.globalAlpha = .9; ctx.drawImage(maskC, ox, oy); ctx.globalAlpha = 1;
  ctx.drawImage(outlineFrom(rockImg, [58, 55, 51], 2.2), ox, oy);
  tc.putImageData(hexImg, 0, 0); ctx.drawImage(tmp, ox, oy);
  tc.putImageData(inkImg, 0, 0); ctx.globalAlpha = .85; ctx.drawImage(tmp, ox, oy); ctx.globalAlpha = 1;
  ctx.drawImage(outlineFrom(inkImg, [58, 55, 51], 1.4), ox, oy);     // graphite contour on vegetation/miner too
  ctx.restore();

  // --- labels: project anchors, check visibility by depth vs rock mask alpha (occlusion proxy)
  const A = handles.anchors();
  const cands = candidateLabels(facts).map(c => {
    const p = project(cam, A[c.anchor], rw, rh);
    const inside = p.x >= 0 && p.x < rw && p.y >= 0 && p.y < rh && p.z < 1;
    // occluded if the rock mask is opaque here AND the anchor is farther than the rock surface (approx: inside mask and anchor behind rock centre)
    const mi = inside ? (Math.floor(p.y) * rw + Math.floor(p.x)) * 4 + 3 : 0;
    const behindRock = inside && rockImg.data[mi] > 128 && A[c.anchor].distanceTo(cam.position) > rock.position.distanceTo(cam.position);
    return { ...c, x: p.x + ox, y: p.y + oy, visible: inside && !behindRock };
  });
  const labels = placeLabels(cands, { w: W, h: H, margin: MARGIN, lineH: 22, charW: 9.2 });
  ctx.font = '15px "B612 Mono", monospace'; ctx.fillStyle = GRAPHITE; ctx.strokeStyle = TEAL; ctx.lineWidth = 1;
  labels.forEach(l => {
    const ex = l.side === 'L' ? l.lx + l.tw + 6 : l.lx - 6;
    ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(ex, l.ly); ctx.stroke();
    ctx.beginPath(); ctx.arc(l.x, l.y, 3, 0, Math.PI * 2); ctx.fillStyle = TEAL; ctx.fill(); ctx.fillStyle = GRAPHITE;
    ctx.fillText(l.text, l.lx, l.ly + 5);
  });

  // --- titles
  ctx.fillStyle = GRAPHITE; ctx.font = '700 30px "B612 Mono", monospace'; ctx.fillText('VESPER / BELTER', MARGIN, 108);
  ctx.font = '20px "B612 Mono", monospace'; ctx.fillText('Asteroid Habitat — Commissioning Survey', MARGIN, 136);
  ctx.font = '13px "B612", sans-serif'; ctx.fillStyle = MUTE; ctx.fillText('Recorded at atmosphere stabilization.  CAD-style survey — not an engineering certification.', MARGIN, 158);
  ctx.textAlign = 'right'; ctx.font = '13px "B612 Mono", monospace'; ctx.fillStyle = GRAPHITE; ctx.fillText(facts.designation, W - MARGIN, 108);
  ctx.fillStyle = MUTE; ctx.fillText(view === 'survey' ? 'View: survey (documentation framing)' : 'View: current (operator viewpoint)', W - MARGIN, 130); ctx.textAlign = 'left';

  // --- verification record (title block, bottom)
  const by = oy + rh + 34; const col = (W - 2 * MARGIN) / 3;
  ctx.strokeStyle = GRAPHITE; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(MARGIN, by - 14); ctx.lineTo(W - MARGIN, by - 14); ctx.stroke();
  const kv = (x, y, k, v, warn) => { ctx.font = '11px "B612 Mono", monospace'; ctx.fillStyle = MUTE; ctx.fillText(k, x, y); ctx.fillStyle = warn ? '#9a4a2a' : GRAPHITE; ctx.font = '13px "B612 Mono", monospace'; ctx.fillText(v, x, y + 16) };
  const p = facts.pkg;
  kv(MARGIN, by, 'manifest', `${facts.manifest.fields.filter(f => f.ok).length}/${facts.manifest.fields.length} fields valid`);
  kv(MARGIN, by + 40, 'tests', facts.tests.categories.map(c => `${c.category} ${c.ok ? '✓' : '✗'}`).join('  '));
  kv(MARGIN, by + 80, 'write clearance', facts.clearance, facts.clearance !== 'granted');
  kv(MARGIN + col, by, 'package', `${p.name} (${p.kind}) ${p.version}`);
  kv(MARGIN + col, by + 40, 'provenance', p.provenance, p.provenance === 'New');
  kv(MARGIN + col, by + 80, 'pin / trust / review', `${p.pinned ? 'pinned' : 'unpinned'} / ${facts.trustTier} / ${facts.review.flags}/${facts.review.of}`);
  kv(MARGIN + 2 * col, by, 'final O2', `${facts.o2} %`);
  kv(MARGIN + 2 * col, by + 40, 'installed at', p.installedAt || '—');
  kv(MARGIN + 2 * col, by + 80, 'interior', facts.interior);
  ctx.font = '11px "B612 Mono", monospace'; ctx.fillStyle = MUTE; ctx.fillText('artifact digest (game package, not a signature of this plate)', MARGIN, by + 126);
  ctx.font = '12px "B612 Mono", monospace'; ctx.fillStyle = GRAPHITE; ctx.fillText(p.digest, MARGIN, by + 142);
  ctx.font = '12px "B612", sans-serif'; ctx.fillStyle = MUTE; ctx.fillText(closingLine(facts), MARGIN, by + 168);

  return { canvas, labels, view };
}
