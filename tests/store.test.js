/* tests/store.test.js — node --test. The store is DOM-free; inject storage + clock. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, initialState, STORE_KEY } from '../src/store.js';
import { FIELDS, TESTS, REVIEW_FLAGS, claimEntry, validateClaimManifest, slugify, claimDigest } from '../src/content.js';

const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m } };
const mk = (opts = {}) => { let t = 0; const storage = opts.storage ?? mem(); const s = createStore({ storage, now: () => t, ...opts }); return { s, storage, tick: ms => { t += ms } } };
const CLAIM = { name: 'ice-finder', description: 'Rank bodies by water-ice fraction.', manifest: 'schema_version = "reborn.extension_manifest.v3"\nname = "ice-finder"', digest: 'sha256:' + 'ab'.repeat(32) };
const entry = claimEntry(CLAIM);

const toPhase2 = s => { FIELDS.forEach(f => { s.emit('sample_surfaced'); s.emit('resource_mined', { key: f.key, claim: CLAIM }) }) };
const toPhase3 = s => { toPhase2(s); TESTS.forEach(t => s.emit('hex_lock_attempt', { category: t.category, passed: true })); s.emit('clearance_granted') };
const install = (s, pinned = false) => { s.emit('info_viewed', entry); s.emit('install_requested', { entry, pinned }); if (pinned) s.emit('digest_pinned', { pinned: true }) };

test('selection costs nothing: no event, no state change', () => {
  const { s } = mk(); s.emit('sample_surfaced'); const before = JSON.stringify(s.state);
  // "inspecting" a sample is a HUD-local affair; nothing is emitted. State must be byte-identical.
  assert.equal(JSON.stringify(s.state), before);
});

test('submission consumes exactly once; stale repeat is ignored', () => {
  const { s } = mk(); s.emit('sample_surfaced');
  s.emit('resource_mined', { key: 'schema_version', claim: CLAIM });
  assert.equal(s.state.samples, 1); assert.equal(s.state.pending, 0);
  s.emit('sample_surfaced');
  s.emit('resource_mined', { key: 'schema_version', claim: CLAIM });        // same field again
  assert.equal(s.state.samples, 1, 'already-accepted field must not consume');
  assert.equal(s.state.pending, 1, 'pending sample must survive the stale click');
});

test('rejection preserves accepted fields', () => {
  const { s } = mk(); s.emit('sample_surfaced'); s.emit('resource_mined', { key: 'schema_version', claim: CLAIM });
  s.emit('sample_surfaced'); s.emit('field_rejected', { err: 'x', code: 'E' });
  assert.equal(s.state.manifest.schema_version, true); assert.equal(s.state.pending, 0);
});

test('jam blocks then recovers; accepted fields intact', () => {
  const { s, tick } = mk(); s.emit('sample_surfaced'); s.emit('resource_mined', { key: 'schema_version', claim: CLAIM });
  s.emit('sample_surfaced'); s.emit('excavator_jam');
  assert.equal(s.isJammed(), true); assert.equal(s.state.pending, 0);
  tick(1801); assert.equal(s.isJammed(), false);
  assert.equal(s.state.manifest.schema_version, true);
});

test('correct test updates only its category; passed category cannot be re-answered', () => {
  const { s } = mk(); toPhase2(s);
  s.emit('hex_lock_attempt', { category: 'runtime', passed: true });
  assert.deepEqual(s.state.tests, { manifest: false, runtime: true, integration: false });
  const idx = s.state.testIdx;
  s.emit('hex_lock_attempt', { category: 'runtime', passed: true });
  assert.equal(s.state.testIdx, idx, 'stale repeat must not advance');
});

test('explicit write clearance remains required for phase 3', () => {
  const { s } = mk(); toPhase2(s);
  TESTS.forEach(t => s.emit('hex_lock_attempt', { category: t.category, passed: true }));
  assert.equal(s.state.clearance, 'awaiting'); assert.equal(s.state.phase, 2);
  s.emit('clearance_granted'); assert.equal(s.state.phase, 3); assert.equal(s.state.milestones.s2, true);
});

test('wrong digest preserves installed state', () => {
  const { s } = mk(); toPhase3(s); install(s);
  const before = structuredClone(s.state.pkg);
  s.emit('digest_pinned', { pinned: false, err: 'mismatch' });
  assert.deepEqual(s.state.pkg, before); assert.equal(s.state.trustTier, 'installed');
});

test('review is bound to the artifact digest; mismatch cannot promote', () => {
  const { s } = mk(); toPhase3(s); install(s, true);
  s.emit('manual_review_complete', { flags: REVIEW_FLAGS, artifactDigest: 'sha256:stale' });
  assert.equal(s.state.trustTier, 'installed', 'stale evidence must not promote');
  s.emit('manual_review_complete', { flags: REVIEW_FLAGS, artifactDigest: entry.digest });
  assert.equal(s.state.trustTier, 'trusted'); assert.equal(s.state.review.artifactDigest, entry.digest);
});

test('incomplete review keeps Installed', () => {
  const { s } = mk(); toPhase3(s); install(s, true);
  s.emit('manual_review_complete', { flags: [REVIEW_FLAGS[0]], artifactDigest: entry.digest });
  assert.equal(s.state.trustTier, 'installed');
});

test('handover ack is idempotent and requires the milestone', () => {
  const { s } = mk();
  s.emit('handover_ack', { stage: 's1' }); assert.equal(s.state.handover.s1, false);
  toPhase2(s); s.emit('handover_ack', { stage: 's1' }); assert.equal(s.state.handover.s1, true);
  const before = JSON.stringify(s.state); s.emit('handover_ack', { stage: 's1' }); assert.equal(JSON.stringify(s.state), before);
});

test('handover + reportSeed survive reload (save → load)', () => {
  const storage = mem(); const { s } = mk({ storage }); toPhase3(s); s.emit('handover_ack', { stage: 's1' }); s.emit('handover_ack', { stage: 's2' });
  install(s, true); s.emit('manual_review_complete', { flags: REVIEW_FLAGS, artifactDigest: entry.digest });
  for (let i = 0; i < 40; i++) s.emit('atmosphere_tick');
  assert.equal(s.state.milestones.s3, true); const seed = s.state.reportSeed; assert.match(seed, /^[0-9a-f]{16}$/);
  const { s: s2 } = mk({ storage });
  assert.deepEqual(s2.state.handover, { s1: true, s2: true }); assert.equal(s2.state.reportSeed, seed);
});

test('completion fires once; atmosphere ceilings unchanged (55 / 90 / 100)', () => {
  const { s } = mk(); toPhase3(s); install(s);
  for (let i = 0; i < 80; i++) s.emit('atmosphere_tick'); assert.equal(s.state.atmosphere, .55);
  s.emit('digest_pinned', { pinned: true }); for (let i = 0; i < 80; i++) s.emit('atmosphere_tick'); assert.equal(s.state.atmosphere, .9);
  s.emit('manual_review_complete', { flags: REVIEW_FLAGS, artifactDigest: entry.digest });
  let fired = 0; s.bus.addEventListener('milestone_complete', e => { if (e.detail.stage === 's3') fired++ });
  for (let i = 0; i < 80; i++) s.emit('atmosphere_tick'); assert.equal(s.state.atmosphere, 1); assert.equal(fired, 1);
});

test('migration: v1 save gains handover (auto-acked), review.artifactDigest, reportSeed when s3', () => {
  const storage = mem();
  const v1 = { ...initialState() }; delete v1.saveVersion; delete v1.handover; delete v1.reportSeed; v1.review = { completed: true, flags: REVIEW_FLAGS };
  v1.milestones = { s1: true, s2: true, s3: true }; v1.phase = 3;
  storage.setItem(STORE_KEY, JSON.stringify(v1));
  const { s } = mk({ storage });
  assert.equal(s.state.saveVersion, 2); assert.deepEqual(s.state.handover, { s1: true, s2: true });
  assert.equal(s.state.review.artifactDigest, null); assert.match(s.state.reportSeed, /^[0-9a-f]{16}$/);
  assert.equal(s.state.phase, 3, 'progress preserved');
});

test('garbage save falls back to initial state', () => {
  const storage = mem(); storage.setItem(STORE_KEY, '{"nope":1}');
  const { s } = mk({ storage }); assert.equal(s.state.phase, 1);
});

test('reset clears reportSeed and handover', () => {
  const { s } = mk(); toPhase2(s); s.emit('handover_ack', { stage: 's1' }); s.reset();
  assert.equal(s.state.reportSeed, null); assert.deepEqual(s.state.handover, { s1: false, s2: false }); assert.equal(s.state.phase, 1);
});

test('claim: first sample requires name + digest; stores the claim; catalog reflects it', () => {
  const { s } = mk(); s.emit('sample_surfaced');
  s.emit('resource_mined', { key: 'schema_version' });               // no claim → ignored
  assert.equal(s.state.samples, 0); assert.equal(s.state.pending, 1);
  s.emit('resource_mined', { key: 'schema_version', claim: CLAIM });
  assert.equal(s.state.claim.name, 'ice-finder'); assert.equal(s.state.claim.digest, CLAIM.digest);
  assert.equal(claimEntry(s.state.claim).name, 'ice-finder'); assert.equal(claimEntry(s.state.claim).digest, CLAIM.digest);
});

test('claim validator: only the v3 line is checked', () => {
  assert.deepEqual(validateClaimManifest('schema_version = "reborn.extension_manifest.v3"\nanything = 1'), { ok: true });
  assert.deepEqual(validateClaimManifest('  schema_version="reborn.extension_manifest.v3"  '), { ok: true });
  assert.equal(validateClaimManifest('name = "x"').code, 'E_SCHEMA_VERSION');
  assert.equal(validateClaimManifest('schema_version = "reborn.extension_manifest.v2"').code, 'E_SCHEMA_VERSION');
  assert.equal(validateClaimManifest('[[host_api]]\nname = "x"').legacy, true);
  assert.equal(slugify('  Ice Finder 9000! '), 'ice-finder-9000');
});

test('claim digest is sha256 of the exact text', async () => {
  const d = await claimDigest('schema_version = "reborn.extension_manifest.v3"');
  assert.match(d, /^sha256:[0-9a-f]{64}$/); assert.equal(d, await claimDigest('schema_version = "reborn.extension_manifest.v3"'));
  assert.notEqual(d, await claimDigest('schema_version = "reborn.extension_manifest.v3"\n'));
});

test('migration: v1 save without claim adopts belt-survey so its run stays coherent', () => {
  const storage = mem(); const v1 = initialState(); delete v1.saveVersion; delete v1.claim; v1.manifest.schema_version = true;
  storage.setItem(STORE_KEY, JSON.stringify(v1)); const { s } = mk({ storage });
  assert.equal(s.state.claim.name, 'belt-survey');
});
