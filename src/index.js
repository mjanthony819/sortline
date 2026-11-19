// Sortline backend: resolvers, triggers, scheduled learning, rovo:mcp actions.
// Safety contract: preview-only. Triggers and reads never write to Jira.
// Jira writes happen ONLY on explicit human action (accept+apply = label only;
// priority is a separate explicit step via applyPriority).
// Namespace imports + default unwrap: under Forge's native-runtime webpack
// build, bare default imports of CJS packages arrive as namespace objects.
import * as ResolverNS from '@forge/resolver';
import * as ApiNS from '@forge/api';
import { kvs } from '@forge/kvs';
import { classify } from './model-infer.js';

// Deep-unwrap: webpack may wrap CJS exports twice ({ default: { default: X } }).
const unwrapDefault = (m) => { while (m && typeof m !== 'function' && m.default !== undefined) m = m.default; return m; };
const Resolver = unwrapDefault(ResolverNS);
const api = unwrapDefault(ApiNS);
const route = ApiNS.route ?? ApiNS.default?.route ?? ApiNS.default?.default?.route;

const resolver = new Resolver();

const PRIORITY_HINTS = {
  bug: ['crash', 'error', 'exception', 'fail', 'throws', 'broken', 'regression', 'cannot', "can't", 'unable', '500', 'data loss', 'corrupt'],
};

function priorityHint(text, label) {
  if (label !== 'bug') return null;
  const t = text.toLowerCase();
  const hits = PRIORITY_HINTS.bug.filter((w) => t.includes(w)).length;
  return hits >= 2 ? 'High' : null;
}

function issueText(issue) {
  const f = issue.fields || {};
  const desc = typeof f.description === 'string' ? f.description : adfToText(f.description);
  return `${f.summary || ''}\n${desc || ''}`.trim();
}

function adfToText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(adfToText).join(' ');
  return (node.text || '') + (node.content ? ' ' + adfToText(node.content) : '');
}

async function fetchIssue(issueKey) {
  const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}`);
  if (!res.ok) throw new Error(`issue fetch failed ${res.status}`);
  return res.json();
}

async function findDuplicates(projectKey, summary, selfKey) {
  const words = summary.split(/\s+/).filter((w) => w.length > 3).slice(0, 4);
  if (!words.length) return [];
  const jql = `project = ${projectKey} AND summary ~ "${words.join(' ')}" AND statusCategory != Done`;
  const res = await api.asApp().requestJira(route`/rest/api/3/search/jql?jql=${jql}&maxResults=10&fields=summary,status`);
  if (!res.ok) return [];
  const { issues = [] } = await res.json();
  const toks = new Set(summary.toLowerCase().match(/[a-z0-9]+/g) || []);
  return issues
    .filter((i) => i.key !== selfKey)
    .map((i) => {
      const other = new Set((i.fields.summary || '').toLowerCase().match(/[a-z0-9]+/g) || []);
      const inter = [...toks].filter((t) => other.has(t)).length;
      const similarity = inter / Math.max(1, Math.min(toks.size, other.size));
      return { key: i.key, summary: i.fields.summary, status: i.fields.status?.name, similarity };
    })
    .filter((d) => d.similarity > 0.3)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3);
}

async function jiraPutIssue(issueKey, body) {
  const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.log('[sortline] jiraPutIssue failed', res.status, txt.slice(0, 500));
    throw new Error(`Jira write failed ${res.status}`);
  }
}

async function getPriors(projectKey) {
  return (await kvs.get(`priors:${projectKey}`)) || null;
}

// Core triage: classify + hint + duplicates, store preview-only suggestion.
async function triageOne(issue) {
  const projectKey = issue.fields?.project?.key || 'UNKNOWN';
  const text = issueText(issue);
  const { type, confidence, probs, topTerms } = classify(text);
  const priors = await getPriors(projectKey);
  let adjConf = confidence;
  if (priors && priors[type]) adjConf = Math.min(0.99, confidence * (1 + priors[type] * 0.1));
  const duplicates = await findDuplicates(projectKey, issue.fields?.summary || '', issue.key);
  const sug = {
    issueKey: issue.key,
    projectKey,
    summary: issue.fields?.summary || '',
    suggestedType: type,
    confidence: adjConf,
    probs,
    currentType: issue.fields?.issuetype?.name || null,
    priorityHint: priorityHint(text, type),
    topTerms,
    duplicates,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  await kvs.set(`suggestion:${issue.key}`, sug);
  console.log('[sortline] suggestion stored', JSON.stringify({ issueKey: issue.key, projectKey, suggestedType: type, confidence: adjConf, duplicates: duplicates.length }));
  const list = (await kvs.get(`queueList:${projectKey}`)) || [];
  if (!list.includes(issue.key)) {
    list.unshift(issue.key);
    await kvs.set(`queueList:${projectKey}`, list.slice(0, 200));
  }
  await bumpStat('triaged');
  if (duplicates.length) await bumpStat('duplicatesFound');
  return sug;
}

// --- resolvers (UI) ---

resolver.define('getSuggestion', async ({ payload }) => {
  const s = (await kvs.get(`suggestion:${payload.issueKey}`)) || null;
  console.log('[sortline] getSuggestion', payload.issueKey, s ? 'hit' : 'miss');
  return s;
});

resolver.define('triageIssue', async ({ payload }) => {
  const issue = await fetchIssue(payload.issueKey);
  return triageOne(issue);
});

resolver.define('getQueue', async ({ payload }) => {
  const { projectKey } = payload;
  const list = (await kvs.get(`queueList:${projectKey}`)) || [];
  const out = [];
  for (const key of list.slice(0, 50)) {
    const s = await kvs.get(`suggestion:${key}`);
    if (s && s.status === 'pending') out.push(s);
  }
  return out;
});

async function dequeue(projectKey, issueKey) {
  const list = (await kvs.get(`queueList:${projectKey}`)) || [];
  const next = list.filter((k) => k !== issueKey);
  await kvs.set(`queueList:${projectKey}`, next);
}

resolver.define('acceptSuggestion', async ({ payload }) => {
  const { issueKey, apply } = payload;
  const s = await kvs.get(`suggestion:${issueKey}`);
  if (!s) return { ok: false, error: 'no suggestion' };
  if (apply) {
    // explicit user action: apply the sortline label ONLY. Priority is a separate step.
    const label = `sortline-${s.suggestedType}`;
    await jiraPutIssue(issueKey, { update: { labels: [{ add: label }] } });
  }
  s.status = 'accepted';
  await kvs.set(`suggestion:${issueKey}`, s);
  await dequeue(s.projectKey, issueKey);
  await bumpStat('accepted');
  return { ok: true, applied: !!apply };
});

resolver.define('applyPriority', async ({ payload }) => {
  const { issueKey } = payload;
  const s = await kvs.get(`suggestion:${issueKey}`);
  if (!s) return { ok: false, error: 'no suggestion' };
  if (s.status !== 'accepted') return { ok: false, error: 'accept the suggestion first' };
  if (!s.priorityHint) return { ok: false, error: 'no priority hint on this suggestion' };
  if (s.priorityApplied) return { ok: false, error: 'priority already applied' };
  await jiraPutIssue(issueKey, { fields: { priority: { name: s.priorityHint } } });
  s.priorityApplied = s.priorityHint;
  await kvs.set(`suggestion:${issueKey}`, s);
  return { ok: true, applied: s.priorityHint };
});

resolver.define('dismissSuggestion', async ({ payload }) => {
  const s = await kvs.get(`suggestion:${payload.issueKey}`);
  if (!s) return { ok: false };
  s.status = 'dismissed';
  await kvs.set(`suggestion:${payload.issueKey}`, s);
  await dequeue(s.projectKey, payload.issueKey);
  await bumpStat('dismissed');
  return { ok: true };
});

resolver.define('getStats', async () => {
  return (await kvs.get('stats')) || { triaged: 0, accepted: 0, dismissed: 0, duplicatesFound: 0 };
});

async function bumpStat(key, n = 1) {
  const stats = (await kvs.get('stats')) || { triaged: 0, accepted: 0, dismissed: 0, duplicatesFound: 0 };
  stats[key] = (stats[key] || 0) + n;
  await kvs.set('stats', stats);
}

// --- triggers ---

export async function onIssueCreated(event) {
  const issue = event.issue;
  if (!issue?.fields) {
    const full = await fetchIssue(event.issue.key);
    await triageOne(full);
    return;
  }
  await triageOne(issue);
}

// Nightly: learn per-project type priors from recently resolved issues.
// Read-only: JQL search + KVS write. Never writes to Jira.
export async function learningRefresh() {
  const res = await api.asApp().requestJira(
    route`/rest/api/3/search/jql?jql=statusCategory = Done AND resolutiondate >= -90d&maxResults=100&fields=summary,description,issuetype,project`
  );
  if (!res.ok) return { ok: false };
  const { issues = [] } = await res.json();
  const byProject = {};
  for (const i of issues) {
    const pk = i.fields?.project?.key;
    if (!pk) continue;
    byProject[pk] = byProject[pk] || [];
    byProject[pk].push(i);
  }
  for (const [pk, list] of Object.entries(byProject)) {
    const counts = { bug: 0, docs: 0, feature: 0 };
    for (const i of list) {
      const { type } = classify(issueText(i));
      counts[type] += 1;
    }
    const total = Math.max(1, list.length);
    const priors = {};
    for (const c of Object.keys(counts)) priors[c] = counts[c] / total;
    await kvs.set(`priors:${pk}`, { priors, sampleSize: list.length, updatedAt: new Date().toISOString() });
  }
  return { ok: true, projects: Object.keys(byProject) };
}

// --- rovo:mcp actions (read-only tools for Rovo agents) ---

export async function suggestIssueTypeAction({ payload }) {
  const text = `${payload.summary || ''}\n${payload.description || ''}`.trim();
  if (!text) return { error: 'summary is required' };
  const { type, confidence, probs, topTerms } = classify(text);
  return {
    suggestedType: type,
    confidence,
    probs,
    why: topTerms.map((t) => t.term),
    priorityHint: priorityHint(text, type),
    note: 'Model suggestion only - no Jira data was changed.',
  };
}

export async function findDuplicateIssuesAction({ payload }) {
  const { summary, projectKey } = payload;
  if (!summary || !projectKey) return { error: 'summary and projectKey are required' };
  const duplicates = await findDuplicates(projectKey, summary, null);
  return { duplicates, note: 'Read-only search - no Jira data was changed.' };
}

export const runUI = resolver.getDefinitions();
