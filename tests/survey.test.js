/* tests/survey.test.js — pure survey modules: facts, designation, labels. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { surveyFacts, designation, closingLine, candidateLabels, rng } from '../src/survey/facts.js';
import { placeLabels } from '../src/survey/labels.js';
import { initialState } from '../src/store.js';
import { claimEntry, REVIEW_FLAGS } from '../src/content.js';
const CL = { name: 'ice-finder', description: 'x', manifest: '', digest: 'sha256:' + 'cd'.repeat(32) }, E = claimEntry(CL);

const complete = () => { const s = initialState(); Object.keys(s.manifest).forEach(k => s.manifest[k] = true); Object.keys(s.tests).forEach(k => s.tests[k] = true);
  s.clearance = 'granted'; s.phase = 3; s.trustTier = 'trusted'; s.atmosphere = 1; s.milestones = { s1: true, s2: true, s3: true }; s.reportSeed = 'deadbeef01234567';
  s.claim = { ...CL }; s.pkg = { ...E, pinned: true, ack: true, installedAt: '~/.ironclaw/skills/ice-finder/' }; s.review = { completed: true, flags: REVIEW_FLAGS, artifactDigest: E.digest }; return s };

test('facts are null until the store says complete', () => {
  assert.equal(surveyFacts(initialState()), null);
  const s = complete(); s.milestones.s3 = false; assert.equal(surveyFacts(s), null);
  const s2 = complete(); s2.reportSeed = null; assert.equal(surveyFacts(s2), null);
});

test('facts match the completed state exactly', () => {
  const s = complete(); const f = surveyFacts(s);
  assert.equal(f.pkg.digest, E.digest); assert.equal(f.pkg.name, 'ice-finder'); assert.equal(f.pkg.pinned, true); assert.equal(f.trustTier, 'trusted');
  assert.equal(f.o2, 100); assert.equal(f.clearance, 'granted'); assert.equal(f.review.flags, 3); assert.equal(f.manifest.complete, true);
  assert.match(f.interior, /not simulated/);
});

test('same seed → same designation, closing line and label set; different seed differs', () => {
  const a = surveyFacts(complete()), b = surveyFacts(complete());
  assert.equal(a.designation, b.designation); assert.equal(closingLine(a), closingLine(b));
  assert.deepEqual(candidateLabels(a), candidateLabels(b));
  const s = complete(); s.reportSeed = '0123456789abcdef'; assert.notEqual(designation(s.reportSeed), a.designation);
});

test('identity does not derive from the artifact digest alone', () => {
  const s1 = complete(), s2 = complete(); s2.reportSeed = 'ffffffff00000000';
  assert.equal(s1.pkg.digest, s2.pkg.digest); assert.notEqual(surveyFacts(s1).designation, surveyFacts(s2).designation);
});

test('rng is deterministic', () => { const a = rng('abc'), b = rng('abc'); for (let i = 0; i < 5; i++) assert.equal(a(), b()) });

test('labels: deterministic, no overlapping slots per side, hidden targets dropped', () => {
  const plate = { w: 1600, h: 1100, margin: 96, lineH: 22, charW: 9 };
  const cands = [
    { id: 'a', text: 'A', priority: 5, x: 500, y: 400, visible: true },
    { id: 'b', text: 'B', priority: 4, x: 520, y: 405, visible: true },
    { id: 'c', text: 'C', priority: 3, x: 1100, y: 600, visible: true },
    { id: 'd', text: 'D', priority: 1, x: 1100, y: 600, visible: false },
  ];
  const p1 = placeLabels(cands, plate), p2 = placeLabels(cands, plate);
  assert.deepEqual(p1, p2);
  assert.equal(p1.find(l => l.id === 'd'), undefined);
  for (const side of ['L', 'R']) { const ys = p1.filter(l => l.side === side).map(l => l.ly); for (let i = 1; i < ys.length; i++) assert.ok(Math.abs(ys[i] - ys[i - 1]) >= plate.lineH * 1.4) }
});

test('labels: crowding drops lowest priority, never highest', () => {
  const plate = { w: 400, h: 160, margin: 20, lineH: 22, charW: 9 };   // room for ~3 slots per side
  const cands = Array.from({ length: 8 }, (_, i) => ({ id: 'l' + i, text: 'x', priority: i, x: 50, y: 80, visible: true }));
  const placed = placeLabels(cands, plate);
  assert.ok(placed.some(l => l.id === 'l7')); assert.ok(!placed.some(l => l.id === 'l0'));
});
