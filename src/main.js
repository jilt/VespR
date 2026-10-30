/* main.js — wires store → HUD → scene and exposes the integration surface.
   A rewards package registers itself through window.__BELTER_PROGRESS
   (or imports createStore directly if bundled together). See belter.d.ts. */
import { createStore } from './store.js';
import { mountHud } from './hud/index.js';
import { startScene } from './scene.js';

const store = createStore();
const bridge = mountHud(store);

window.__BELTER_PROGRESS = Object.freeze({
  get state() { return store.state },
  bus: store.bus,
  EVENTS: store.EVENTS,
  emit: store.emit,
  subscribe: store.subscribe,
  submitProof: store.submitProof,
  setProofSubmitter: store.setProofSubmitter,
  reset: store.reset,
  rules: store.rules,
});

bridge.attachScene(startScene(bridge));
