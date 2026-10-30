/* console.js — simulated `ironclaw ironhub` CLI. search | list | info | install. */
import { $ } from './dom.js';
import { RULES, catalogFor } from '../content.js';
import { createModals } from './modals.js';

export function createConsole(store, hooks) {
  // hooks: { onOverrideRequired(entry, cmdText), onMismatch(), open(id), loadGuide() } — bound late by hud/index.js
  const out = $('out');
  const line = (text, cls = '') => { const d = document.createElement('div'); if (cls) d.className = cls; d.textContent = text; out.append(d); out.scrollTop = out.scrollHeight };
  const say = (text, cls) => { line(text, cls); store.emit('console_log', { text, cls }) };

  const tokenize = str => { const re = /"([^"]*)"|'([^']*)'|(\S+)/g, a = []; let m; while ((m = re.exec(str))) a.push(m[1] ?? m[2] ?? m[3]); return a };
  const parseFlags = args => { const f = {}, pos = []; for (let i = 0; i < args.length; i++) { const a = args[i]; if (a.startsWith('--')) { const k = a.slice(2), v = args[i + 1]; if (v !== undefined && !v.startsWith('--')) { f[k] = v; i++ } else f[k] = true } else pos.push(a) } return { f, pos } };
  const fmt = e => `${e.name.padEnd(14)} ${e.kind.padEnd(6)} ${e.provenance.padEnd(8)} ${e.version}`;

  function runCommand(raw) {
    const cmdText = raw.trim(); if (!cmdText) return;
    say('$ ' + cmdText, 'cmd');
    const args = tokenize(cmdText), state = store.state;
    if (args[0] === 'clear') { out.innerHTML = ''; store.emit('console_clear'); return }
    if (args[0] === 'reset') { store.reset(); location.reload(); return }   // works in every phase: wipes the save and boots a fresh run
    if (args[0] === 'help' || args[0] === '?') return say('ironclaw ironhub search <keyword>\nironclaw ironhub list [--kind tool|skill]\nironclaw ironhub info <name> --kind tool|skill\nironclaw ironhub install <name> --kind tool|skill [--expected-version "x"] [--expected-artifact-digest "sha256:..."] [--acknowledge-unverified] [--force]\nreset — wipe the save and start a new run');
    if (args[0] !== 'ironclaw' || args[1] !== 'ironhub') return say(`unknown command: ${args[0] ?? ''}. Type help.`, 'err');
    if (state.phase < 3) return say('ironhub: the console comes online once the package passes its tests.', 'warn');

    const CATALOG = catalogFor(state.claim);
    const sub = args[2], { f, pos } = parseFlags(args.slice(3));
    const byKind = e => !f.kind || e.kind === f.kind;
    if (sub === 'search') {
      const kw = (pos[0] || '').toLowerCase(), hits = CATALOG.filter(e => byKind(e) && (e.name.includes(kw) || e.description.toLowerCase().includes(kw)));
      say(hits.length ? hits.map(fmt).join('\n') : `no entries match "${kw}"`); if (hits.length) store.emit('search_done'); return;
    }
    if (sub === 'list') { say(CATALOG.filter(byKind).map(fmt).join('\n')); store.emit('search_done'); return }
    if (sub !== 'info' && sub !== 'install') return say(`unknown subcommand: ${sub ?? ''}. Type help.`, 'err');

    if (!pos[0]) return say(`usage: ironclaw ironhub ${sub} <name> --kind tool|skill`, 'err');
    if (!f.kind || f.kind === true) return say('--kind is required: tool or skill', 'err');
    const entry = CATALOG.find(e => e.name === pos[0]);
    if (!entry || entry.kind !== f.kind) return say(`no ${f.kind} named ${pos[0]} in the catalog. Try: ironclaw ironhub list --kind ${f.kind}`, 'err');

    if (sub === 'info') {
      say(`name        ${entry.name}\nkind        ${entry.kind}\nprovenance  ${entry.provenance}\nversion     ${entry.version}\ndigest      ${entry.digest}\n\n${entry.description}`);
      store.emit('info_viewed', entry); return;
    }
    // install
    if (entry.provenance === 'New' && !f['acknowledge-unverified']) {
      say('refused: ' + RULES.text.communityNew, 'err');
      hooks.onOverrideRequired?.(entry, cmdText); return;
    }
    if (f['acknowledge-unverified']) store.emit('human_override_ack');
    const wantsPin = 'expected-version' in f || 'expected-artifact-digest' in f;
    if (wantsPin) {
      const vOk = !('expected-version' in f) || f['expected-version'] === entry.version;
      const dOk = !('expected-artifact-digest' in f) || f['expected-artifact-digest'] === entry.digest;
      if (!vOk || !dOk) {
        const err = !vOk ? `expected version ${f['expected-version']} but the catalog has ${entry.version}.` : `expected artifact digest does not match the catalog digest. Run ironclaw ironhub info ${entry.name} --kind ${entry.kind} and copy the digest exactly.`;
        say('refused: ' + err, 'err'); store.emit('digest_pinned', { pinned: false, err }); hooks.onMismatch?.(); return;
      }
    }
    if (state.pkg.name === entry.name && state.trustTier !== 'none' && !f.force) return say(`${entry.name} is already installed. Pass --force to reinstall.`, 'warn');
    const both = 'expected-version' in f && 'expected-artifact-digest' in f;
    store.emit('install_requested', { entry, pinned: both });
    if (both) store.emit('digest_pinned', { pinned: true });
    say(`installed ${entry.name} ${entry.version} to ${entry.kind === 'skill' ? RULES.paths.installed.replace('<name>', entry.name) : 'the active tool set'}${both ? '\npinned: version and artifact digest verified' : '\nnot pinned: ' + RULES.text.pin}`, both ? 'ok' : 'warn');
  }

  // ---- command history (session-only, starting value: 50 entries) + preparation ----
  const history = []; let hIdx = -1; let draft = '';
  const input = $('cli');
  $('cliForm').addEventListener('submit', e => {
    e.preventDefault(); const v = input.value.trim();
    if (v) { history.push(v); if (history.length > 50) history.shift(); }
    hIdx = -1; draft = ''; runCommand(v); input.value = '';
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp') { if (!history.length) return; e.preventDefault(); if (hIdx === -1) draft = input.value; hIdx = Math.min(history.length - 1, hIdx + 1); input.value = history[history.length - 1 - hIdx]; }
    else if (e.key === 'ArrowDown') { if (hIdx === -1) return; e.preventDefault(); hIdx--; input.value = hIdx === -1 ? draft : history[history.length - 1 - hIdx]; }
    else if (e.key === '?') {
      e.preventDefault(); hooks.open('helpModal'); hooks.loadGuide();
    }
  });
  let preNoticeShown = false;
  input.addEventListener('focus', () => { if (store.state.phase < 3 && !preNoticeShown) { preNoticeShown = true; line('ironhub: this console comes online in Phase 3, once the package passes its tests. Until then, work in the rail on the left.', 'warn') } });

  /** Fill the input and focus it. Never runs the command. Refuses to clobber unsent user text. */
  function prepare(text) {
    const cur = input.value.trim();
    if (cur && cur !== text && !confirm('Replace the unsent command in the console?')) return false;
    input.value = text; input.focus(); input.setSelectionRange(text.length, text.length); return true;
  }

  store.state.log.forEach(l => line(l.text, l.cls));
  if (!store.state.log.length) line('IronHub console. Type help for commands.');
  store.bus.addEventListener('atmosphere_ignited', () => say(RULES.milestones.s3, 'ok'));

  return { runCommand, say, line, prepare };
}
