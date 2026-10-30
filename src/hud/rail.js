/* rail.js — left rail: phase checklist, current task, doc hint. */
import { $, el, esc } from './dom.js';
import { RULES, FIELDS, TESTS, WRITE_TOOL, DRONE_RULES, CLAIM, slugify, validateClaimManifest, claimDigest, personalize } from '../content.js';

const PHASE_HEAD = {
  1: ['Build a package', 'Each core sample attaches one manifest field. A field counts only when it validates.'],
  2: ['Package and test', 'Drones carry the runtime rules. A hex solidifies when its test category passes.'],
  3: ['Publish, install, trust', 'Use the console below. Verification is life support.'],
};

export function createRail(store, { prepare, openSurvey } = {}) {
  $('railToggle').onclick = () => { const r = $('rail'), open = r.dataset.open === '1'; r.dataset.open = open ? '0' : '1'; $('railToggle').setAttribute('aria-expanded', String(!open)) };

  let inspectedSample = null;
  let lastRejection = null;
  let selectedDrone = null;

  function renderRack(s, jam) {
    const rack = $('rack'); rack.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const slot = el('button', { className: 'slot', 'aria-label': `Sample slot ${i + 1}` });
      if (i < s.pending) {
        if (jam) { slot.disabled = true; slot.textContent = '⧗'; slot.title = 'Jammed — extracting resume shortly'; }
        else {
          slot.textContent = '◈';
          if (inspectedSample === i) { slot.classList.add('sel'); slot.setAttribute('aria-pressed', 'true'); }
          slot.onclick = () => { inspectedSample = inspectedSample === i ? null : i; renderRack(s, jam); renderTask(s, jam); };
        }
      } else { slot.disabled = true; slot.textContent = '○'; slot.title = 'Extraction ongoing'; }
      rack.append(slot);
    }
  }

  let lastJamShown = 0;
  function renderFail(s) {
    const panel = $('failPanel');
    if (store.isJammed() && s.legacyHits !== lastJamShown) { lastJamShown = s.legacyHits; lastRejection = { code: 'E_LEGACY_SHAPE', err: RULES.text.legacy, rec: 'Excavator jammed. Accepted fields are intact. Extraction resumes in about two seconds; the sample is lost.' } }
    if (!lastRejection) { panel.hidden = true; return; }
    if (panel.hidden) $('rail').scrollTop = 0;
    panel.hidden = false;
    panel.innerHTML = '';
    panel.append(el('p', { className: 'fcode' }, lastRejection.code));
    panel.append(el('p', { className: 'ferr' }, lastRejection.err));
    panel.append(el('p', { className: 'frec' }, lastRejection.rec));
    const btn = el('button', { className: 'act' }, 'Dismiss');
    btn.onclick = () => { lastRejection = null; panel.hidden = true; };
    panel.append(btn);
  }

  function renderDrones(s) {
    const row = $('droneRow');
    if (s.phase !== 2) { row.hidden = true; return; }
    row.hidden = false;
    row.innerHTML = '';
    const drones = ['envoy', 'guard', 'scribe'];
    drones.forEach((d, i) => {
      const t = TESTS.find(x => x.drone === d);
      const passed = s.tests[t.category];
      const active = s.drones.includes(d);
      const b = el('button', { className: 'drone', 'aria-label': `${d} drone — ${DRONE_RULES[d].label}` });
      b.dataset.state = passed ? 'passed' : active ? 'ready' : 'waiting';
      b.textContent = `${d === 'envoy' ? '⬠' : d === 'guard' ? '⬡' : '⬢'} ${d}`;
      if (selectedDrone === i) b.classList.add('sel');
      b.onclick = () => { selectedDrone = selectedDrone === i ? null : i; renderDrones(s); renderTask(s, false); };
      row.append(b);
    });
  }

  // Phase handover: milestone reached but not yet acknowledged. Non-blocking —
  // the checklist and task below stay live; the scene catches up on its own.
  function renderHandover(s) {
    const h = $('handover');
    const stage = s.milestones.s1 && !s.handover.s1 ? 's1' : s.milestones.s2 && !s.handover.s2 ? 's2' : null;
    if (!stage) { h.hidden = true; return; }
    h.hidden = false; h.innerHTML = '';
    h.append(el('p', { className: 'hdone' }, RULES.milestones[stage]));
    h.append(el('p', { className: 'hnext' }, stage === 's1' ? 'Next: test the habitat structure.' : 'Next: inspect and install the published package.'));
    const b = el('button', { className: 'act primary' }, stage === 's1' ? 'Begin testing' : 'Open IronHub console');
    b.onclick = () => { store.emit('handover_ack', { stage }); if (stage === 's2') $('cli').focus() };
    h.append(b);
  }

  function render(s) {
    const jam = store.isJammed();
    const [h, sub] = PHASE_HEAD[s.phase]; $('railTitle').firstChild.textContent = h; $('railSub').textContent = sub;
    const samples = $('samples'); samples.hidden = s.phase !== 1; samples.dataset.jam = jam ? '1' : '0';
    $('sampleNote').textContent = s.phase > 1 ? 'manifest complete' : jam ? 'jammed on a v2 shape' : s.pending ? `${s.pending} pending` : 'waiting on the excavator';
    renderRack(s, jam);
    renderFail(s);
    renderDrones(s);
    renderHandover(s);

    let items;
    if (s.phase === 1) items = FIELDS.map(f => ({ t: f.item, on: s.manifest[f.key] }));
    else if (s.phase === 2) items = [...TESTS.map(t => ({ t: t.item, on: s.tests[t.category] })), { t: `${personalize(WRITE_TOOL.id, s.claim)} write clearance (default_permission = "ask")`, on: s.clearance === 'granted', wait: s.clearance === 'awaiting' }];
    else items = [
      { t: 'find the entry: ironhub search or list', on: s.hub.searched },
      { t: 'inspect provenance, version and digest: ironhub info', on: s.hub.inspected },
      { t: 'install: ironhub install', on: s.trustTier !== 'none' },
      { t: 'pin --expected-version and --expected-artifact-digest', on: s.pkg.pinned },
      { t: 'review, then promote to Trusted', on: s.trustTier === 'trusted' },
    ];
    $('checklist').innerHTML = items.map(i => `<li data-on="${i.on ? 1 : 0}" data-wait="${i.wait ? 1 : 0}"><span class="box" aria-hidden="true"></span><code>${esc(i.t)}</code></li>`).join('');
    renderTask(s, jam);
  }

  function options(list, disabled, onPick) {
    const wrap = el('div', { className: 'opts' }), claim = store.state.claim;
    list.forEach(o => { const b = el('button', { className: 'opt', disabled }, personalize(o.t, claim)); b.onclick = () => onPick(o); wrap.append(b) });
    return wrap;
  }

  // ---- the claim form (first core sample). Draft lives here so the 400 ms rail
  //      re-render never wipes what the player typed; the form node is reused.
  const draft = { name: '', description: '', manifest: '' };
  let claimForm = null, submitting = false;
  function renderClaim(s, jam, task) {
    const canSubmit = s.pending > 0 && !jam && !submitting;
    if (!claimForm) {
      claimForm = el('form', { className: 'claim', autocomplete: 'off' });
      claimForm.innerHTML = `
        <p class="obj">Stake your claim</p>
        <p class="story">${esc(CLAIM.story).replace(/\n\n/g, '</p><p class="story">')}</p>
        <label>Claim name <small>what you will trade under on the hub</small><input name="name" placeholder="${esc(CLAIM.placeholder.name)}" maxlength="40" required></label>
        <label>What it does <small>one line, for the buyer</small><input name="description" placeholder="${esc(CLAIM.placeholder.description)}" maxlength="120" required></label>
        <label>Manifest header <small>must open with the v3 contract line</small><textarea name="manifest" rows="5" spellcheck="false" placeholder="${esc(CLAIM.placeholder.manifest)}" required></textarea></label>
        <p class="item">The host checks one thing here: <code>${esc(CLAIM.rule)}</code>. Everything else is yours.</p>
        <button class="act primary" type="submit">Submit as first core sample</button>
        <p class="cost">A header without the v3 line is refused and spends the sample. A legacy v2 shape jams the excavator.</p>`;
      const [nameI, descI, manI] = ['name', 'description', 'manifest'].map(n => claimForm.elements[n]);
      nameI.oninput = () => { draft.name = nameI.value }; descI.oninput = () => { draft.description = descI.value }; manI.oninput = () => { draft.manifest = manI.value };
      nameI.onblur = () => { const sl = slugify(nameI.value); if (sl && sl !== nameI.value) { nameI.value = sl; draft.name = sl } };
      claimForm.onsubmit = async e => {
        e.preventDefault(); if (!canSubmitNow()) return;
        const name = slugify(nameI.value), description = descI.value.trim(), manifest = manI.value;
        if (name.length < 3) { nameI.setCustomValidity('Use at least 3 characters: letters, digits, hyphens.'); nameI.reportValidity(); return } nameI.setCustomValidity('');
        const v = validateClaimManifest(manifest);
        if (v.legacy) { store.emit('excavator_jam'); return }
        if (!v.ok) { lastRejection = { code: v.code, err: v.err, rec: 'Sample spent. Fix the header and wait for the next core sample.' }; store.emit('field_rejected', { err: v.err, code: v.code }); return }
        submitting = true; claimForm.querySelector('button').disabled = true;
        try { const digest = await claimDigest(manifest); store.emit('resource_mined', { key: 'schema_version', value: manifest, claim: { name, description, manifest, digest } }) }
        finally { submitting = false }
      };
    }
    const canSubmitNow = () => store.state.pending > 0 && !store.isJammed() && !submitting;
    for (const [k, v] of Object.entries(draft)) if (claimForm.elements[k].value !== v) claimForm.elements[k].value = v;   // only touch a field that drifted; writing the same value would still move the caret
    const btn = claimForm.querySelector('button[type=submit]'); btn.disabled = !canSubmit;
    btn.textContent = jam ? 'Excavator jammed' : s.pending ? 'Submit as first core sample' : 'Waiting for a core sample';
    if (claimForm.parentNode !== task) task.append(claimForm);   // append() on an attached node re-inserts it, which also drops focus
  }

  const COST = {
    1: 'A rejected fragment spends the core sample. Wait for the next one.',
    2: 'A failed pick names the test that failed and why. The band stays open.',
    3: 'A wrong digest is refused without changing installed state.',
  };

  function renderTask(s, jam) {
    const task = $('task'); let hint = '';
    const claimLive = s.phase === 1 && s.fieldIdx < FIELDS.length && FIELDS[s.fieldIdx].input;
    if (!(claimLive && claimForm && claimForm.parentNode === task)) task.innerHTML = '';   // never detach the live claim form: it would steal focus mid-keystroke
    if (claimLive) {
      renderClaim(s, jam, task); hint = FIELDS[s.fieldIdx].hint;
    } else if (s.phase === 1 && s.fieldIdx < FIELDS.length) {
      const f = FIELDS[s.fieldIdx]; hint = f.hint;
      task.append(el('p', { className: 'obj' }, 'Fit a safe package path'));
      task.append(el('p', { className: 'item' }, f.item));
      task.append(el('p', { className: 'q' }, personalize(f.q, s.claim)));
      task.append(options(f.opts, !s.pending || jam, o => {
        if (o.legacy) store.emit('excavator_jam');
        else if (o.ok) store.emit('resource_mined', { key: f.key, value: o.t });
        else {
          lastRejection = { code: o.code, err: o.err, rec: 'Sample spent. Wait for the next core sample.' };
          store.emit('field_rejected', { err: o.err, code: o.code });
        }
      }));
      task.append(el('p', { className: 'cost' }, COST[1]));
    } else if (s.phase === 2) {
      const t = selectedDrone !== null ? TESTS.find(x => x.drone === ['envoy','guard','scribe'][selectedDrone] && !s.tests[x.category]) || TESTS[s.testIdx] : TESTS[s.testIdx];
      if (t) {
        const ready = s.drones.includes(t.drone); hint = `${DRONE_RULES[t.drone].label}: ${DRONE_RULES[t.drone].rule} ${t.hint}`;
        task.append(el('p', { className: 'obj' }, 'Verify the habitat structure'));
        task.append(el('p', { className: 'item' }, t.item));
        task.append(el('p', { className: 'q' }, ready ? personalize(t.q, s.claim) : `Waiting for the ${t.drone} drone to launch.`));
        task.append(options(t.opts, !ready, o => store.emit('hex_lock_attempt', { category: t.category, passed: !!o.ok, err: o.err, code: o.code })));
        task.append(el('p', { className: 'cost' }, COST[2]));
      } else if (s.clearance === 'awaiting') {
        hint = RULES.text.askDefault + ' ' + RULES.text.approvals;
        task.append(el('p', { className: 'obj' }, 'Authorize the write gate'));
        task.append(el('p', {}, `${personalize(WRITE_TOOL.id, s.claim)} declares effects = ${WRITE_TOOL.effects} with default_permission = "${WRITE_TOOL.default_permission}". The last hex ring awaits your clearance.`));
        const b = el('button', { className: 'act primary' }, 'Grant write clearance'); b.onclick = () => store.emit('clearance_granted'); task.append(b);
      }
    } else if (s.phase === 3) {
      hint = s.trustTier === 'none' ? RULES.text.communityNew + ' ' + RULES.text.infoPrints
        : s.trustTier === 'installed' ? RULES.text.installedTrust + ' ' + RULES.text.moveAfterReview + ' ' + RULES.text.sameRights
        : RULES.text.trustedTrust;
      task.append(el('p', { className: 'obj' }, 'Install, pin, trust'));
      task.append(el('p', { className: 'q' }, s.milestones.s3 ? 'Colony established. Your extension is built, tested, pinned and reviewed.'
        : s.trustTier === 'none' ? `Find ${s.claim.name} in the catalog, inspect it, then install it.`
        : !s.pkg.pinned ? 'Pin the digest so the host verifies what it runs.'
        : s.trustTier === 'installed' ? 'Review the skill body, then promote it to Trusted.' : 'Atmosphere filling.'));
      if (s.trustTier === 'installed' && s.pkg.pinned) {
        const b = el('button', { type: 'button', className: 'act primary' }, 'Review skill');
          b.onclick = () => store.emit('trust_promotion_requested', { skill: store.state.pkg.name });
          task.append(b);
        }
        if (prepare && !s.milestones.s3) {
        const prep = el('div', { className: 'prep' });
        const add = (label, cmd) => { const b = el('button', { className: 'act', title: cmd }, label); b.onclick = () => prepare(cmd); prep.append(b) };
        if (!s.hub.searched) add('Prepare search', `ironclaw ironhub search ${s.claim.name.split('-')[0]}`);
        else if (!s.hub.inspected) add('Prepare info', `ironclaw ironhub info ${s.claim.name} --kind skill`);
        else if (s.trustTier === 'none') add('Prepare install', `ironclaw ironhub install ${s.pkg.name} --kind ${s.pkg.kind}`);
        else if (!s.pkg.pinned) add('Prepare pinned install', `ironclaw ironhub install ${s.pkg.name} --kind ${s.pkg.kind} --expected-version "${s.pkg.version}" --expected-artifact-digest "${s.pkg.digest}" --force`);
        if (prep.children.length) { task.append(el('p', { className: 'item' }, 'Prepared commands fill the console. You still press Enter.')); task.append(prep); }
      }
      if (s.milestones.s3 && openSurvey) { const b = el('button', { className: 'act primary' }, 'Open commissioning survey'); b.onclick = openSurvey; task.append(b) }
      task.append(el('p', { className: 'cost' }, COST[3]));
    }
    $('hint').hidden = !hint; $('hintBody').textContent = hint;
  }

  return { render };
}
