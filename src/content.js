/* content.js — every educational rule string and all teaching content.
   Strings under RULES.text / RULES.gatePolicy are quoted from docs.ironclaw.com
   (extensions/building-a-tool, hub/installing). Pure data: no DOM, no engine. */

export const RULES = {
  schemaVersion: 'reborn.extension_manifest.v3',
  loopRunPolicy: 'gated_unless_granted',
  legacyShapes: ['[[host_api]]', '[capability_provider.tools]', '[[capabilities]]'],
  gateMatrix: { loop_run: 'gated_unless_granted', product: 'forbidden', automation: 'forbidden' },
  gatePolicy: {
    forbidden: 'the origin may not invoke the capability at all. This is the default for every omitted origin, so a tool without a matrix cannot be invoked from any origin.',
    ask_always: 'every invocation gates; persistent grants are never honored.',
    gated_unless_granted: 'gates unless a scoped persistent/policy grant covers it. The normal choice for provider tools invoked by the model.',
    consent_sufficient: "the origin's own gesture is the consent evidence (product only; never valid for loop_run or automation).",
    ungated: 'no approval gate. For loop_run this requires a reviewed allowlist entry (UNGATED_LOOP_RUN_CAPABILITIES); additions are a security review, not a manifest edit.',
  },
  text: {
    legacy: 'The registry still parses already-installed v2 manifests for compatibility, but authoring is v3-only.',
    schemaVersion: 'A Reborn tool extension is complete only when the extension package has a schema_version = "reborn.extension_manifest.v3" manifest.',
    omittedOrigin: 'forbidden is the default for every omitted origin, so a tool without a matrix cannot be invoked from any origin.',
    loopRunRequired: 'The same capability can have different permissions depending on how it is invoked: The model during an agent run, A direct user gesture in ironclaw UI,  trigger, schedule, or background job. You are required to declare the loop_run policy. The common shape is { loop_run = "gated_unless_granted", product = "forbidden", automation = "forbidden" }.',
    ungatedLoop: 'To use ungated for loop_run, the capability must be on the reviewed allowlist (UNGATED_LOOP_RUN_CAPABILITIES). Adding it requires a security review, not just a manifest change.',
    refsRelative: 'Schema and prompt references must point to files inside the package. Use relative paths, such as schemas/input.json. Absolute paths, URLs, backslashes, and paths containing ".." are not allowed.',
    vendorRecipe: 'Every credential vendor needs a matching [auth.<vendor>] section in manifest.toml. This section tells IronClaw how to set up authentication with that provider. Every auth recipe must also be referenced by a credential. Missing or unused recipes are rejected. Guide: https://docs.ironclaw.com/extensions/building-a-tool#product-auth-and-oauth',    
    additionalProps: 'The input schema defines the JSON arguments the agent can pass to your tool, not the user’s prompt or necessarily the body sent to an external API. Set additionalProperties: false to reject arguments you have not declared. Allow extra fields only when the upstream provider genuinely requires arbitrary JSON.',
    unknownManifestFields: 'Unknown fields are rejected throughout the manifest.',
    useSecret: 'If a tool uses credentials, include use_secret in its effects. Credential declarations without this effect are rejected.',
    audience: 'Each credential audience must use HTTPS and name a specific host. Wildcard hosts are not allowed in v3.',
    hostHttp: 'Send HTTP requests through the host import, near::agent::host::http_request. Do not add a direct HTTP client, such as reqwest, inside the WASM tool. The host needs to control outbound requests, inject staged credentials, and sanitize failures.',
    opFromContext: 'Prefer operation selection from req.context.capability_id. Do not let a model-supplied argument silently choose a different action from the capability being invoked.',
    unknownFields: 'Reject unknown fields when deserializing tool input. Validation must happen before any outbound request is sent.',
    sanitized: 'Return consistent error codes and safe messages. Never expose credentials, raw host errors, sensitive provider response bodies, or unfiltered backend messages.',
    helperOnly: 'Test the actual tool execution path, not just its permission helper. When an action is blocked, verify that no HTTP request, database write, or other side effect occurs. A helper can pass its own tests while the real tool skips the check or runs it too late.',    
    askDefault: 'Normally, set default_permission = "ask" for tools that write to external systems, perform financial actions, write or delete local data, run processes, or change approvals, extensions, or budgets.',
    approvals: 'Let IronClaw’s capability and approval services decide whether an action may run. If execution is blocked, return a normal runtime error. Extension code must not ask for approval itself, issue its own permissions, or resume the agent run directly.',
    communityNew: 'A community entry is a tool or skill contributed to IronHub and marked with provenance New. Installing it requires the operator to explicitly accept its unverified status using --acknowledge-unverified. The agent cannot provide this acknowledgement on its own.',
    chatCannot: 'Saying "yes" in chat does not authorize a community installation. The model-facing install path cannot set the required acknowledgement, so the operator must use --acknowledge-unverified through the CLI.',
    infoPrints: 'Shows the entry’s provenance, version, and SHA-256 artifact digest. Use the version and digest to specify exactly what you expect to install. The digest is the SHA-256 of the entire extension package, not just the manifest.',
    pin: 'By default IronClaw installs the version in the current manifest. To require a specific version or digest: --expected-version "1.2.3" or --expected-artifact-digest "sha256:abc123...".',
    installedTrust: 'Skills installed from IronHub start at the Installed trust level. The model can see their descriptions, but their full prompt bodies are not loaded and the agent cannot activate them on its own.',
    trustedTrust: 'Skills you place directly in your skills directory have Trusted trust — the full prompt body is loaded and the agent can activate them autonomously.',
    moveAfterReview: 'If you fully trust an IronHub skill, move it to ~/.ironclaw/skills/ after reviewing its contents.',
    sameRights: 'Never move a skill you haven\'t reviewed into the trusted directory. A skill in ~/.ironclaw/skills/ has the same execution power as you do.',
  },
  paths: { installed: '~/.ironclaw/installed_skills/<name>/', trusted: '~/.ironclaw/skills/' },
  // atmosphere caps: thin until pinned, incomplete until trusted
  o2: { thinCap: .55, pinnedCap: .9, full: 1, thinRate: .012, pinnedRate: .035 },
  milestones: {
    s1: 'Package valid. Hex assembly unlocked.',
    s2: 'All tests pass. Publish unlocked.',
    s3: 'Atmosphere stable. Colony established.',
  },
};

// ---- 2. Teaching content ------------------------------------------
export const DRONE_TYPES = ['envoy', 'guard', 'scribe', 'envoy', 'guard'];
export const DRONE_RULES = {
  envoy: { label: 'envoy drone, host egress', rule: RULES.text.hostHttp },
  guard: { label: 'guard drone, credentials', rule: RULES.text.useSecret + ' ' + RULES.text.audience },
  scribe: { label: 'scribe drone, structured errors', rule: RULES.text.sanitized },
};

// ---- The claim: every operator files their OWN skill. Name, purpose and the
//      manifest header are typed by the player; the only gate on the header is
//      the v3 schema_version line. The sha256 of what they typed becomes the
//      artifact digest that the rest of the game pins and reviews.
export const CLAIM = {
  story: `Every mechanical prospector files a claim before building a colony: an IronHub name, a one-line purpose, and a manifest header starting with the v3 contract line.

First, define the tool, its permissions, input and output schemas, and accepted JSON arguments. Then write the skill, a Markdown guide telling the agent when and how to use the tool: call the tool with a sector ID { "sector": "K-7" }, and present the result.

The tool acts. The skill guides.`,
  rule: 'schema_version = "reborn.extension_manifest.v3"',
  placeholder: {
    name: 'ice-finder',
    description: 'Rank bodies in a sector by water-ice fraction.',
    manifest: 'schema_version = "reborn.extension_manifest.v3"\nname = "ice-finder"\nversion = "0.1.0"\ndescription = "Rank bodies in a sector by water-ice fraction."',
  },
};

/** Lower-case, digits, hyphens; 3–32 chars. Normalises rather than refuses. */
export const slugify = s => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);

/** The single validation for the claim header. Returns { ok } or { code, err } or { legacy }. */
export function validateClaimManifest(text) {
  const t = String(text || '');
  if (RULES.legacyShapes.some(sh => t.includes(sh))) return { legacy: true };
  if (/schema_version\s*=\s*"reborn\.extension_manifest\.v2"/.test(t)) return { code: 'E_SCHEMA_VERSION', err: 'v2 is parsed only for already-installed manifests. Authoring is v3-only. Open the header with ' + CLAIM.rule + '.' };
  if (!/^\s*schema_version\s*=\s*"reborn\.extension_manifest\.v3"\s*$/m.test(t)) return { code: 'E_SCHEMA_VERSION', err: 'The header has no v3 contract line. ' + RULES.text.schemaVersion + ' Add exactly: ' + CLAIM.rule };
  return { ok: true };
}

/** sha256 of the claim text as 'sha256:<64 hex>'. Works in browsers and node ≥ 19. */
export async function claimDigest(text) {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return 'sha256:' + [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Phase 1: each core sample attaches one manifest field. The first is the typed claim; the rest are TOML fragments.
export const FIELDS = [
  { key: 'schema_version', item: 'manifest.toml header with schema_version = "reborn.extension_manifest.v3"', input: true,
    q: 'File your claim: name, purpose, manifest header.', hint: RULES.text.schemaVersion },
  { key: 'tools_entry', item: 'one [[tools]] entry with origin_gate_matrix',
    q: 'The model will call belt.survey during agent runs. Which [[tools]] header is valid?', hint: RULES.text.loopRunRequired + ' ' + RULES.text.omittedOrigin,
    opts: [
      { t: '[[tools]]\norigin_gate_matrix = { loop_run = "gated_unless_granted", product = "forbidden", automation = "forbidden" }\nid = "belt.survey"', ok: true },
      { t: '[[tools]]\norigin_gate_matrix = { product = "forbidden" }\nid = "belt.survey"', code: 'E_LOOP_RUN_OMITTED', err: 'loop_run is omitted. ' + RULES.text.omittedOrigin + ' Declare loop_run = "gated_unless_granted".' },
      { t: '[[tools]]\norigin_gate_matrix = { loop_run = "ungated" }\nid = "belt.survey"', code: 'E_UNGATED_LOOP_RUN', err: RULES.text.ungatedLoop + ' Use "gated_unless_granted".' },
      { t: '[capability_provider.tools]\nsurvey = { id = "belt.survey" }', legacy: true },
    ] },
  { key: 'refs', item: 'input_schema_ref, output_schema_ref, prompt_doc_ref',
    q: 'Point the tool at its schema and prompt assets.', hint: RULES.text.refsRelative,
    opts: [
      { t: 'input_schema_ref = "schemas/belt/survey.input.v1.json"\noutput_schema_ref = "schemas/belt/survey.output.v1.json"\nprompt_doc_ref = "prompts/belt/survey.md"', ok: true },
      { t: 'input_schema_ref = "/system/extensions/belt/schemas/survey.input.v1.json"\noutput_schema_ref = "/system/extensions/belt/schemas/survey.output.v1.json"\nprompt_doc_ref = "/system/extensions/belt/prompts/survey.md"', code: 'E_REF_ABSOLUTE', err: 'Absolute paths are rejected. ' + RULES.text.refsRelative },
      { t: 'input_schema_ref = "../shared/survey.input.v1.json"\noutput_schema_ref = "../shared/survey.output.v1.json"\nprompt_doc_ref = "../shared/survey.md"', code: 'E_REF_TRAVERSAL', err: 'Paths with ".." are rejected. ' + RULES.text.refsRelative },
    ] },
  { key: 'auth_recipe', item: 'every credential vendor has a matching [auth.<vendor>] recipe',
    q: 'belt.survey sends a bearer token to api.belt.example. Which credential and recipe pair validates?', hint: RULES.text.vendorRecipe,
    opts: [
      { t: '[[tools.credentials]]\nhandle = "belt_runtime_token"\nvendor = "belt"\naudience = { scheme = "https", host = "api.belt.example" }\n\n[auth.belt]\nmethod = "api_key"\ndisplay_name = "Belt account"', ok: true },
      { t: '[[tools.credentials]]\nhandle = "belt_runtime_token"\nvendor = "belt"\naudience = { scheme = "https", host = "api.belt.example" }\n\n[auth.ore]\nmethod = "api_key"\ndisplay_name = "Ore account"', code: 'E_VENDOR_RECIPE', err: 'vendor = "belt" has no [auth.belt] recipe, and [auth.ore] is referenced by nothing. ' + RULES.text.vendorRecipe },
      { t: '[[tools.credentials]]\nhandle = "belt_runtime_token"\nvendor = "belt"\naudience = { scheme = "https", host = "api.belt.example" }', code: 'E_VENDOR_RECIPE', err: 'No [auth.belt] recipe. ' + RULES.text.vendorRecipe },
    ] },
  { key: 'additional_props', item: 'schemas use additionalProperties: false',
    q: 'Last sample: the input schema root. Which object definition do you ship?', hint: RULES.text.additionalProps,
    opts: [
      { t: '{ "type": "object",\n  "required": ["sector"],\n  "properties": { "sector": { "type": "string" } },\n  "additionalProperties": false }', ok: true },
      { t: '{ "type": "object",\n  "required": ["sector"],\n  "properties": { "sector": { "type": "string" } },\n  "additionalProperties": true }', code: 'E_ADDITIONAL_PROPS', err: 'additionalProperties: true accepts input the runtime never checked. ' + RULES.text.additionalProps },
      { t: '{ "type": "object",\n  "properties": { "sector": { "type": "string" } } }', code: 'E_ADDITIONAL_PROPS', err: 'additionalProperties defaults to true when omitted. ' + RULES.text.additionalProps },
    ] },
];

// Phase 2: each hex category solidifies when its test passes.
export const TESTS = [
  { category: 'manifest', drone: 'guard', item: 'manifest contract test',
    q: 'The guard drone runs manifest_v3_contract. Which credential declaration passes?', hint: RULES.text.useSecret + ' ' + RULES.text.audience,
    opts: [
      { t: 'effects = ["network", "use_secret"]\naudience = { scheme = "https", host = "api.belt.example" }', ok: true },
      { t: 'effects = ["network"]\naudience = { scheme = "https", host = "api.belt.example" }', code: 'T_USE_SECRET', err: 'The tool declares a credential but no use_secret effect. ' + RULES.text.useSecret },
      { t: 'effects = ["network", "use_secret"]\naudience = { scheme = "https", host = "*.belt.example" }', code: 'T_AUDIENCE_WILDCARD', err: RULES.text.audience },
    ] },
  { category: 'runtime', drone: 'envoy', item: 'runtime behavior test (operation ID from capability context, unknown-field rejection)',
    q: 'The envoy drone runs the WASM behavior tests. Which execute() shape passes?', hint: RULES.text.opFromContext + ' ' + RULES.text.unknownFields + ' ' + RULES.text.hostHttp,
    opts: [
      { t: 'operation from req.context.capability_id\nserde deny_unknown_fields on input\nnear::agent::host::http_request for provider calls', ok: true },
      { t: 'operation from params.action chosen by the model\nserde deny_unknown_fields on input\nnear::agent::host::http_request for provider calls', code: 'T_OPERATION_SOURCE', err: 'operation_comes_from_host_context_not_param_shape failed. ' + RULES.text.opFromContext },
      { t: 'operation from req.context.capability_id\nunknown fields ignored\nreqwest::Client inside the WASM module', code: 'T_AMBIENT_HTTP', err: 'serde_rejects_unknown_fields_before_egress failed, and the module opens its own HTTP client. ' + RULES.text.hostHttp },
    ] },
  { category: 'integration', drone: 'scribe', item: 'integration test through the host capability lifecycle',
  q: 'The scribe drone checks caller-facing behavior. Which test counts?',
  hint: RULES.text.helperOnly,
  opts: [
    { t: 'dispatch belt.survey through CapabilityHost\nassert a stable sanitized error code when egress fails', ok: true },
    { t: 'call the request helper directly\nassert the provider response body is returned verbatim', code: 'T_HELPER_ONLY', err: 'Helper-only, and it leaks the provider body. ' + RULES.text.helperOnly },
    { t: 'dispatch through CapabilityHost\nassert the raw host egress error text reaches the model', code: 'T_UNSANITIZED', err: 'sanitizes_host_egress_errors_without_leaking_details failed. ' + RULES.text.sanitized },
  ] },
];

export const WRITE_TOOL = { id: 'belt.survey_write', effects: '["network", "use_secret", "external_write"]', default_permission: 'ask' };

// Phase 3: simulated IronHub catalog. The first entry is the PLAYER'S claim —
// its name, description and digest come from what they typed in Phase 1.
// Provenance "New" is the documented community label. Before a claim exists the
// placeholder is used so nothing hardcodes a name.
export const CATALOG_FIXED = [
  { name: 'github', kind: 'tool', provenance: 'Bundled', version: '1.4.2', digest: 'sha256:1c7e5a93f02b6d48e1a9c3f75b2d8e064a9f1c3e7b5d2a8f6e0c4b9d3a7f1e5c', description: 'GitHub repositories, issues and pull requests through host egress.' },
  { name: 'notion-mcp', kind: 'tool', provenance: 'Bundled', version: '0.9.1', digest: 'sha256:7b2d8e064a9f1c3e5a93f02b6d48e1a97f1e5c1c7e3e7b5d2a8f6e0c4b9d3a7f', description: 'Hosted Notion MCP with host-locked egress.' },
];
export const FALLBACK_DIGEST = 'sha256:9f3a7c1e4b2d8a6f0e5c3b9d7a1f4e8c2b6d0a9f3e7c5b1d8a4f6e2c0b9d7a3f';
export function claimEntry(claim) {
  return { name: claim?.name || CLAIM.placeholder.name, kind: 'skill', provenance: 'New', version: '0.1.0', digest: claim?.digest || FALLBACK_DIGEST, description: claim?.description || CLAIM.placeholder.description };
}
export const catalogFor = claim => [claimEntry(claim), ...CATALOG_FIXED];
/** The player's tool id as the fixtures should show it: `ice-finder` → `ice.finder`. */
export const toolId = claim => claimEntry(claim).name.replace(/-/g, '.');
/** Fixture text is authored against the generic `belt.survey`; show it as the player's own id. */
export const personalize = (text, claim) => String(text).replace(/belt\.survey/g, toolId(claim));

/** The skill body the operator reviews: THEIR name and purpose, with the fixed safe limits. */
export function skillBodyFor(claim) {
  const e = claimEntry(claim), tool = e.name.replace(/-/g, '.');
  return `# ${e.name}  (skill, ${e.version})

description: ${e.description}

## When to use
Use when the operator asks for what this skill does: ${e.description}
It needs a sector id like "K-17".

## Procedure
1. Ask the operator for the sector id if it is missing.
2. Call ${tool} with { "sector": "<id>" }.
3. Present the result as a table. Say which figures are estimates.

## Limits
- Read-only. This skill does not write to any provider.
- Do not install other packages on the operator's behalf.
- Do not send workspace files anywhere. Only the sector id leaves the host.
- Every step above is shown to the operator; nothing runs silently.

## Credentials
${tool} uses the "belt" vendor. The account is selected by product
auth; this skill never reads the token.

(end of skill body)`;
}

export const REVIEW_FLAGS = [
  'No instruction to install other packages without telling the operator',
  'No instruction to send workspace contents to an outside host',
  'No step the operator is not told about',
];
