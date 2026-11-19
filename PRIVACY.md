# Sortline Privacy Policy

Last updated: November 19, 2026

Sortline is a Jira app built on Atlassian Forge. This policy describes what data the app handles.

## What the app processes

When an issue is created on a Jira site where Sortline is installed, the app reads the issue summary and description to classify it (bug, feature, or documentation) and stores the resulting suggestion in Atlassian-hosted Forge storage (KVS) on the same site, together with triage metadata (confidence, decision state, timestamps, and queue statistics).

## Where data is stored

All app data is stored inside Atlassian infrastructure (Forge KVS) attached to your Jira site. No issue content or other data is sent to any external service. The classifier is a model bundled with the app; classification runs entirely inside Atlassian's Forge runtime. The app makes no external network calls.

## Data retention and deletion

Stored suggestions and statistics remain until they are acted on or the app is uninstalled. Uninstalling the app removes the app's stored data from Forge storage.

## Personal data

Sortline does not collect or store user account identifiers or profiles. Issue text it processes may incidentally contain personal data entered by your users in Jira; that text never leaves Atlassian infrastructure.

## Contact

Questions: mjanthony819@gmail.com
