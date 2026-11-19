// Mock @forge/bridge for local rendering tests
const sampleSuggestion = (issueKey, summary, type, conf, extra = {}) => ({
  issueKey, projectKey: 'DEMO', summary, suggestedType: type, confidence: conf,
  probs: { bug: 0.7, docs: 0.1, feature: 0.2 }, currentType: 'Task',
  priorityHint: null, topTerms: [],
  duplicates: [], createdAt: new Date().toISOString(), status: 'pending', ...extra,
});
const queue = [
  sampleSuggestion('DEMO-101', 'App crashes when saving a form with an empty title', 'bug', 0.87, {
    priorityHint: 'High',
    topTerms: [{ term: 'crash', weight: 0.42 }, { term: 'null pointer', weight: 0.31 }, { term: 'throws', weight: 0.22 }, { term: 'empty title', weight: 0.15 }],
    duplicates: [{ key: 'DEMO-087', summary: 'Save fails on empty title', status: 'To Do', similarity: 0.71 }],
  }),
  sampleSuggestion('DEMO-102', 'Add CSV export to the reports page', 'feature', 0.81, {
    currentType: 'Task',
    topTerms: [{ term: 'export', weight: 0.38 }, { term: 'csv', weight: 0.33 }, { term: 'download', weight: 0.21 }, { term: 'report', weight: 0.12 }],
  }),
  sampleSuggestion('DEMO-103', 'Update onboarding guide with new screenshots', 'docs', 0.64, {
    currentType: 'Story',
    topTerms: [{ term: 'guide', weight: 0.36 }, { term: 'documentation', weight: 0.28 }, { term: 'screenshots', weight: 0.19 }, { term: 'onboarding', weight: 0.14 }],
  }),
  sampleSuggestion('DEMO-104', 'Intermittent 500 from search endpoint under load', 'bug', 0.52, {
    topTerms: [{ term: '500', weight: 0.34 }, { term: 'intermittent', weight: 0.26 }, { term: 'endpoint', weight: 0.18 }, { term: 'timeout', weight: 0.11 }],
  }),
];
export const invoke = async (fn, payload) => {
  if (fn === 'getQueue') return queue;
  if (fn === 'getStats') return { triaged: 37, accepted: 12, dismissed: 5, duplicatesFound: 3 };
  if (fn === 'getSuggestion') return null;
  if (fn === 'triageIssue') return queue[0];
  if (fn === 'acceptSuggestion' || fn === 'dismissSuggestion' || fn === 'applyPriority') return { ok: true };
  return null;
};
export const view = {
  getContext: async () => ({
    moduleKey: 'sortline-project-page',
    extension: { project: { key: 'DEMO' }, issue: { key: 'DEMO-101' } },
  }),
};
