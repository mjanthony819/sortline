# Sortline model card

## What it is

A multinomial naive Bayes text classifier (unigram + bigram tokens, 20k vocab)
that suggests whether a Jira issue is a bug, a feature request, or a docs task.
It ships as learned weights only (src/model.json) and runs entirely inside the
Forge runtime - no external AI service, no data leaves the app.

## Training data and licensing (provisionally supported, well-sourced)

- Trained on 3,693 deduplicated issue summaries + descriptions fetched from
  public ASF Jira (issues.apache.org) projects HADOOP, SPARK, KAFKA, FLINK,
  HBASE, LUCENE via the anonymous read-only REST API. No private, restricted,
  or authenticated data.
- License basis (two ASF-authored sources):
  1. Apache License 2.0 itself (https://www.apache.org/licenses/LICENSE-2.0.html)
     defines a "Contribution" as work "intentionally submitted to Licensor for
     inclusion in the Work" and defines "submitted" to expressly include
     "communication on ... issue tracking systems that are managed by, or on
     behalf of, the Licensor for the purpose of discussing and improving the
     Work". Issues filed in an ASF project's Jira fit that definition verbatim;
     clause 5 licenses such Contributions under Apache-2.0 unless conspicuously
     marked "Not a Contribution".
  2. ASF's public archives policy
     (https://www.apache.org/foundation/public-archives.html): "All
     communication sent to our public forums - the public mailing lists, wikis,
     issue reporting systems and any other ASF contribution mechanism - is
     deemed to be published by the sender ... and made public without
     conditions."
- Residual caveats (honest position): this is a documented reading of ASF's
  own texts, not legal advice; the strongest residual gray area is whether raw
  issue text (as opposed to contributions incorporated into the Work) is
  redistributable verbatim, so the shipped model contains learned weights only,
  not raw issue text, and the training JSONL is not redistributed.
- Discarded fallback: the "Partha117/apache_bug_reports" Hugging Face dataset
  was evaluated as an alternative corpus and rejected - its rows are Eclipse
  AspectJ Bugzilla reports (Bugzilla IDs, Eclipse build identifiers), not ASF
  Jira data, so its apache-2.0 tag does not match its actual content and it was
  not used.
- Before any Marketplace/public distribution: re-verify this reading or
  replace the corpus; do not redistribute raw issue text.

## Evaluation (fresh corpus, 2026-11-17)

- Corpus: 3,693 issues (bug 1,193 / feature 2,335 / docs 165), deduped by
  normalized summary and full text.
- Leave-one-project-out (train on 5 projects, test the held-out project):
  mean 73.9% (FLINK 79.3, HBASE 75.1, KAFKA 75.9, HADOOP 71.9, SPARK 71.3,
  LUCENE 69.7). This is the honest generalization estimate.
- Random 80/20 split (seed 42): 79.0%.
- Majority baseline: 63.2%.
- The docs class is the weakest (small class, 165 examples).
- JS inference parity vs the Python trainer's exported weights: exact
  (max probability difference 0.00e+0 on decisive test cases).

## Known limits

- Short issues (a few words) can misclassify - vocabulary sparsity.
- Suggests only; the product contract is that nothing changes on an issue
  unless a human accepts (and priority is always a separate explicit step).
- Accuracy numbers above are corpus-held-out estimates, not per-site user
  accuracy.
