/* survey/facts.js — pure: completed ProgressState → the factual record printed on
   the commissioning survey. No DOM, no Three.js. Every value here is read from
   state; nothing is measured or invented. */
import { FIELDS, TESTS, REVIEW_FLAGS } from '../content.js';

/** Seeded PRNG (mulberry32) over the persisted reportSeed. Presentation only. */
export function rng(seedHex) {
  let a = parseInt(String(seedHex).slice(0, 8), 16) >>> 0 || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}

/** Fictional survey designation, derived only from reportSeed. Same seed → same string. */
export function designation(seedHex) {
  const r = rng(seedHex);
  const sector = 'KLMNPRSTVX'[Math.floor(r() * 10)] + '-' + String(10 + Math.floor(r() * 90));
  const plate = String(100 + Math.floor(r() * 900));
  return `Survey plate ${sector} / ${plate}`;
}

/** The record. Returns null if the run is not complete (store milestones are the authority). */
export function surveyFacts(s) {
  if (!s?.milestones?.s3 || !s.reportSeed) return null;
  const manifestOk = FIELDS.every(f => s.manifest[f.key]);
  const testsOk = TESTS.every(t => s.tests[t.category]);
  return {
    seed: s.reportSeed,
    designation: designation(s.reportSeed),
    manifest: { complete: manifestOk, fields: FIELDS.map(f => ({ key: f.key, ok: !!s.manifest[f.key] })) },
    tests: { complete: testsOk, categories: TESTS.map(t => ({ category: t.category, drone: t.drone, ok: !!s.tests[t.category] })) },
    clearance: s.clearance,
    pkg: { name: s.pkg.name, kind: s.pkg.kind, version: s.pkg.version, provenance: s.pkg.provenance, digest: s.pkg.digest, pinned: !!s.pkg.pinned, installedAt: s.pkg.installedAt },
    trustTier: s.trustTier,
    review: { completed: !!s.review.completed, flags: s.review.flags.length, of: REVIEW_FLAGS.length, artifactDigest: s.review.artifactDigest },
    o2: Math.round(s.atmosphere * 100),
    legacyHits: s.legacyHits,
    interior: 'Exterior survey — interior geometry not simulated.',
  };
}

/** Closing copy chosen by seed from a fact-true set (every line is true for any completed run). */
export function closingLine(facts) {
  const lines = [
    `Artifact ${facts.pkg.digest.slice(0, 19)}… pinned and reviewed. Atmosphere ${facts.o2} %.`,
    `${facts.pkg.name} ${facts.pkg.version}, provenance ${facts.pkg.provenance}, promoted to ${facts.trustTier} after ${facts.review.flags}/${facts.review.of} checks.`,
    `Manifest ${facts.manifest.fields.length}/${facts.manifest.fields.length}, tests ${facts.tests.categories.length}/${facts.tests.categories.length}, write clearance ${facts.clearance}.`,
  ];
  return lines[Math.floor(rng(facts.seed + 'c')() * lines.length)];
}

/** Candidate labels, filtered to eligible facts. Priority: lower is dropped first when crowded. */
export function candidateLabels(facts) {
  const L = [];
  L.push({ id: 'worksite', anchor: 'worksite', text: 'Extraction worksite', priority: 5 });
  if (facts.manifest.complete) L.push({ id: 'manifest', anchor: 'manifest', text: 'Manifest contract verified', priority: 4 });
  if (facts.tests.categories.find(c => c.category === 'runtime')?.ok) L.push({ id: 'runtime', anchor: 'runtime', text: 'Host-mediated egress verified', priority: 3 });
  if (facts.tests.categories.find(c => c.category === 'integration')?.ok) L.push({ id: 'integration', anchor: 'integration', text: 'Integration checks complete', priority: 2 });
  if (facts.clearance === 'granted') L.push({ id: 'write', anchor: 'write', text: 'External write authorized', priority: 3 });
  if (facts.o2 >= 100) L.push({ id: 'vegetation', anchor: 'vegetation', text: 'Atmosphere stabilized', priority: 5 });
  return L;
}
