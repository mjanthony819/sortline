// Sortline model inference - exact JS port of train_model_asf.py math.
// Multinomial naive Bayes over unigram+bigram tokens; weights from model.json.
// Static import so the Forge webpack bundle inlines the weights (native
// runtime has no access to loose files). model-data.js is generated from
// model.json (same weights) as a plain JS module: JSON import attributes
// break under webpack's module interop.
import modelData from './model-data.js';
const model = modelData;

const TOKEN_RE = /[a-z0-9]+/g;

export function tokenize(text) {
  const toks = (text.toLowerCase().match(TOKEN_RE) || []).filter((t) => t.length >= 2);
  const feats = [...toks];
  for (let i = 0; i < toks.length - 1; i++) feats.push(toks[i] + '_' + toks[i + 1]);
  return feats;
}

// Returns { type, confidence, probs: {class: p}, topTerms: [{term, weight}] }
export function classify(text) {
  const { classes, vocab, logprior, loglik } = model;
  const counts = new Map();
  for (const t of tokenize(text)) {
    const i = vocab[t];
    if (i !== undefined) counts.set(i, (counts.get(i) || 0) + 1);
  }
  const scores = classes.map((c, ci) => {
    let s = logprior[ci];
    for (const [i, k] of counts) s += k * loglik[ci][i];
    return s;
  });
  const m = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - m));
  const z = exps.reduce((a, b) => a + b, 0);
  const probsArr = exps.map((e) => e / z);
  let best = 0;
  for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;

  // why-terms: tokens with the largest advantage for the winning class
  const indexToTerm = new Array(Object.keys(vocab).length);
  for (const [t, i] of Object.entries(vocab)) indexToTerm[i] = t;
  const invVocab = new Map();
  for (const [i, k] of counts) {
    const others = classes.map((_, ci) => (ci === best ? -Infinity : loglik[ci][i]));
    const adv = (loglik[best][i] - Math.max(...others)) * k;
    const t = indexToTerm[i];
    invVocab.set(t, (invVocab.get(t) || 0) + adv);
  }
  const topTerms = [...invVocab.entries()]
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([term, weight]) => ({ term, weight }));

  const probs = {};
  classes.forEach((c, ci) => { probs[c] = probsArr[ci]; });
  return { type: classes[best], confidence: probsArr[best], probs, topTerms };
}
