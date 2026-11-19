// Model regression checks: known behaviors of the trained classifier.
import { classify } from '../src/model-infer.js';

let failed = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed++; };

const bug = classify('NullPointerException thrown when saving a form, the app crashes with a stack trace');
check('crash text -> bug', bug.type === 'bug');
check('bug confidence > 0.5', bug.confidence > 0.5);
check('why-terms present for bug', bug.topTerms.length > 0 && bug.topTerms[0].weight > 0);

const feat = classify('Add support for CSV export on the reports page so users can download their data');
check('export request -> feature', feat.type === 'feature');

const docs = classify('Update the onboarding documentation and user guide with new screenshots');
check('documentation request -> docs', docs.type === 'docs');

// similarity used by duplicate detection (Jaccard over token overlap)
const sim = (a, b) => {
  const ta = new Set(a.toLowerCase().match(/[a-z0-9]+/g) || []);
  const tb = new Set(b.toLowerCase().match(/[a-z0-9]+/g) || []);
  const inter = [...ta].filter((t) => tb.has(t)).length;
  return inter / Math.max(1, Math.min(ta.size, tb.size));
};
const dupSim = sim('App crashes when saving a form with an empty title', 'Save fails on empty title');
const diffSim = sim('App crashes when saving a form with an empty title', 'Improve Kafka consumer rebalance protocol documentation');
check(`duplicate similarity above threshold (${dupSim.toFixed(3)} > 0.3)`, dupSim > 0.3);
check(`unrelated similarity below threshold (${diffSim.toFixed(3)} <= 0.3)`, diffSim <= 0.3);

console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
