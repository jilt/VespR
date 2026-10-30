/* digest.js — the signature element: sha256 as a 16×4 glyph grid + trust tier. */
import { $, el, reduced } from './dom.js';
import { claimEntry } from '../content.js';

export function createDigest(store, { runCommand, prepare, toast }) {
  const grid = $('dgrid');
  grid.innerHTML = Array.from({ length: 64 }, () => '<span>·</span>').join('');
  const cells = [...grid.children];
  let shownDigest = null, shownState = null;

  $('copyHash').onclick = async () => {
    const d = store.state.pkg.digest;
    if (!d) return;
    await navigator.clipboard.writeText(d);
    toast({ k: 'ok', title: 'Digest copied', body: d.slice(0, 18) + '…' });
  };

  const panel = $('digestPanel');
  const toggle = $('digestToggle');
  toggle.onclick = () => {
    const open = panel.hidden;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  };

  // Mobile: the hexagon button opens the whole digest as an overlay with the panel shown.
  const setOverlay = open => { $('digest').dataset.open = open ? '1' : '0'; $('statusBtn').setAttribute('aria-expanded', String(open)); if (open) { panel.hidden = false; toggle.setAttribute('aria-expanded', 'true'); $('digestClose').focus() } else $('statusBtn').focus() };
  $('statusBtn').onclick = () => setOverlay($('digest').dataset.open !== '1');
  $('digestClose').onclick = () => { setOverlay(false); panel.hidden = true; toggle.setAttribute('aria-expanded', 'false') };
  $('digest').addEventListener('keydown', e => { if (e.key === 'Escape') { setOverlay(false); panel.hidden = true; toggle.setAttribute('aria-expanded', 'false') } });
  // Desktop: click outside the open panel closes it.
  document.addEventListener('pointerdown', e => { if (!panel.hidden && $('digest').dataset.open !== '1' && !$('digest').contains(e.target)) { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false') } });

  // Uses the INSPECTED version + digest from state (never the catalog), and never
  // inserts --acknowledge-unverified: the override dialog asks for that explicitly.
  const pinCommand = () => {
    const p = store.state.pkg;
    return `ironclaw ironhub install ${p.name} --kind ${p.kind} --expected-version "${p.version}" --expected-artifact-digest "${p.digest}"${store.state.trustTier !== 'none' ? ' --force' : ''}`;
  };

  function paintGrid(s) {
    const hex = s.pkg.digest ? s.pkg.digest.slice(7) : null;
    const st = !hex ? 'none' : s.trustTier === 'trusted' && s.pkg.pinned ? 'trusted' : s.pkg.pinned ? 'pinned' : 'known';
    if (hex !== shownDigest) cells.forEach((c, i) => c.textContent = hex ? hex[i] : '·');
    if (st !== shownState || hex !== shownDigest) {
      const fill = (st === 'pinned' || st === 'trusted') && shownState !== 'pinned' && shownState !== 'trusted' && !reduced.matches;
      cells.forEach((c, i) => { if (fill) { c.dataset.s = 'known'; setTimeout(() => c.dataset.s = st, 14 * i) } else c.dataset.s = st });
    }
    shownDigest = hex; shownState = st;
    $('dsr').textContent = hex ? `artifact digest sha256 ${hex}, ${st}` : 'no artifact digest yet';
  }

  function ceilingInfo(s) {
    if (s.trustTier === 'none') return { cap: null, req: null };
    if (!s.pkg.pinned) return { cap: '55%', req: 'Pin inspected digest' };
    if (s.trustTier === 'installed') return { cap: '90%', req: 'Review before trusting' };
    return { cap: '100%', req: null };
  }

  function render(s) {
    const p = s.pkg, dg = $('digest');
    dg.dataset.tier = s.trustTier; paintGrid(s);
    $('tierName').textContent = s.trustTier === 'trusted' ? 'Trusted' : s.trustTier === 'installed' ? 'Installed' : 'No package';
    $('tierNameFull').textContent = $('tierName').textContent;
    const st = $('tierStateFull'); st.dataset.k = '';
    if (s.phase < 3) st.textContent = s.phase === 1 ? 'Mine a valid manifest to begin.' : 'Pass the tests to publish.';
    else if (s.trustTier === 'none') st.textContent = p.digest ? `Not installed. Run ironclaw ironhub install ${p.name} --kind ${p.kind}` : `Published. Run ironclaw ironhub info ${claimEntry(s.claim).name} --kind skill`;
    else if (s.trustTier === 'installed') { st.textContent = p.pinned ? 'Pinned. Description only; no self-activation. Review before trusting.' : 'Not pinned. Thin atmosphere.'; st.dataset.k = p.pinned ? '' : 'warn' }
    else st.textContent = p.pinned ? 'Full prompt body loaded. Autonomous activation.' : 'Trusted but unpinned. Thin atmosphere.';

    const ci = ceilingInfo(s);
    $('ceilingRead').textContent = ci.cap ? `O2 ceiling ${ci.cap}` : '—';
    $('pkgName').textContent = p.name ?? '—';
    $('pkgVersion').textContent = p.version ?? '—';
    $('pkgProvenance').textContent = p.provenance ?? '—';
    $('pkgPin').textContent = p.pinned ? 'Pinned' : 'Not pinned';
    $('pkgCeiling').textContent = ci.cap ?? '—';
    $('pkgRequirement').textContent = ci.req ?? '—';

    const acts = $('dacts'); acts.innerHTML = '';
    if (s.phase === 3 && p.digest) {
      if (!p.pinned) { const b = el('button', { className: 'act primary', title: pinCommand() }, 'Prepare pin command'); b.onclick = () => { $('digestPanel').hidden = true; $('digestToggle').setAttribute('aria-expanded', 'false'); $('digest').dataset.open = '0'; (prepare || runCommand)(pinCommand()) }; acts.append(b) }
      if (s.trustTier === 'installed') { const r = el('button', { className: 'act risky' }, 'Promote to Trusted'); r.onclick = () => store.emit('trust_promotion_requested', { skill: p.name }); acts.append(r) }
    }
  }

  function flashMismatch() { cells.forEach(c => c.dataset.s = 'mismatch'); setTimeout(() => { shownState = null; paintGrid(store.state) }, 1400) }

  function ignite() {
    if (reduced.matches) return;
    $('ignite').dataset.go = '1'; $('digest').dataset.go = '1';
    setTimeout(() => { $('ignite').dataset.go = '0'; $('digest').dataset.go = '0' }, 2800);
  }

  return { render, flashMismatch, ignite, pinCommand };
}
