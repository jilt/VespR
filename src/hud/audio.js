/* audio.js — soundtrack toggle. Off by default, starts only on a user gesture,
   remembers the choice. Nothing in the game depends on hearing it. The file is a
   3-minute track (src/audio/), so it loops as ambience; it is not event SFX. */
import { $ } from './dom.js';

const KEY = 'belter_music_v1';
export function createAudio() {
  const btn = $('musicBtn'); if (!btn) return { stop() {} };
  let el = null;
  const want = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } };
  const remember = v => { try { localStorage.setItem(KEY, v ? '1' : '0') } catch { /* private mode */ } };
  const paint = on => { btn.setAttribute('aria-pressed', String(on)); btn.textContent = on ? '♪' : '♩'; btn.setAttribute('aria-label', on ? 'Music on. Turn off' : 'Music off. Turn on') };
  const ensure = () => { if (el) return el; el = new Audio('src/audio/SynthPrincipal%20-%20Chart%20The%20Stars.wav'); el.loop = true; el.volume = .35; el.preload = 'none'; return el };
  const start = async () => { try { await ensure().play(); paint(true); remember(true) } catch { paint(false) } };   // autoplay refusal → stays off
  const stop = () => { el?.pause(); paint(false); remember(false) };
  btn.onclick = () => (el && !el.paused) ? stop() : start();
  paint(false);
  // Previously enabled: resume on the first gesture anywhere (browsers block autoplay before one).
  if (want()) { const once = () => { removeEventListener('pointerdown', once); removeEventListener('keydown', once); start() }; addEventListener('pointerdown', once); addEventListener('keydown', once) }
  return { stop };
}
