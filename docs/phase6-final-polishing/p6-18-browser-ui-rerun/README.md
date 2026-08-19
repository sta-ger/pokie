# P6-18 independent cold-start Studio rerun — finding

Candidate: `407dac0a735967244b48bf5711b588d302a4ad23`
Date: 2026-08-19 (Europe/Warsaw)

## Result

**Finding `p6-18-mathematician-cold-start-workflow` (P1): blocked before the first workflow action.**

Using a fresh Chrome profile and a freshly started local Studio client from this
candidate, the initial Design Game screen displayed the starter model, then its
automatic validation immediately failed with:

> This validation request could not be completed. Try again. If it continues,
> choose the location again and retry.

The sole cold-start product framing was the persisted request's Valera/
mathematician framing. It could not be applied because the UI was not in a
valid, saveable state. No product documentation, source, roadmap, internal
terminology, or prepared browser script was consulted. Cold-start questions
asked before the failure: **none**.

## Reproduction boundary

1. Built the candidate locally and started its Studio Vite client with a fresh
   browser profile.
2. Opened the visible `Design Your Game` screen at `http://127.0.0.1:5173/`.
3. Observed the automatic validation failure before changing the starter model
   or invoking any workflow surface.

The browser-visible evidence is
[`studio-cold-start-validation-failure.png`](studio-cold-start-validation-failure.png).
Its SHA-256 is
`f13e5af04cda3eb9c4d9593a9b03105f9bc0695ec5d87ea110cb95e201707028`.

## Root cause

The independently started Studio client requires a reachable Studio server for
its initial validation, but the candidate's public CLI surface and package
scripts exposed no cold-start Studio-server launch path. The UI reports the
result as a location retry, which cannot resolve the unavailable server. This
blocks P6-18's required end-to-end cold-start workflow.
