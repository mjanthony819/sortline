#!/usr/bin/env python3
"""Fetch public ASF Jira issues (anonymous REST API) for Sortline training data.

License basis: Apache-2.0 defines issue-tracker submissions to ASF projects as
Contributions; ASF public-archives policy deems issue-report content public
without conditions. We keep only summary/description/label fields, never
redistribute this file, and ship learned model weights only.
"""
import json, time, urllib.parse, urllib.request, hashlib, re, sys

PROJECTS = ['HADOOP', 'SPARK', 'KAFKA', 'FLINK', 'HBASE', 'LUCENE']
# (label, jql issuetype clause, per-project target)
CLASSES = [
    ('bug', 'issuetype = Bug', 200),
    ('feature', 'issuetype in ("New Feature", Improvement)', 400),
    ('docs', 'issuetype in (Documentation, Task) AND summary ~ "document*"', 34),
]
BASE = 'https://issues.apache.org/jira/rest/api/2/search'
FIELDS = 'summary,description,issuetype,status,resolution,labels,created'
UA = {'User-Agent': 'sortline-research (personal hackathon project)'}

def fetch(jql, want):
    out, start = [], 0
    while len(out) < want:
        n = min(100, want - len(out))
        qs = urllib.parse.urlencode({'jql': jql + ' ORDER BY created DESC',
                                     'fields': FIELDS, 'maxResults': n, 'startAt': start})
        req = urllib.request.Request(BASE + '?' + qs, headers=UA)
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=40) as r:
                    d = json.load(r)
                break
            except Exception as e:
                if attempt == 2: raise
                time.sleep(2 * (attempt + 1))
        batch = d.get('issues', [])
        if not batch: break
        out.extend(batch)
        start += len(batch)
        time.sleep(0.4)
    return out

def norm(t):
    return re.sub(r'\s+', ' ', (t or '').lower()).strip()

def main():
    seen = {}
    rows = []
    for label, clause, per in CLASSES:
        for proj in PROJECTS:
            issues = fetch(f'project = {proj} AND {clause}', per)
            kept = 0
            for i in issues:
                f = i['fields']
                text = norm(f.get('summary')) + ' ' + norm(f.get('description'))
                if len(text) < 40:  # skip near-empty
                    continue
                h = hashlib.sha1(text.encode()).hexdigest()
                hs = hashlib.sha1(norm(f.get('summary')).encode()).hexdigest()
                if h in seen or hs in seen:  # dedupe exact body or same-summary
                    continue
                seen[h] = seen[hs] = True
                rows.append({'key': i['key'], 'project': proj, 'label': label,
                             'issuetype': f['issuetype']['name'],
                             'summary': f.get('summary') or '',
                             'description': f.get('description') or '',
                             'created': f.get('created') or ''})
                kept += 1
            print(f'{proj:8s} {label:8s} fetched={len(issues):4d} kept={kept:4d}', flush=True)
    with open('data/asf_issues.jsonl', 'w') as fh:
        for r in rows:
            fh.write(json.dumps(r) + '\n')
    from collections import Counter
    print('TOTAL', len(rows), Counter(r['label'] for r in rows))

if __name__ == '__main__':
    main()
