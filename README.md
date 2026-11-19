# Sortline

ML issue triage for Jira, built on Atlassian Forge.

Sortline classifies new issues as bug / feature / docs the moment they are
created, flags likely duplicates, and queues every suggestion for human
review. Nothing is ever changed on an issue unless a person accepts a
suggestion - and setting a priority is always its own separate, explicit
action.

## What it does

- Classifies new issues on creation (Forge trigger) into bug / feature /
  docs with a confidence score and the words that drove the decision.
- Finds likely duplicates of new issues across the project.
- Shows a review queue (project page) and a per-issue panel: accept,
  accept + apply label, dismiss.
- Learns per-project type priors nightly from recently resolved issues
  (read-only scheduled job).
- Exposes two read-only tools to Rovo agents via a rovo:mcp module:
  suggest-issue-type and find-duplicate-issues. (Implemented and covered
  by unit tests; not runtime-verified because Rovo is not enabled on the
  free dev site used for this entry.)

## Safety model (preview-first)

- Triggers and reads never write to Jira.
- "Accept + apply label" writes only the `sortline-<type>` label.
- Priority is never changed silently: a separate "Set priority" button
  appears after accepting, backed by its own resolver that refuses to run
  before acceptance or twice.

## Built with AI assistance

Sortline was built by M J Anthony with AI coding assistance (design, code,
tests and this documentation were AI-assisted and human-reviewed). The
model itself is a classical naive Bayes classifier trained on public ASF
Jira data - no AI service is called at runtime.

## Model

See MODEL_CARD.md. Naive Bayes over unigram+bigram tokens trained on
public ASF Jira data; runs fully inside Forge (no external AI calls).

## Structure

- manifest.yml - Forge modules (project page, issue panel, trigger,
  scheduled trigger, rovo:mcp + actions), scopes
- src/index.js - resolvers, triggers, scheduled learning, rovo actions
- src/model-infer.js - JS inference (exact parity with the Python trainer)
- src/model.json - exported weights
- src/model-data.js and test/static-test/main.js are generated artifacts,
  not committed. Regenerate: `{ printf 'export default '; cat src/model.json; } > src/model-data.js`
  and `node test/render-ui.mjs` (which rebuilds test/static-test/main.js).
- ui/ - React custom UI; build-ui.mjs bundles to static/
- test/ - resolver/action tests (mocked Forge APIs), model regression,
  JS/Python parity, headless UI render check

## Local verification

    npm install
    node test/parity.mjs
    node test/resolver-actions.mjs
    node test/model-regression.mjs
    node test/render-ui.mjs   # needs puppeteer; writes a screenshot
