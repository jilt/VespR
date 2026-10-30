import { $, esc, reduced } from './dom.js';

/** Transient feedback. k: ok | warn | err. Errors stay longer and use role=alert. */
export function toast({ k = 'ok', title, body = '', code }) {
  const n = document.createElement('div');
  n.className = 'toast'; n.dataset.k = k; n.setAttribute('role', k === 'err' ? 'alert' : 'status');
  n.innerHTML = `<b>${esc(title)}</b>${esc(body)}${code ? ` <code>${esc(code)}</code>` : ''}`;
  $('toasts').append(n);
  setTimeout(() => {
    if (reduced.matches) return n.remove();
    n.classList.add('out'); n.addEventListener('animationend', () => n.remove(), { once: true });
  }, k === 'err' ? 9000 : 5200);
}
