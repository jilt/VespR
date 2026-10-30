/* hexes.js — paints hex cell materials from progress. Visibility stays with the scene.
   bindCells(cells, glass) is called by the scene once its cells exist. */
export function createHexPainter(store) {
  let cells = null, glassMat = null, solidMat = null, awaitMat = null;
  const bandOf = layer => layer < 6 ? 'manifest' : layer < 12 ? 'runtime' : layer < 18 ? 'integration' : 'write';

  function bindCells(list, glass) {
    cells = list; glassMat = glass;
    solidMat = new glass.constructor({ color: 0xa7d8dd, transparent: true, opacity: .58, side: glass.side, depthWrite: false });
    awaitMat = new glass.constructor({ color: 0xffa33d, transparent: true, opacity: .3, side: glass.side, depthWrite: false });
    paint(store.state);
  }

  function paint(s) {
    if (!cells) return;
    for (const c of cells) {
      const b = bandOf(c.layer);
      c.pane.material = b === 'write'
        ? (s.clearance === 'granted' ? solidMat : s.clearance === 'awaiting' ? awaitMat : glassMat)
        : (s.tests[b] ? solidMat : glassMat);
    }
  }
  return { bindCells, paint };
}
