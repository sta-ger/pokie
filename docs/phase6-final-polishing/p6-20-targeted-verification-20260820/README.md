# P6-20 current-candidate targeted verification

Verification ran at candidate evidence SHA
`36402eb306db295b15b6d502235b788cf35c147b`. Its product-source ancestor is
`3b1881f28b6dc32899c5ac96ea96dc06eddab8c6`; the descendant contains only
bounded verification evidence. Before and after the run, the supplied
read-only companion checkout was clean at
`b7b043e0e722da917f1b60c4f107c8cc35fdd725`.

The relative companion entry supplied in the request does not resolve from
this isolated candidate worktree, so its exact authoritative checkout was
bound with `POKIE_EXAMPLES_PATH` and passed by absolute path. One serial,
complete-file invocation ran all twelve requested files and exited `0`:

```sh
POKIE_EXAMPLES_PATH=/home/stager/Work/sta-ger/pokie-examples \\
  npm run test:targeted -- \\
  /home/stager/Work/sta-ger/pokie-examples/tests/ui.test.ts \\
  tests/cli/client/player/renderPlayer.test.ts \\
  tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.reelStripModeler.test.tsx \\
  tests/cli/studio-client/src/components/home/ProjectsPanel.test.tsx \\
  tests/cli/studio-client/src/components/project/PlayTab.test.tsx \\
  tests/cli/studio-client/src/components/project/ProjectDashboardPage.playWorkflow.test.tsx \\
  tests/cli/studio-client/src/components/project/ReplayTab.test.tsx \\
  tests/cli/studio-client/src/domain/blueprintFormOps.test.ts \\
  tests/cli/studio/StudioServer.test.ts \\
  tests/server/session/FileSessionRepository.test.ts \\
  tests/simulation/parallel/SimulationWorkerCoordinator.test.ts \\
  tests/stakeengine/StakeEngineBundleStreamingExporter.test.ts
```

The companion suite therefore exercised the committed pre-publication
`pokie-examples` candidate, not a hosted or installed copy. No browser rerun
was started: the retained current-candidate UI record at
`../p6-20-final-design-ux-closure/workflow/current-3b1881f/README.md`
already covers the unchanged product source and explicitly records that the
evidence-only descendant changes no candidate source.
