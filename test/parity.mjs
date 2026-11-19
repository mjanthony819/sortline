// JS inference parity check against Python-exported reference predictions.
import { readFileSync } from 'node:fs';
import { classify } from '../src/model-infer.js';

const ref = JSON.parse(readFileSync(new URL('../../parity_ref.json', import.meta.url)));
let worst = 0;
let pass = true;
for (const c of ref) {
  const got = classify(c.text);
  const keys = Object.keys(got.probs); // model class order: ['bug','docs','feature']; ref probs is a list in that order
  let maxDiff = 0;
  keys.forEach((k, i) => { maxDiff = Math.max(maxDiff, Math.abs(got.probs[k] - c.probs[i])); });
  worst = Math.max(worst, maxDiff);
  const ok = got.type === c.pred && maxDiff < 1e-12;
  if (!ok) pass = false;
  console.log(`${ok ? 'PASS' : 'FAIL'} pred=${got.type} (expected ${c.pred}) maxProbDiff=${maxDiff.toExponential(2)} :: ${c.text.slice(0, 50)}`);
}
console.log(pass ? `PARITY OK (worst diff ${worst.toExponential(2)})` : 'PARITY FAILED');
process.exit(pass ? 0 : 1);
