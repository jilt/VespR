/* hud/index.js — composes the HUD components over a store and returns the
   scene bridge: { emit, gate, jammed, atmosphere, droneType, bindCells }. */
import { RULES, DRONE_TYPES } from '../content.js';
import { toast } from './toasts.js';
import { createConsole } from './console.js';
import { createDigest } from './digest.js';
import { createModals } from './modals.js';
import { createRail } from './rail.js';
import { renderBadges } from './badges.js';
import { renderTopbar } from './topbar.js';
import { createHexPainter } from './hexes.js';
import { createAudio } from './audio.js';

export function mountHud(store) {
  const hooks = {};                                   // late-bound to avoid circular construction
  const konsole = createConsole(store, hooks);
  const modals = createModals(store, konsole);
  const digest = createDigest(store, { ...konsole, toast });
  const rail = createRail(store, { ...konsole, openSurvey: modals.openSurvey });
  const hexes = createHexPainter(store);
  createAudio();
  hooks.onOverrideRequired = modals.openOverride;
  hooks.onMismatch = digest.flashMismatch;
  hooks.open = modals.open;
  hooks.loadGuide = modals.loadGuide;

  let sceneHandles = null;            // set once startScene() returns (see main.js)
  const flash = a => sceneHandles?.flash?.(a);

  store.subscribe((s, meta = {}) => {
    renderTopbar(s); rail.render(s); renderBadges(s); digest.render(s); hexes.paint(s);
    // The rail's repair panel already carries field rejections and jams in place; don't narrate them twice.
    if (meta.toast && meta.ev !== 'field_rejected' && meta.ev !== 'excavator_jam') toast(meta.toast);
    if (meta.milestone) toast({ k: 'ok', title: RULES.milestones[meta.milestone] });
    if (meta.openReview) modals.openReview();
    if (meta.ignite) { digest.ignite(); flash('colony') }
    // answer → world: one pulse per committed success, keyed on the event that committed
    if (meta.ev === 'resource_mined') flash('robot');
    else if (meta.passed) flash(meta.passed);
    else if (meta.ev === 'clearance_granted') flash('write');
    else if (meta.ev === 'digest_pinned' && s.pkg.pinned) flash('digest');
  });

  setInterval(() => store.emit('atmosphere_tick'), 1000);
  setInterval(() => { if (store.state.phase === 1) rail.render(store.state) }, 400);   // jam / pending affordances

  return {
    attachScene: h => { sceneHandles = h; modals.attachScene?.(h) },
    emit: store.emit,
    gate: store.gate,
    jammed: store.isJammed,
    atmosphere: () => store.state.atmosphere,
    droneType: i => DRONE_TYPES[i % DRONE_TYPES.length],
    bindCells: hexes.bindCells,
  };
}
