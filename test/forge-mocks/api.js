export const calls = (globalThis.__sortline_calls = globalThis.__sortline_calls || []);
export const route = (strings, ...vals) => {
  if (Array.isArray(strings) && strings.raw) return strings.reduce((a, s, i) => a + s + (vals[i] ?? ''), '');
  return strings; // plain-string path passed to route(path)
};
const issue = (key, summary, desc, extra = {}) => ({
  key,
  fields: {
    summary, description: desc,
    project: { key: 'DEMO' }, labels: [], status: { name: 'To Do' },
    issuetype: { name: 'Task' }, priority: { name: 'Medium' }, created: '2026-11-17T00:00:00.000+0000',
    ...extra,
  },
});
export const seed = {
  'DEMO-1': issue('DEMO-1', 'App crashes when saving a form with an empty title', 'Clicking save with no title throws a null pointer and the app crashes.'),
  'DEMO-2': issue('DEMO-2', 'Save fails on empty title', 'Saving without a title throws an exception and the page crashes.', { status: { name: 'In Progress' } }),
  'DEMO-3': issue('DEMO-3', 'Add CSV export to reports', 'Users want to download report data as CSV.'),
};
const api = {
  asApp: () => ({
    requestJira: async (path, opts = {}) => {
      const method = opts.method || 'GET';
      calls.push({ method, path, body: opts.body ? JSON.parse(opts.body) : null });
      if (method !== 'GET') return { ok: true, status: 204, json: async () => ({}) };
      if (path.startsWith('/rest/api/3/issue/')) {
        const key = path.split('/').pop().split('?')[0];
        return { ok: true, status: 200, json: async () => seed[key] };
      }
      if (path.startsWith('/rest/api/3/search/jql')) {
        const done = decodeURIComponent(path).includes('statusCategory = Done');
        return { ok: true, status: 200, json: async () => ({ issues: done ? [seed['DEMO-3']] : [seed['DEMO-2'], seed['DEMO-3']] }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    },
  }),
};
export default api;
