# PC-18 independent host rerun — candidate `fb041804833d0721f5d13a8f7e3633d8c79d047c`

2026-09-05 UTC. This is the bounded descendant record; runtime profiles,
generated projects, browser profiles, screenshots, and raw logs are not
retained in the repository.

## Required machine command

One serial complete-file command was issued against this checkout:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

The host executor returned the command preamble before its trailing Jest
summary, then the one runner process terminated. It is not counted as an
independently retained green result, and no duplicate Jest process was run.

`npm run build` completed before the browser work; `dist/cli/pokie.js` was
present and executable.

## Fresh rendered Studio recovery

Four fresh registry/browser-profile launches used exactly
`node ./dist/cli/pokie.js --no-open --port 0` from this checkout. No rendered
product error, browser exception, or failed network diagnostic occurred.

1. The repaired Home selector found `Create game`; the action entered its local
   validation/pending state. The former harness ended that operation before a
   semantic outcome, so it was not retried.
2. `Choose a different start` rendered the public starter, blank, generated,
   and open-saved choices. It did not render Blueprint or managed choices.
3. `Projects` changed the fragment to `#/home/projects`; the immediate observer
   still showed the design editor, so the selector was repaired rather than
   treating a fixed wait as a defect.
4. The repaired semantic wait rendered Projects with `Your projects`, `Add a
   game you already have`, `Browse…`, `Browse PAR sheet…`, and a disabled
   `Check game`; its clean context showed `Loading your projects…`. It offered
   no visible creation control for a managed Blueprint project.

The fourth launch exhausted this invocation's public-workflow budget before a
managed Blueprint, Outcome Library, dependent Stake, six role missions, or the
requested lifecycle variants could be reached. This is an inconclusive public
workflow record, not a product finding.

Runtime-only harness transcript checksums (not committed):

```text
recovery-3.json 5bb5a87e9fe9ca38cc0d4f34dc9d0c6e4c1b9be2afcd09262301aff75781c11d
recovery-4.json f7cc1e87beff6d5d7f41e1cafc2d5e6c558eb7be3ad71818c44b76dcf06cb60e
recovery-5.json 71ccdbed3888484cd53b145893ceba36d6e8518213f988e6c8ee72d943da91a3
recovery-6.json f5119bc98678d9fea59a4a1b313cf9ae75a39332ed475aafd4c49f6e331688a9
```
