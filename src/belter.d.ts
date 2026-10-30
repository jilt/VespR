/* belter.d.ts — types for the BELTER progress layer.
   Consume from a TypeScript rewards package either via `window.__BELTER_PROGRESS`
   or by importing `createStore` from './store.js'. */

export type Stage = 's1' | 's2' | 's3';
export type TrustTier = 'none' | 'installed' | 'trusted';
export type Clearance = 'none' | 'awaiting' | 'granted';
export type DroneType = 'envoy' | 'guard' | 'scribe';
export type TestCategory = 'manifest' | 'runtime' | 'integration';
export type ManifestField = 'schema_version' | 'tools_entry' | 'refs' | 'auth_recipe' | 'additional_props';

export interface PackageState {
  name: string | null;
  kind: 'tool' | 'skill' | null;
  provenance: string | null;          // 'New' is the documented community label
  version: string | null;
  digest: string | null;              // 'sha256:<64 hex>'
  pinned: boolean;
  ack: boolean;                       // --acknowledge-unverified was passed
  installedAt: string | null;
}

export interface ProgressState {
  saveVersion: 2;                     // v1 saves (no field) are migrated on load
  phase: 1 | 2 | 3;
  samples: number; pending: number; fieldIdx: number;
  manifest: Record<ManifestField, boolean>;
  /** The player's own skill, filed as the first core sample. digest = sha256 of the typed manifest header. */
  claim: { name: string | null; description: string | null; manifest: string | null; digest: string | null };
  legacyHits: number;
  drones: DroneType[]; testIdx: number;
  tests: Record<TestCategory, boolean>;
  clearance: Clearance;
  hub: { searched: boolean; inspected: boolean };
  pkg: PackageState;
  trustTier: TrustTier;
  review: { completed: boolean; flags: string[]; artifactDigest: string | null };   // bound to the digest reviewed
  atmosphere: number;                 // 0..1
  milestones: Record<Stage, boolean>;
  handover: { s1: boolean; s2: boolean };   // player acknowledged the phase handover (presentation ack, not progress)
  reportSeed: string | null;          // 16 hex, minted once at s3; drives survey presentation only
  log: { text: string; cls: string }[];
}

/** Event name → detail payload. */
export interface BelterEventMap {
  sample_surfaced: {};
  drone_spawned: { index: number; type: DroneType };
  resource_mined: { key: ManifestField; value: string; claim?: { name: string; description: string; manifest: string; digest: string } };   // claim required when key = schema_version
  field_rejected: { err: string; code: string };
  excavator_jam: {};
  hex_lock_attempt: { category: TestCategory; passed: boolean; err?: string; code?: string };
  clearance_granted: {};
  search_done: {};
  info_viewed: { name: string; kind: 'tool' | 'skill'; provenance: string; version: string; digest: string };
  install_requested: { entry: { name: string; kind: 'tool' | 'skill'; provenance: string; version: string; digest: string }; pinned: boolean };
  digest_pinned: { pinned: boolean; err?: string };
  human_override_ack: {};
  trust_promotion_requested: { skill: string | null };
  manual_review_complete: { flags: string[]; skill: string | null; artifactDigest: string | null };   // ignored if digest ≠ pkg.digest
  handover_ack: { stage: 's1' | 's2' };
  atmosphere_tick: {};
  console_log: { text: string; cls: string };
  console_clear: {};
  reset: {};
  // emitted by the store after a commit
  milestone_complete: { stage: Stage; state: ProgressState };
  atmosphere_ignited: {};
  trust_promoted: { skill: string | null };
  state_changed: { meta: CommitMeta };
}

export interface CommitMeta {
  ev?: keyof BelterEventMap;
  milestone?: Stage;
  ignite?: boolean;
  promoted?: boolean;
  openReview?: boolean;
  passed?: TestCategory;              // hex_lock_attempt success: which band sealed
  toast?: { k: 'ok' | 'warn' | 'err'; title: string; body?: string; code?: string };
  quiet?: boolean;
  reset?: boolean;
}

export interface Proof {
  stage: Stage;
  reached: boolean;
  proof: string;                      // 'sha256:<hex>' content hash of milestone state
  submitted: boolean;
  note?: string;
  [extra: string]: unknown;           // a submitter may add txid, signature, etc.
}

/** A rewards package implements this and registers it with setProofSubmitter. */
export type ProofSubmitter = (proof: Proof, state: ProgressState) => Proof | Promise<Proof>;

export interface BelterBus extends EventTarget {
  addEventListener<K extends keyof BelterEventMap>(type: K, listener: (e: CustomEvent<BelterEventMap[K]>) => void, options?: boolean | AddEventListenerOptions): void;
  removeEventListener<K extends keyof BelterEventMap>(type: K, listener: (e: CustomEvent<BelterEventMap[K]>) => void, options?: boolean | EventListenerOptions): void;
}

export interface BelterStore {
  readonly state: ProgressState;
  bus: BelterBus;
  EVENTS: Readonly<Record<string, keyof BelterEventMap>>;
  emit<K extends keyof BelterEventMap>(type: K, detail?: BelterEventMap[K]): void;
  subscribe(fn: (state: ProgressState, meta: CommitMeta) => void): () => void;
  isJammed(): boolean;
  gate(n: 1 | 2 | 3): boolean;
  submitProof(stage: Stage): Promise<Proof>;
  setProofSubmitter(fn: ProofSubmitter | null): void;
  reset(): void;
  rules: Record<string, unknown>;
}

export type BelterPublic = Pick<BelterStore, 'state' | 'bus' | 'EVENTS' | 'emit' | 'subscribe' | 'submitProof' | 'setProofSubmitter' | 'reset' | 'rules'>;

export function createStore(opts?: { storage?: Storage; key?: string; now?: () => number }): BelterStore;

declare global {
  interface Window { __BELTER_PROGRESS: BelterPublic }
}
