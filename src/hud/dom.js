export const $ = id => document.getElementById(id);
export const reduced = matchMedia('(prefers-reduced-motion: reduce)');
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const el = (tag, props = {}, text) => { const n = Object.assign(document.createElement(tag), props); if (text !== undefined) n.textContent = text; return n };
