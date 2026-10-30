/* badges.js — provenance + origin gate matrix (supporting context, corner-anchored). */
import { $, esc } from './dom.js';
import { RULES } from '../content.js';

export function renderBadges(s) {
  const p = s.pkg;
  $('prov').innerHTML = [['entry', p.name], ['provenance', p.provenance], ['version', p.version], ['installed at', p.installedAt]]
    .map(([k, v]) => `<span>${k}</span><span class="v" ${k === 'provenance' && v === 'New' ? 'data-prov="new"' : ''}>${v ? esc(v) : '—'}</span>`).join('');
  const matrix = s.manifest.tools_entry ? RULES.gateMatrix : { loop_run: null, product: null, automation: null };
  $('gate').innerHTML = Object.entries(matrix)
    .map(([o, pol]) => `<div class="g"><span class="dot" data-p="${pol ?? ''}" aria-hidden="true"></span><span>${o}</span><span class="pol">${pol ?? 'omitted = forbidden'}</span></div>`).join('')
    + `<span class="note">${esc(s.manifest.tools_entry ? RULES.gatePolicy.gated_unless_granted : RULES.text.omittedOrigin)}</span>`;
}
