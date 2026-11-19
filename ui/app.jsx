import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke, view } from '@forge/bridge';

const C = {
  bg: '#16181d', card: '#1d2027', border: '#2c313b', text: '#e8eaf0', dim: '#9aa3b2',
  lime: '#c9f24b', bug: '#ff6b6b', feature: '#5eb1ff', docs: '#c792ea', warn: '#ffb454',
};
const TYPE_COLOR = { bug: C.bug, feature: C.feature, docs: C.docs };

const s = {
  page: { background: C.bg, minHeight: '100vh', padding: '18px 22px', fontFamily: 'Inter, -apple-system, "Segoe UI", sans-serif', color: C.text },
  header: { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  logo: { width: 38, height: 38, borderRadius: 10, background: C.lime, color: '#16181d', fontWeight: 800, fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  h1: { margin: 0, fontSize: 19, fontWeight: 700 },
  sub: { margin: '2px 0 0', fontSize: 12.5, color: C.dim },
  chip: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: '6px 13px', fontSize: 12.5, color: C.dim },
  chipNum: { color: C.lime, fontWeight: 700, marginLeft: 4 },
  card: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', marginBottom: 12 },
  row: { display: 'flex', alignItems: 'flex-start', gap: 10 },
  key: { color: C.dim, fontSize: 12, fontFamily: 'ui-monospace, monospace', paddingTop: 2 },
  summary: { flex: 1, fontSize: 14.5, fontWeight: 600 },
  badge: (t) => ({ background: `${TYPE_COLOR[t] || C.dim}22`, color: TYPE_COLOR[t] || C.dim, border: `1px solid ${TYPE_COLOR[t] || C.dim}55`, borderRadius: 6, padding: '2px 9px', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }),
  confWrap: { width: 90, height: 5, background: C.border, borderRadius: 3, marginTop: 6 },
  confBar: (conf) => ({ width: `${Math.round(conf * 100)}%`, height: '100%', background: C.lime, borderRadius: 3 }),
  confText: { fontSize: 11, color: C.dim, marginTop: 4, textAlign: 'right' },
  terms: { fontSize: 12.5, color: C.dim, marginTop: 9 },
  term: { display: 'inline-block', background: '#262b34', border: `1px solid ${C.border}`, borderRadius: 5, padding: '1px 7px', margin: '0 5px 3px 0', fontSize: 11.5, color: C.text },
  dup: { fontSize: 12, color: C.warn, marginTop: 8 },
  btns: { display: 'flex', gap: 8, marginTop: 10 },
  btn: { border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' },
  btnApply: { background: C.lime, color: '#16181d' },
  btnAccept: { background: 'transparent', color: C.lime, border: `1px solid ${C.lime}66` },
  btnDismiss: { background: 'transparent', color: C.dim, border: `1px solid ${C.border}` },
  empty: { textAlign: 'center', color: C.dim, padding: '60px 20px' },
  section: { fontSize: 13, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: 1, margin: '18px 0 10px' },
};

function Suggestion({ sg, onAct }) {
  const [busy, setBusy] = useState(false);
  const act = async (action, apply) => {
    setBusy(true);
    try {
      if (action === 'accept') await invoke('acceptSuggestion', { issueKey: sg.issueKey, apply });
      else if (action === 'applyPriority') await invoke('applyPriority', { issueKey: sg.issueKey });
      else await invoke('dismissSuggestion', { issueKey: sg.issueKey });
      onAct();
    } finally { setBusy(false); }
  };
  return (
    <div style={s.card}>
      <div style={s.row}>
        <span style={s.key}>{sg.issueKey}</span>
        <span style={s.summary}>{sg.summary || ''}</span>
        <div style={{ textAlign: 'right' }}>
          <span style={s.badge(sg.suggestedType)}>{sg.suggestedType}</span>
          <div style={s.confWrap}><div style={s.confBar(sg.confidence)} /></div>
          <div style={s.confText}>{Math.round(sg.confidence * 100)}% confidence</div>
        </div>
      </div>
      {sg.currentType && sg.currentType.toLowerCase() !== sg.suggestedType && (
        <div style={s.terms}>Filed as <b style={{ color: C.text }}>{sg.currentType}</b> - model suggests <b style={{ color: TYPE_COLOR[sg.suggestedType] }}>{sg.suggestedType}</b></div>
      )}
      {sg.topTerms && sg.topTerms.length > 0 && (
        <div style={s.terms}>
          Why: {sg.topTerms.filter((t) => t.weight > 0).slice(0, 5).map((t, i) => <span key={i} style={s.term}>{t.term}</span>)}
        </div>
      )}
      {sg.priorityHint && <div style={s.dup}>Severity signals suggest priority: {sg.priorityHint}</div>}
      {sg.duplicates && sg.duplicates.length > 0 && (
        <div style={s.dup}>
          Possible duplicates: {sg.duplicates.map((d) => `${d.key} (${Math.round(d.similarity * 100)}%)`).join(', ')}
        </div>
      )}
      {sg.status === 'accepted' ? (
        <div style={s.btns}>
          <span style={{ ...s.terms, marginTop: 0, alignSelf: 'center' }}>
            Accepted{sg.priorityApplied ? ` - priority set to ${sg.priorityApplied}` : ''}
          </span>
          {sg.priorityHint && !sg.priorityApplied && (
            <button
              style={{ ...s.btn, ...s.btnAccept }}
              disabled={busy}
              title={`Writes to Jira: sets priority to ${sg.priorityHint}`}
              onClick={() => act('applyPriority')}
            >
              Set priority: {sg.priorityHint}
            </button>
          )}
        </div>
      ) : sg.status === 'dismissed' ? (
        <div style={s.terms}>Dismissed</div>
      ) : (
        <div style={s.btns}>
          <button
            style={{ ...s.btn, ...s.btnApply }}
            disabled={busy}
            title={`Writes to Jira: adds label sortline-${sg.suggestedType} (labels only; priority is a separate step after accepting)`}
            onClick={() => act('accept', true)}
          >
            Accept + apply label
          </button>
          <button style={{ ...s.btn, ...s.btnAccept }} disabled={busy} title="Record the decision only; no Jira changes" onClick={() => act('accept', false)}>Accept only</button>
          <button style={{ ...s.btn, ...s.btnDismiss }} disabled={busy} onClick={() => act('dismiss')}>Dismiss</button>
        </div>
      )}
    </div>
  );
}

function ProjectPage({ context }) {
  const projectKey = context?.extension?.project?.key;
  const [queue, setQueue] = useState([]);
  const [stats, setStats] = useState({ triaged: 0, accepted: 0, dismissed: 0, duplicatesFound: 0 });
  const load = useCallback(async () => {
    const [q, st] = await Promise.all([
      invoke('getQueue', { projectKey }),
      invoke('getStats'),
    ]);
    setQueue(q || []);
    setStats(st || stats);
  }, [projectKey]);
  useEffect(() => { load().catch(() => {}); }, [load]);
  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.logo}>S</div>
        <div style={{ flex: 1 }}>
          <p style={s.h1}>Sortline</p>
          <p style={s.sub}>ML issue triage for {projectKey || 'this project'} - trained on real open-source issue data - suggestions only, nothing changes without your review</p>
        </div>
        <span style={s.chip}>Triaged <span style={s.chipNum}>{stats.triaged}</span></span>
        <span style={s.chip}>Accepted <span style={s.chipNum}>{stats.accepted}</span></span>
        <span style={s.chip}>Duplicates found <span style={s.chipNum}>{stats.duplicatesFound}</span></span>
      </div>
      <div style={s.section}>Triage queue ({queue.length})</div>
      {queue.length === 0 && (
        <div style={s.empty}>
          <p style={{ fontSize: 15, color: C.text }}>Queue is clear.</p>
          <p>New issues in this project are classified automatically and appear here for review. Nothing is changed on an issue unless you accept a suggestion.</p>
        </div>
      )}
      {queue.map((sg) => <Suggestion key={sg.issueKey} sg={sg} onAct={load} />)}
    </div>
  );
}

function IssuePanel({ context }) {
  const [sg, setSg] = useState(undefined);
  const [err, setErr] = useState(null);
  const issueKey = context?.extension?.issue?.key;
  const load = useCallback(async () => {
    let cur = await invoke('getSuggestion', { issueKey });
    if (!cur) cur = await invoke('triageIssue', { issueKey });
    setSg(cur);
  }, [issueKey]);
  useEffect(() => { load().catch((e) => { setErr(String((e && (e.message || e.error || e)) || 'invoke failed')); setSg(null); }); }, [load]);
  if (sg === undefined) return <div style={s.page}><div style={s.empty}>Analyzing issue...</div></div>;
  if (sg === null) return <div style={s.page}><div style={s.empty}>Could not analyze this issue.<div style={{marginTop:8,fontSize:11,color:'#ff8a8a'}}>{err}</div></div></div>;
  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.logo}>S</div>
        <div><p style={s.h1}>Sortline triage</p><p style={s.sub}>Model suggestion - nothing applied unless you accept</p></div>
      </div>
      <Suggestion sg={sg} onAct={load} />
    </div>
  );
}

function App() {
  const [context, setContext] = useState(null);
  useEffect(() => { view.getContext().then(setContext); }, []);
  if (!context) return <div style={s.page}><div style={s.empty}>Loading...</div></div>;
  const isPanel = context.moduleKey && context.moduleKey.includes('issue-panel');
  return isPanel ? <IssuePanel context={context} /> : <ProjectPage context={context} />;
}

createRoot(document.getElementById('root')).render(<App />);
