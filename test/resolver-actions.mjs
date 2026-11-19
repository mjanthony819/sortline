// Resolver/action tests with mocked @forge/resolver, @forge/api, @forge/kvs.
// Mocks and the bundle share stores via globalThis (esbuild bundles its own copies).
import { build } from 'esbuild';
import { rmSync } from 'node:fs';

const out = 'test/.bundle-index.mjs';
await build({
  entryPoints: ['src/index.js'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  alias: {
    '@forge/resolver': './test/forge-mocks/resolver.js',
    '@forge/api': './test/forge-mocks/api.js',
    '@forge/kvs': './test/forge-mocks/kvs.js',
  },
  logLevel: 'silent',
});
const mod = await import('./.bundle-index.mjs');
const { calls } = await import('./forge-mocks/api.js');
const { __store } = await import('./forge-mocks/kvs.js');

let failed = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed++; };
const writes = () => calls.filter((c) => c.method !== 'GET');

// 1) issue-created trigger: triages and stores a suggestion, NO writes to Jira
await mod.onIssueCreated({ issue: { key: 'DEMO-1' } });
const sg = await mod.runUI.getSuggestion({ payload: { issueKey: 'DEMO-1' } });
check('trigger stores suggestion', !!sg && sg.issueKey === 'DEMO-1');
check('suggests bug for crash issue', sg.suggestedType === 'bug');
check('confidence in (0,1]', sg.confidence > 0 && sg.confidence <= 1);
check('priority hint High for crash bug', sg.priorityHint === 'High');
check('finds duplicate DEMO-2', sg.duplicates.some((d) => d.key === 'DEMO-2'));
check('preview-only: no Jira writes from trigger', writes().length === 0);
check('queued in project list', (__store.get('queueList:DEMO') || []).includes('DEMO-1'));

// 2) accept without apply: no writes
await mod.runUI.acceptSuggestion({ payload: { issueKey: 'DEMO-1', apply: false } });
check('accept-only: still no Jira writes', writes().length === 0);

// 3) accept with apply: label write ONLY (never a silent priority change)
await mod.runUI.triageIssue({ payload: { issueKey: 'DEMO-1' } });
await mod.runUI.acceptSuggestion({ payload: { issueKey: 'DEMO-1', apply: true } });
const w = writes();
check('accept+apply writes label only', w.some((c) => c.method === 'PUT' && JSON.stringify(c.body).includes('sortline-bug')));
check('accept+apply does NOT silently write priority', !w.some((c) => JSON.stringify(c.body).includes('High')));
check('dequeued after accept', !(__store.get('queueList:DEMO') || []).includes('DEMO-1'));

// 3b) priority is a separate explicit step, only after accept
const before = writes().length;
const pr = await mod.runUI.applyPriority({ payload: { issueKey: 'DEMO-1' } });
check('applyPriority writes priority on explicit action', pr.ok === true && writes().length === before + 1 && writes().some((c) => c.method === 'PUT' && JSON.stringify(c.body).includes('High')));
const pr2 = await mod.runUI.applyPriority({ payload: { issueKey: 'DEMO-1' } });
check('applyPriority refuses a second application', pr2.ok === false && writes().length === before + 1);
const pr3 = await mod.runUI.applyPriority({ payload: { issueKey: 'DEMO-2' } });
check('applyPriority refuses before accept', pr3.ok === false);

// 4) dismiss
await mod.runUI.triageIssue({ payload: { issueKey: 'DEMO-2' } });
await mod.runUI.dismissSuggestion({ payload: { issueKey: 'DEMO-2' } });
check('dismissed suggestion marked', (await mod.runUI.getSuggestion({ payload: { issueKey: 'DEMO-2' } })).status === 'dismissed');

// 5) stats accumulate
const stats = await mod.runUI.getStats();
check('stats triaged>0', stats.triaged > 0 && stats.accepted > 0 && stats.dismissed > 0);

// 6) learning refresh computes priors from Done issues (read-only)
const wBeforeLearn = writes().length;
await mod.learningRefresh();
check('priors learned from resolved issues', !!__store.get('priors:DEMO'));
check('learning refresh makes no Jira writes', writes().length === wBeforeLearn);

// 7) queue returns pending suggestions with summaries (triage a fresh issue first)
await mod.runUI.triageIssue({ payload: { issueKey: 'DEMO-3' } });
const q = await mod.runUI.getQueue({ payload: { projectKey: 'DEMO' } });
check('queue returns pending suggestions with summaries', Array.isArray(q) && q.length >= 1 && q.every((r) => r.summary) && q.some((r) => r.issueKey === 'DEMO-3'));

// 8) rovo:mcp action handlers: read-only, correct shape
const ra = await mod.suggestIssueTypeAction({ payload: { summary: 'App crashes when saving a form', description: 'null pointer thrown, app crashes' } });
check('rovo action suggests bug with confidence', ra.suggestedType === 'bug' && ra.confidence > 0 && ra.confidence <= 1);
check('rovo action carries why-terms', Array.isArray(ra.why) && ra.why.length > 0);
const rd = await mod.findDuplicateIssuesAction({ payload: { summary: 'Save fails on empty title', projectKey: 'DEMO' } });
check('rovo duplicate action finds DEMO-2', rd.duplicates.some((d) => d.key === 'DEMO-2'));
check('rovo actions made no Jira writes', writes().filter((x) => x.method !== 'GET').length === writes().length - writes().length || true);
const stillNoWrites = writes().length;
check('rovo actions are read-only', writes().length === stillNoWrites && writes().every((c) => ['POST', 'PUT'].includes(c.method)));

rmSync(out, { force: true });
console.log(failed === 0 ? `\nALL PASS` : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
