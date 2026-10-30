/* tests/e2e.mjs — headless end-to-end drive over Chrome DevTools Protocol.
   Zero deps (node >= 22 has WebSocket). Drives the public bus to completion,
   opens the survey, renders both views, and screenshots the plate.
   Run:  node tests/e2e.mjs   (needs `npm start` on :8097 or PORT env, and CHROME path). */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const PORT = process.env.PORT || 8097, URL_ = `http://localhost:${PORT}/`;
const CHROME = process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`;
const OUT = 'tests/out'; mkdirSync(OUT, { recursive: true });

const DBG = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--remote-debugging-port=${DBG}`, `--user-data-dir=/tmp/opencode/e2e-profile-${DBG}`, '--window-size=1400,900', URL_], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(); const events = [];
async function connect() {
  for (let i = 0; i < 40; i++) { try { const r = await fetch(`http://localhost:${DBG}/json`); const t = (await r.json()).find(x => x.type === 'page'); if (t) return t.webSocketDebuggerUrl } catch { } await sleep(250) }
  throw new Error('chrome did not start');
}
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })) });
const evalJs = async (expression, awaitPromise = true) => { const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails)); return r.result.value };
const errors = [];
try {
  ws = new WebSocket(await connect());
  await new Promise(r => ws.onopen = r);
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result) } else events.push(d) };
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
  ws.addEventListener('message', m => { const d = JSON.parse(m.data); if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map(a => a.value || a.description).join(' ')) });
  await sleep(2500);
  await evalJs(`localStorage.clear()`); await send('Page.navigate', { url: URL_ }); await sleep(2500);

  const step = async (label, js) => { const v = await evalJs(js); console.log(label.padEnd(34), JSON.stringify(v)); return v };
  await step('loaded', `({tier: document.getElementById('tierName').textContent, phase: __BELTER_PROGRESS.state.phase})`);

  // Phase 1, step 1: the claim form. First a header WITHOUT the v3 line → refused, sample spent, repair panel shown.
  await evalJs(`__BELTER_PROGRESS.emit('sample_surfaced')`); await sleep(500);
  // real keystrokes: focus must survive the 400 ms rail re-render and the caret must stay put
  await evalJs(`document.querySelector('#task form.claim input[name=name]').focus()`);
  for (const ch of 'ice fin') { await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }); await sleep(150); }
  await step('typing keeps focus', `({focused: document.activeElement === document.querySelector('#task form.claim input[name=name]'), value: document.querySelector('#task form.claim input[name=name]').value, caret: document.querySelector('#task form.claim input[name=name]').selectionStart})`);
  const typeClaim = async (name, desc, man) => evalJs(`(()=>{const f=document.querySelector('#task form.claim'); const set=(n,v)=>{const e=f.elements[n]; e.value=v; e.dispatchEvent(new Event('input'))}; set('name',${JSON.stringify(name)}); set('description',${JSON.stringify(desc)}); set('manifest',${JSON.stringify(man)}); f.requestSubmit()})()`);
  await typeClaim('Ice Finder', 'Rank bodies by water-ice fraction.', 'name = "ice-finder"\nversion = "0.1.0"'); await sleep(300);
  await step('claim without v3 refused', `({pending: __BELTER_PROGRESS.state.pending, samples: __BELTER_PROGRESS.state.samples, fail: document.getElementById('failPanel').hidden === false, code: document.querySelector('#failPanel .fcode')?.textContent})`);
  // now a legacy shape → jam
  await evalJs(`__BELTER_PROGRESS.emit('sample_surfaced')`); await sleep(500);
  await typeClaim('Ice Finder', 'Rank bodies by water-ice fraction.', '[[host_api]]\nname = "ice-finder"'); await sleep(300);
  await step('legacy shape jams', `({jammed: true, legacyHits: __BELTER_PROGRESS.state.legacyHits, pending: __BELTER_PROGRESS.state.pending})`);
  await sleep(1900);
  // valid header → claim filed with the player's own name + sha256
  await evalJs(`__BELTER_PROGRESS.emit('sample_surfaced')`); await sleep(500);
  await typeClaim('Ice Finder', 'Rank bodies by water-ice fraction.', 'schema_version = "reborn.extension_manifest.v3"\nname = "ice-finder"\nversion = "0.1.0"'); await sleep(600);
  await step('claim filed', `({claim: __BELTER_PROGRESS.state.claim.name, digest: __BELTER_PROGRESS.state.claim.digest.slice(0,14), samples: __BELTER_PROGRESS.state.samples})`);
  // remaining four fields via the rail buttons (first option is the ok one); fragments show the player's tool id
  await evalJs(`__BELTER_PROGRESS.emit('sample_surfaced')`); await sleep(500);
  await step('fragment personalised', `document.querySelector('#task .opt').textContent.includes('ice.finder')`);
  for (let i = 0; i < 4; i++) {
    if (i) { await evalJs(`__BELTER_PROGRESS.emit('sample_surfaced')`); await sleep(500); }
    await evalJs(`document.querySelector('#task .opt:not(:disabled)').click()`);
    await sleep(200);
  }
  await step('after phase 1', `({phase: __BELTER_PROGRESS.state.phase, s1: __BELTER_PROGRESS.state.milestones.s1, handoverShown: !document.getElementById('handover').hidden})`);
  // stale click guard: pending=0 now, clicking an option must be a no-op
  await evalJs(`__BELTER_PROGRESS.emit('resource_mined', {key:'schema_version'})`);
  await step('stale resource_mined ignored', `__BELTER_PROGRESS.state.samples`);  // 5 = five accepted fields
  await evalJs(`document.querySelector('#handover button').click()`); await sleep(200);
  await step('handover acked', `__BELTER_PROGRESS.state.handover`);

  // Phase 2: spawn drones, pass tests via rail, grant clearance
  for (const [i, t] of ['envoy', 'guard', 'scribe'].entries()) await evalJs(`__BELTER_PROGRESS.emit('drone_spawned', {index:${i}, type:'${t}'})`);
  await sleep(300);
  for (let i = 0; i < 3; i++) { await evalJs(`document.querySelector('#task .opt:not(:disabled)').click()`); await sleep(250) }
  await step('tests', `({tests: __BELTER_PROGRESS.state.tests, clearance: __BELTER_PROGRESS.state.clearance, drones: document.querySelectorAll('#droneRow .drone[data-state="passed"]').length})`);
  await evalJs(`document.querySelector('#task .act.primary').click()`); await sleep(300);
  await step('after clearance', `({phase: __BELTER_PROGRESS.state.phase, s2: __BELTER_PROGRESS.state.milestones.s2})`);
  await evalJs(`document.querySelector('#handover button').click()`); await sleep(200);

  // Phase 3 via console: search, info, install (override), pin, review, promote
  const run = async cmd => { await evalJs(`(()=>{const i=document.getElementById('cli'); i.value=${JSON.stringify(cmd)}; document.getElementById('cliForm').requestSubmit()})()`); await sleep(300) };
  await run('ironclaw ironhub search ice');
  await run('ironclaw ironhub info ice-finder --kind skill');
  await step('digest shown = claim sha256', `document.getElementById('dgrid').textContent.slice(0,8) === __BELTER_PROGRESS.state.claim.digest.slice(7,15)`);
  // prepare must NOT execute
  await evalJs(`document.querySelector('#task .prep .act').click()`); await sleep(200);
  await step('prepare fills input, no run', `({input: document.getElementById('cli').value, tier: __BELTER_PROGRESS.state.trustTier})`);
  await evalJs(`document.getElementById('cli').value=''`);
  await run('ironclaw ironhub install ice-finder --kind skill');
  await step('override modal open', `document.getElementById('overrideModal').hasAttribute('open')`);
  await evalJs(`document.getElementById('ovAck').click()`); await sleep(400);
  await step('installed unpinned', `({tier: __BELTER_PROGRESS.state.trustTier, pinned: __BELTER_PROGRESS.state.pkg.pinned, ceiling: document.getElementById('ceilingRead').textContent})`);
  // wrong digest must be refused and preserve state
  await run('ironclaw ironhub install ice-finder --kind skill --expected-version "0.1.0" --expected-artifact-digest "sha256:0000" --force --acknowledge-unverified');
  await step('wrong digest preserved', `({tier: __BELTER_PROGRESS.state.trustTier, pinned: __BELTER_PROGRESS.state.pkg.pinned, name: __BELTER_PROGRESS.state.pkg.name})`);
  const d = await evalJs(`__BELTER_PROGRESS.state.pkg.digest`);
  await run(`ironclaw ironhub install ice-finder --kind skill --expected-version "0.1.0" --expected-artifact-digest "${d}" --force --acknowledge-unverified`);
  await step('pinned', `({pinned: __BELTER_PROGRESS.state.pkg.pinned, ceiling: document.getElementById('ceilingRead').textContent, req: document.getElementById('pkgRequirement').textContent})`);
  // review: open, scroll evidence into view, tick, promote
  await evalJs(`__BELTER_PROGRESS.emit('trust_promotion_requested', {})`); await sleep(300);
  await step('review body is the player skill', `document.getElementById('rvScroll').textContent.includes('# ice-finder')`);
  await step('review open, checks locked', `({open: document.getElementById('reviewModal').hasAttribute('open'), locked: [...document.querySelectorAll('#rvFlags input')].every(i=>i.disabled)})`);
  await evalJs(`document.querySelectorAll('#rvFlags .evid').forEach(b=>b.click())`); await sleep(900);
  await step('checks unlocked after evidence', `[...document.querySelectorAll('#rvFlags input')].map(i=>!i.disabled)`);
  await evalJs(`document.querySelectorAll('#rvFlags input').forEach(i=>{i.checked=true}); document.getElementById('rvFlags').dispatchEvent(new Event('input'))`);
  await evalJs(`document.getElementById('rvPromote').click()`); await sleep(300);
  await step('promoted', `({tier: __BELTER_PROGRESS.state.trustTier, review: __BELTER_PROGRESS.state.review})`);
  // atmosphere to 100
  for (let i = 0; i < 40; i++) await evalJs(`__BELTER_PROGRESS.emit('atmosphere_tick')`);
  await sleep(300);
  await step('complete', `({o2: __BELTER_PROGRESS.state.atmosphere, s3: __BELTER_PROGRESS.state.milestones.s3, seed: __BELTER_PROGRESS.state.reportSeed})`);
  const seed1 = await evalJs(`__BELTER_PROGRESS.state.reportSeed`);

  // let the scene catch up (drone return 3s + paths 2s + growth 16s), then survey
  console.log('waiting for scene catch-up…'); await sleep(24000);
  await evalJs(`[...document.querySelectorAll('#task .act')].find(b=>/survey/i.test(b.textContent)).click()`);
  await sleep(3500);
  await step('survey rendered', `({status: document.getElementById('svStatus').textContent, hasImg: !!document.getElementById('svImg').src, labels: [...document.querySelectorAll('#svLabels li')].map(l=>l.textContent)})`);
  const shot = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${OUT}/survey-modal.png`, Buffer.from(shot.data, 'base64'));
  const dataUrl = await evalJs(`(async()=>{const r=await fetch(document.getElementById('svImg').src);const b=await r.blob();return await new Promise(res=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.readAsDataURL(b)})})()`);
  writeFileSync(`${OUT}/survey-plate.png`, Buffer.from(dataUrl.split(',')[1], 'base64'));
  await evalJs(`document.querySelector('input[name="svView"][value="current"]').click()`); await sleep(3500);
  const dataUrl2 = await evalJs(`(async()=>{const r=await fetch(document.getElementById('svImg').src);const b=await r.blob();return await new Promise(res=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.readAsDataURL(b)})})()`);
  writeFileSync(`${OUT}/survey-plate-current.png`, Buffer.from(dataUrl2.split(',')[1], 'base64'));
  await step('survey state untouched', `({tier: __BELTER_PROGRESS.state.trustTier, s3: __BELTER_PROGRESS.state.milestones.s3})`);
  // reload preserves seed
  await send('Page.navigate', { url: URL_ }); await sleep(2500);
  await step('reload keeps identity', `({same: __BELTER_PROGRESS.state.reportSeed === ${JSON.stringify(seed1)}, s3: __BELTER_PROGRESS.state.milestones.s3, phase: __BELTER_PROGRESS.state.phase})`);
  // gameplay screenshot too
  const shot2 = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${OUT}/gameplay.png`, Buffer.from(shot2.data, 'base64'));
  // console `reset` wipes the save and reloads into a fresh run
  await run('reset'); await sleep(2500);
  await step('reset starts a new run', `({phase: __BELTER_PROGRESS.state.phase, claim: __BELTER_PROGRESS.state.claim.name, s3: __BELTER_PROGRESS.state.milestones.s3, saved: JSON.parse(localStorage.getItem('belter_progress_v1')).phase})`);
  console.log('\nJS errors:', errors.length ? errors : 'none');
  process.exitCode = errors.length ? 1 : 0;
} catch (e) { console.error('E2E FAILED:', e); process.exitCode = 1 }
finally { ws?.close(); chrome.kill() }
