/* survey/labels.js — pure label placement. Input: projected anchor points in
   plate pixel space plus visibility flags; output: placed labels with leader
   endpoints in the open margins, collisions resolved by dropping lower priority. */

/**
 * @param {Array<{id,text,priority,x,y,visible}>} cands  projected candidates
 * @param {{w:number,h:number,margin:number,lineH:number,charW:number,seed:number}} plate
 * @returns {Array<{id,text,x,y,lx,ly,side}>} placed labels (lx,ly = label anchor; x,y = target)
 */
export function placeLabels(cands, plate) {
  const { w, h, margin, lineH, charW } = plate;
  const visible = cands.filter(c => c.visible).sort((a, b) => b.priority - a.priority);
  // split by the subject's own centre (median target x), not the plate centre,
  // so an off-centre subject still sends half its labels to each margin
  const xs = visible.map(c => c.x).sort((a, b) => a - b);
  const cx = plate.split ?? (xs.length ? xs[Math.floor(xs.length / 2)] : w / 2);
  const slotsL = [], slotsR = [];
  const placed = [];
  for (const c of visible) {
    const side = c.x < cx ? 'L' : 'R';
    const slots = side === 'L' ? slotsL : slotsR;
    // nearest free vertical slot to the target y, on a lineH grid inside the margin band
    let best = null, bestD = Infinity;
    for (let y = margin + lineH; y <= h - margin; y += lineH * 1.6) {
      if (slots.some(s => Math.abs(s - y) < lineH * 1.4)) continue;
      const d = Math.abs(y - c.y); if (d < bestD) { bestD = d; best = y }
    }
    if (best === null) continue;                           // crowded: drop (lower priority arrives later)
    slots.push(best);
    const tw = c.text.length * charW;
    const lx = side === 'L' ? margin : w - margin - tw;
    placed.push({ id: c.id, text: c.text, x: c.x, y: c.y, lx, ly: best, side, tw });
  }
  // minimise crossings within a side: sort by target y and reassign slots monotonically
  for (const side of ['L', 'R']) {
    const group = placed.filter(p => p.side === side).sort((a, b) => a.y - b.y);
    const ys = group.map(p => p.ly).sort((a, b) => a - b);
    group.forEach((p, i) => p.ly = ys[i]);
  }
  return placed;
}
