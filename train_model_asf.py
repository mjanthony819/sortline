#!/usr/bin/env python3
"""Train Sortline issue-type classifier (multinomial NB, unigrams+bigrams).

Exports model.json (vocab + log-weights) for exact-parity JS inference,
and runs honest evaluation: leave-one-project-out, seeded random split,
majority baseline. Pure stdlib so JS parity stays replicable.
"""
import json, math, random, re
from collections import Counter, defaultdict

CLASSES = ['bug', 'docs', 'feature']
ALPHA = 0.5
MAX_VOCAB = 20000
MIN_DF = 3

TOKEN_RE = re.compile(r'[a-z0-9]+')

def tokenize(text):
    toks = [t for t in TOKEN_RE.findall(text.lower()) if len(t) >= 2]
    feats = list(toks)
    feats += [toks[i] + '_' + toks[i+1] for i in range(len(toks) - 1)]
    return feats

def text_of(r):
    return (r['summary'] + '\n' + r['description']).strip()

def build_vocab(rows):
    df = Counter()
    for r in rows:
        df.update(set(tokenize(text_of(r))))
    vocab = sorted(t for t, c in df.items() if c >= MIN_DF)
    vocab = sorted(vocab, key=lambda t: -df[t])[:MAX_VOCAB]
    return {t: i for i, t in enumerate(vocab)}

def train(rows, vocab):
    n = len(vocab)
    class_docs = Counter()
    counts = {c: [0.0] * n for c in CLASSES}
    totals = Counter()
    for r in rows:
        c = r['label']
        class_docs[c] += 1
        for t in tokenize(text_of(r)):
            i = vocab.get(t)
            if i is not None:
                counts[c][i] += 1.0
                totals[c] += 1.0
    total_docs = sum(class_docs.values())
    logprior = [math.log(class_docs[c] / total_docs) for c in CLASSES]
    loglik = []
    for c in CLASSES:
        denom = totals[c] + ALPHA * n
        loglik.append([math.log((counts[c][i] + ALPHA) / denom) for i in range(n)])
    return {'classes': CLASSES, 'alpha': ALPHA, 'vocab': vocab,
            'logprior': logprior, 'loglik': loglik}

def predict(model, text):
    vocab = model['vocab']
    idx_counts = Counter()
    for t in tokenize(text):
        i = vocab.get(t)
        if i is not None:
            idx_counts[i] += 1
    scores = []
    for ci in range(len(model['classes'])):
        s = model['logprior'][ci]
        ll = model['loglik'][ci]
        for i, k in idx_counts.items():
            s += k * ll[i]
        scores.append(s)
    m = max(scores)
    exps = [math.exp(s - m) for s in scores]
    z = sum(exps)
    probs = [e / z for e in exps]
    best = max(range(len(scores)), key=lambda i: scores[i])
    return model['classes'][best], probs[best], probs

def evaluate(train_rows, test_rows):
    vocab = build_vocab(train_rows)
    model = train(train_rows, vocab)
    correct = 0
    per_class = defaultdict(lambda: [0, 0])
    for r in test_rows:
        pred, _, _ = predict(model, text_of(r))
        per_class[r['label']][1] += 1
        if pred == r['label']:
            correct += 1
            per_class[r['label']][0] += 1
    acc = correct / len(test_rows) if test_rows else 0.0
    return acc, {c: (v[0], v[1]) for c, v in per_class.items()}

def main():
    rows = [json.loads(l) for l in open('data/asf_issues.jsonl')]
    print('corpus', len(rows), Counter(r['label'] for r in rows))

    # majority baseline
    maj = Counter(r['label'] for r in rows).most_common(1)[0][1] / len(rows)
    print(f'majority baseline: {maj:.3f}')

    # leave-one-project-out
    projects = sorted(set(r['project'] for r in rows))
    lopo = {}
    for p in projects:
        tr = [r for r in rows if r['project'] != p]
        te = [r for r in rows if r['project'] == p]
        acc, pc = evaluate(tr, te)
        lopo[p] = acc
        print(f'LOPO {p:8s} acc={acc:.3f}  per-class={ {c: f"{v[0]}/{v[1]}" for c, v in pc.items()} }')
    print(f'LOPO mean: {sum(lopo.values())/len(lopo):.3f}')

    # seeded random split
    rng = random.Random(42)
    shuffled = rows[:]
    rng.shuffle(shuffled)
    cut = int(0.8 * len(shuffled))
    acc, pc = evaluate(shuffled[:cut], shuffled[cut:])
    print(f'random 80/20 (seed 42): {acc:.3f}  per-class={ {c: f"{v[0]}/{v[1]}" for c, v in pc.items()} }')

    # final model on all data
    vocab = build_vocab(rows)
    model = train(rows, vocab)
    out = {'classes': model['classes'], 'alpha': model['alpha'],
           'vocab': model['vocab'], 'logprior': model['logprior'], 'loglik': model['loglik']}
    with open('model.json', 'w') as fh:
        json.dump(out, fh, separators=(',', ':'))
    import os
    print('model.json bytes:', os.path.getsize('model.json'))

    # parity reference: fixed decisive cases with expected probs
    cases = [
        'NullPointerException when saving form with empty title, app crashes with stack trace',
        'Add support for CSV export on the reports page so users can download data',
        'Update the onboarding documentation and user guide screenshots',
        'Intermittent 500 error from the REST endpoint under heavy load, timeout exception',
    ]
    ref = []
    for t in cases:
        pred, conf, probs = predict(model, t)
        ref.append({'text': t, 'pred': pred, 'conf': conf, 'probs': probs})
    with open('parity_ref.json', 'w') as fh:
        json.dump(ref, fh, indent=1)
    for r in ref:
        print(f"parity case: pred={r['pred']:8s} conf={r['conf']:.3f} :: {r['text'][:60]}")

if __name__ == '__main__':
    main()
