/* store.js — BELTER progress store. Single source of truth.
   Plain EventTarget bus, reducer-style handlers, localStorage persistence.
   No DOM, no engine imports: the HUD and the scene both consume this,
   and so can a TypeScript rewards package (see belter.d.ts). */

import { RULES, FIELDS, TESTS, REVIEW_FLAGS } from './content.js';

export const STORE_KEY = 'belter_progress_v1';

/** Events the scene (or any producer) may emit. Everything else is internal. */
export const EVENTS = Object.freeze({
  // from the animation loop
  SAMPLE_SURFACED: 'sample_surfaced',
  DRONE_SPAWNED: 'drone_spawned',
  // from the player via HUD
  RESOURCE_MINED: 'resource_mined',
  FIELD_REJECTED: 'field_rejected',
  EXCAVATOR_JAM: 'excavator_jam',
  HEX_LOCK_ATTEMPT: 'hex_lock_attempt',
  CLEARANCE_GRANTED: 'clearance_granted',
  SEARCH_DONE: 'search_done',
  INFO_VIEWED: 'info_viewed',
  INSTALL_REQUESTED: 'install_requested',
  DIGEST_PINNED: 'digest_pinned',
  HUMAN_OVERRIDE_ACK: 'human_override_ack',
  TRUST_PROMOTION_REQUESTED: 'trust_promotion_requested',
  MANUAL_REVIEW_COMPLETE: 'manual_review_complete',
  ATMOSPHERE_TICK: 'atmosphere_tick',
  CONSOLE_LOG: 'console_log',
  CONSOLE_CLEAR: 'console_clear',
  RESET: 'reset',
  // emitted by the store after a commit (subscribe to these from outside)
  MILESTONE_COMPLETE: 'milestone_complete',
  ATMOSPHERE_IGNITED: 'atmosphere_ignited',
  TRUST_PROMOTED: 'trust_promoted',
  STATE_CHANGED: 'state_changed',
});

export const initialState = () => ({
  saveVersion: 2,
  phase: 1,
  samples: 0, pending: 0, fieldIdx: 0,
  manifest: Object.fromEntries(FIELDS.map(f => [f.key, false])),
  claim: { name: null, description: null, manifest: null, digest: null },   // the player's own skill, filed in Phase 1
  legacyHits: 0,
  drones: [], testIdx: 0,
  tests: { manifest: false, runtime: false, integration: false },
  clearance: 'none',                 // none | awaiting | granted
  hub: { searched: false, inspected: false },
  pkg: { name: null, kind: null, provenance: null, version: null, digest: null, pinned: false, ack: false, installedAt: null },
  trustTier: 'none',                 // none | installed | trusted
  review: { completed: false, flags: [], artifactDigest: null },
  atmosphere: 0,
  milestones: { s1: false, s2: false, s3: false },
  handover: { s1: false, s2: false },
  reportSeed: null,
  log: [],
});

export const manifestCount = m => Object.values(m).filter(Boolean).length;
export const testCount = s => Object.values(s.tests).filter(Boolean).length + (s.clearance === 'granted' ? 1 : 0);

export function createStore({ storage = globalThis.localStorage, key = STORE_KEY, now = () => performance.now() } = {}) {
  const bus = new EventTarget();
  const emit = (type, detail = {}) => bus.dispatchEvent(new CustomEvent(type, { detail }));
  const listeners = new Set();
  let jamUntil = 0;
  let proofSubmitter = null;

  const migrate = (raw) => {
    if (!raw || !raw.phase) return null;
    const base = initialState(), r = structuredClone(raw), s = { ...base, ...r };
    for (const k of ['pkg', 'review', 'hub', 'milestones', 'tests', 'manifest', 'claim']) s[k] = { ...base[k], ...(r[k] || {}) };   // nested defaults survive
    // v1 saves had the fixed belt-survey; keep their run coherent by adopting it as their claim
    if (!s.claim.name && s.manifest.schema_version) s.claim = { name: 'belt-survey', description: 'Survey an asteroid belt sector and rank mining targets.', manifest: '', digest: 'sha256:9f3a7c1e4b2d8a6f0e5c3b9d7a1f4e8c2b6d0a9f3e7c5b1d8a4f6e2c0b9d7a3f' };
    s.saveVersion = 2;
    s.handover = { s1: !!raw.milestones?.s1, s2: !!raw.milestones?.s2 };
    if (!s.reportSeed && s.milestones.s3) s.reportSeed = seed();
    return s;
  };
  const seed = () => { const a = new Uint32Array(2); (globalThis.crypto?.getRandomValues?.(a)) || (a[0] = Math.random() * 2 ** 32, a[1] = Math.random() * 2 ** 32); return a[0].toString(16).padStart(8, '0') + a[1].toString(16).padStart(8, '0') };
  const load = () => { try { return migrate(JSON.parse(storage?.getItem(key))) } catch { return null } };
  const save = () => { try { storage?.setItem(key, JSON.stringify(state)) } catch { /* storage unavailable: keep in memory */ } };
  let state = load() ?? initialState();
  const commit = (next, meta) => { state = next; save(); listeners.forEach(fn => fn(state, meta)); emit(EVENTS.STATE_CHANGED, { meta }) };

  // ---- handlers: (draft, detail) => meta | null. null = no change. ----
  const handlers = {
    sample_surfaced(s) { if (s.phase !== 1 || s.pending >= 3) return null; s.pending++; return {} },
    excavator_jam(s) { jamUntil = now() + 1800; s.legacyHits++; if (s.pending) s.pending--; return { toast: { k: 'err', title: 'Excavator jammed on a v2 shape', body: RULES.text.legacy, code: 'E_LEGACY_SHAPE' } } },
    field_rejected(s, d) { if (s.pending) s.pending--; return { toast: { k: 'err', title: 'Field did not validate', body: d.err, code: d.code } } },
    resource_mined(s, d) {
      if (s.phase !== 1 || !s.pending || !(d.key in s.manifest) || s.manifest[d.key]) return null;
      if (d.key === 'schema_version') { if (!d.claim?.name || !d.claim?.digest) return null; s.claim = { name: d.claim.name, description: d.claim.description || '', manifest: d.claim.manifest || '', digest: d.claim.digest } }
      s.pending--; s.samples++; s.manifest[d.key] = true; s.fieldIdx = Math.min(FIELDS.length, s.fieldIdx + 1);
      const meta = {};
      if (manifestCount(s.manifest) === FIELDS.length && !s.milestones.s1) { s.milestones.s1 = true; s.phase = 2; meta.milestone = 's1' }
      return meta;
    },
    drone_spawned(s, d) { if (!s.drones.includes(d.type)) s.drones.push(d.type); return {} },
    hex_lock_attempt(s, d) {
      if (s.phase !== 2 || !(d.category in s.tests) || s.tests[d.category]) return null;
      if (!d.passed) return { toast: { k: 'err', title: `${d.category} test failed`, body: d.err, code: d.code } };
      s.tests[d.category] = true; s.testIdx++;
      if (Object.values(s.tests).every(Boolean) && s.clearance === 'none') s.clearance = 'awaiting';
      return { passed: d.category };
    },
    clearance_granted(s) {
      if (s.phase !== 2 || s.clearance !== 'awaiting') return null;
      s.clearance = 'granted'; const meta = {};
      if (!s.milestones.s2) { s.milestones.s2 = true; s.phase = 3; meta.milestone = 's2' }
      return meta;
    },
    handover_ack(s, d) {
      if (d.stage !== 's1' && d.stage !== 's2') return null;
      if (!s.milestones[d.stage] || s.handover[d.stage]) return null;
      s.handover[d.stage] = true;
      return {};
    },
    search_done(s) { s.hub.searched = true; return {} },
    info_viewed(s, d) { s.hub.inspected = true; if (s.trustTier === 'none') s.pkg = { ...s.pkg, name: d.name, kind: d.kind, provenance: d.provenance, version: d.version, digest: d.digest }; return {} },
    human_override_ack(s) { s.pkg.ack = true; return {} },
    install_requested(s, d) {
      if (s.phase !== 3) return null;
      const e = d.entry;
      s.pkg = { ...s.pkg, name: e.name, kind: e.kind, provenance: e.provenance, version: e.version, digest: e.digest, pinned: !!d.pinned, installedAt: e.kind === 'skill' ? RULES.paths.installed.replace('<name>', e.name) : 'active tool set' };
      if (s.trustTier === 'none') s.trustTier = 'installed';
      return { toast: d.pinned
        ? { k: 'ok', title: 'Installed and pinned', body: `${e.name} ${e.version} matches the expected version and artifact digest. Stable atmosphere.` }
        : { k: 'warn', title: 'Installed without a pin', body: 'The version in the current manifest was installed. Thin atmosphere. Pin with --expected-version and --expected-artifact-digest.' } };
    },
    digest_pinned(s, d) { if (s.phase !== 3) return null; if (d.pinned) { s.pkg.pinned = true; return {} } return { toast: { k: 'err', title: 'Pin refused', body: d.err, code: 'E_DIGEST_MISMATCH' } } },
    trust_promotion_requested(s) { if (s.trustTier !== 'installed') return null; return { openReview: true } },
    manual_review_complete(s, d) {
      if (s.trustTier !== 'installed') return null;
      if (s.pkg.digest && d.artifactDigest !== s.pkg.digest) return null;
      s.review = { completed: true, flags: d.flags, artifactDigest: d.artifactDigest ?? s.pkg.digest };
      if (d.flags.length >= REVIEW_FLAGS.length) { s.trustTier = 'trusted'; s.pkg.installedAt = RULES.paths.trusted + s.pkg.name + '/'; return { toast: { k: 'ok', title: 'Promoted to Trusted', body: 'Full prompt body loaded. The agent can activate it autonomously.' }, promoted: true } }
      return {};
    },
    atmosphere_tick(s) {
      if (s.phase !== 3 || s.trustTier === 'none') return null;
      const cap = !s.pkg.pinned ? RULES.o2.thinCap : s.trustTier === 'trusted' ? RULES.o2.full : RULES.o2.pinnedCap;
      const rate = s.pkg.pinned ? RULES.o2.pinnedRate : RULES.o2.thinRate;
      const next = Math.min(cap, s.atmosphere + rate);
      if (next === s.atmosphere) return null;
      s.atmosphere = next; const meta = {};
      if (next >= RULES.o2.full && !s.milestones.s3) { s.milestones.s3 = true; meta.milestone = 's3'; meta.ignite = true; if (!s.reportSeed) s.reportSeed = seed() }
      return meta;
    },
    console_log(s, d) { s.log.push({ text: d.text, cls: d.cls }); if (s.log.length > 60) s.log.shift(); return { quiet: true } },
    console_clear(s) { s.log = []; return { quiet: true } },
    reset() { jamUntil = 0; return { reset: true } },
  };

  Object.keys(handlers).forEach(ev => bus.addEventListener(ev, e => {
    const next = ev === 'reset' ? initialState() : structuredClone(state);
    const meta = handlers[ev](next, e.detail || {});
    if (!meta) return;
    commit(next, { ev, ...meta });
    if (meta.milestone) emit(EVENTS.MILESTONE_COMPLETE, { stage: meta.milestone, state: next });
    if (meta.ignite) emit(EVENTS.ATMOSPHERE_IGNITED, {});
    if (meta.promoted) emit(EVENTS.TRUST_PROMOTED, { skill: next.pkg.name });
  }));

  /** Content hash of the milestone-relevant state. A rewards package can
      replace the submitter with setProofSubmitter(); until then it is a stub. */
  async function submitProof(stage) {
    const payload = JSON.stringify({ stage, milestones: state.milestones, pkg: state.pkg, trustTier: state.trustTier });
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
    const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    const proof = { stage, reached: !!state.milestones[stage], proof: 'sha256:' + hex, submitted: false };
    return proofSubmitter ? proofSubmitter(proof, structuredClone(state)) : { ...proof, note: 'stub: no proof submitter registered' };
  }

  return {
    bus, emit, EVENTS,
    get state() { return state },
    subscribe(fn) { listeners.add(fn); fn(state, {}); return () => listeners.delete(fn) },
    isJammed: () => now() < jamUntil,
    gate: n => !!state.milestones['s' + n],
    submitProof,
    setProofSubmitter(fn) { proofSubmitter = typeof fn === 'function' ? fn : null },
    reset: () => emit(EVENTS.RESET),
    rules: RULES,
  };
}
