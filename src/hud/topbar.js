/* topbar.js — O2 %, manifest completeness, hex integrity. */
import { $ } from './dom.js';
import { FIELDS } from '../content.js';
import { manifestCount, testCount } from '../store.js';

export function renderTopbar(s) {
  $('o2').textContent = Math.round(s.atmosphere * 100);
  $('o2Read').dataset.thin = s.trustTier !== 'none' && !s.pkg.pinned ? '1' : '0';
  $('manifestN').textContent = `${manifestCount(s.manifest)}/${FIELDS.length}`;
  $('hexN').textContent = Math.round(testCount(s) / 4 * 100);
}
