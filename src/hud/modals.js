/* modals.js — human override (z40), manual review minigame (z40), help panel. */
import { $, esc } from './dom.js';
import { RULES, skillBodyFor, REVIEW_FLAGS } from '../content.js';
import { surveyFacts } from '../survey/facts.js';
import { renderSurvey } from '../survey/render.js';

export function createModals(store, { runCommand, say }) {
  let lastFocus = null;
  // Real modal behaviour: siblings go inert (blocks pointer + focus + AT), Tab wraps inside, Esc closes.
  const siblings = m => [...document.body.children].filter(c => c !== m && c.tagName !== 'SCRIPT');
  const open = id => { lastFocus = document.activeElement; const m = $(id); siblings(m).forEach(c => c.inert = true); m.setAttribute('open', ''); (m.querySelector('[autofocus]') || m.querySelector('button')).focus() };
  const close = id => { const m = $(id); m.removeAttribute('open'); siblings(m).forEach(c => c.inert = false); lastFocus?.focus?.() };
  const focusables = m => [...m.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(e => e.offsetParent !== null);
  document.querySelectorAll('.modal').forEach(m => m.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); close(m.id); return }
    if (e.key !== 'Tab') return;
    const f = focusables(m); if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }));

  // -- human override for provenance New
  let pendingInstall = null;
  function openOverride(entry, cmdText) { pendingInstall = cmdText; $('ovName').textContent = entry.name; open('overrideModal') }
  $('ovCancel').onclick = () => { close('overrideModal'); say('install cancelled. ' + RULES.text.chatCannot, 'warn') };
  $('ovAck').onclick = () => { close('overrideModal'); runCommand(pendingInstall + ' --acknowledge-unverified') };

  // -- manual review: evidence-based. The skill body is split into ## sections.
  //    Each flag names the section that is its evidence; the checkbox unlocks only
  //    after that section has been scrolled into view (IntersectionObserver), and
  //    the review is bound to the artifact digest it was performed against.
  let reviewObserver = null, reviewedDigest = null;
  function openReview() {
    reviewedDigest = store.state.pkg.digest;
    const sc = $('rvScroll'); sc.innerHTML = ''; sc.scrollTop = 0;
    const sections = skillBodyFor(store.state.claim).split(/\n(?=## )/);
    const secByTitle = {};
    sections.forEach((txt, i) => {
      const sec = document.createElement('section'); sec.id = `rv-sec-${i}`; sec.className = 'rvsec'; sec.tabIndex = -1;
      sec.textContent = txt.trim();
      const m = txt.match(/^## (.+)/); if (m) secByTitle[m[1].trim()] = sec;
      sc.append(sec);
    });
    const evidenceFor = flag => /install other packages/i.test(flag) || /outside host/i.test(flag) || /not told about/i.test(flag) ? secByTitle['Limits'] : null;
    const ul = $('rvFlags');
    ul.innerHTML = REVIEW_FLAGS.map((t, i) => `<li><label aria-disabled="true"><input type="checkbox" data-i="${i}" disabled>${esc(t)}</label> <button type="button" class="act evid" data-i="${i}">Show evidence</button></li>`).join('');
    $('rvPromote').disabled = true;
    $('rvAuthority').textContent = `Promoting moves ${store.state.pkg.name} to ${RULES.paths.trusted}. ${RULES.text.sameRights}`;
    const seen = new Set();
    reviewObserver?.disconnect();
    reviewObserver = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) seen.add(e.target) });
      REVIEW_FLAGS.forEach((t, i) => { const sec = evidenceFor(t); if (sec && seen.has(sec)) { const inp = ul.querySelector(`input[data-i="${i}"]`); inp.disabled = false; inp.parentElement.removeAttribute('aria-disabled') } });
    }, { root: sc, threshold: .6 });
    Object.values(secByTitle).forEach(s => reviewObserver.observe(s));
    ul.querySelectorAll('.evid').forEach(b => b.onclick = () => { const sec = evidenceFor(REVIEW_FLAGS[+b.dataset.i]); if (sec) { sec.scrollIntoView({ block: 'center', behavior: 'smooth' }); sec.focus({ preventScroll: true }); sec.classList.add('hl'); setTimeout(() => sec.classList.remove('hl'), 1200) } });
    ul.oninput = () => { $('rvPromote').disabled = ul.querySelectorAll('input:checked').length < REVIEW_FLAGS.length };
    open('reviewModal');
  }
  $('rvCancel').onclick = () => { close('reviewModal'); say(`review cancelled. ${store.state.pkg.name} stays Installed.`, 'warn') };
  $('rvPromote').onclick = () => {
    if (reviewedDigest !== store.state.pkg.digest) { close('reviewModal'); say('review discarded: the artifact changed since the review began. Open the review again.', 'err'); return }
    const flags = [...$('rvFlags').querySelectorAll('input:checked')].map(i => REVIEW_FLAGS[+i.dataset.i]);
    close('reviewModal'); store.emit('manual_review_complete', { flags, skill: store.state.pkg.name, artifactDigest: reviewedDigest });
  };

  // -- help: how-to-play.txt is fetched once, on first open
  let guide = null;
  async function loadGuide() {
    const body = $('hpBody');
    if (guide) return;
    try {
      const r = await fetch('how-to-play.txt', { cache: 'no-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      guide = await r.text();
      body.textContent = guide;
    } catch (e) {
      body.textContent = `The guide could not be loaded (${e.message}).\n\nhow-to-play.txt sits next to index.html. If you opened the page from a file:// path, serve it over HTTP instead: run "npm start" in the project folder and open the address it prints.`;
    }
    body.removeAttribute('aria-busy');
  }
  $('helpBtn').onclick = () => { open('helpModal'); loadGuide() };
  $('hpClose').onclick = () => close('helpModal');
  $('resetBtn').onclick = () => { close('helpModal'); store.reset(); location.reload() };

  // -- commissioning survey (Imp 10). Gameplay completion is read from the store;
  //    nothing here writes to it. A generation token discards stale async results.
  let sceneHandles = null, surveyGen = 0, surveyResult = null, objectUrl = null;
  const attachScene = h => { sceneHandles = h };
  const releaseUrl = () => { if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null } };
  async function renderSurveyPlate() {
    const gen = ++surveyGen;
    const facts = surveyFacts(store.state);
    const status = $('svStatus');
    if (!facts || !sceneHandles) { status.textContent = 'The survey is available once the colony is established.'; return }
    status.textContent = 'Rendering…'; $('svExport').disabled = true;
    const view = document.querySelector('input[name="svView"]:checked')?.value || 'survey';
    try {
      await new Promise(r => requestAnimationFrame(r));            // let the dialog paint first
      const res = renderSurvey(sceneHandles, facts, view);
      if (gen !== surveyGen) return;                                // stale: a newer render or a close happened
      surveyResult = res;
      releaseUrl();
      const blob = await new Promise(r => res.canvas.toBlob(r, 'image/png'));
      if (gen !== surveyGen) return;
      objectUrl = URL.createObjectURL(blob); $('svImg').src = objectUrl;
      $('svLabels').innerHTML = res.labels.map(l => `<li>${esc(l.text)}</li>`).join('') || '<li>No annotations placed for this view.</li>';
      status.textContent = `${facts.designation} · ${view} view`; $('svExport').disabled = false;
    } catch (e) {
      if (gen !== surveyGen) return;
      status.textContent = `Render failed: ${e.message}. The preview and your progress are unchanged.`;
    }
  }
  function openSurvey() { open('surveyModal'); renderSurveyPlate() }
  function closeSurvey() { surveyGen++; close('surveyModal'); releaseUrl(); surveyResult = null; $('svImg').removeAttribute('src') }
  $('svClose').onclick = closeSurvey;
  $('svRender').onclick = renderSurveyPlate;
  document.querySelectorAll('input[name="svView"]').forEach(i => i.onchange = renderSurveyPlate);
  $('svExport').onclick = () => {
    if (!objectUrl || !surveyResult) return;
    const facts = surveyFacts(store.state); if (!facts) return;
    const a = document.createElement('a'); a.href = objectUrl; a.download = `vesper-survey-${facts.seed.slice(0, 8)}-${surveyResult.view}.png`;
    document.body.append(a); a.click(); a.remove();
    $('svStatus').textContent = 'Exported. The plate stays open.';
  };
  store.bus.addEventListener('reset', () => { surveyGen++; releaseUrl() });

  return { openOverride, openReview, openSurvey, attachScene, open, loadGuide };
}
