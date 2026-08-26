# P7-18 residual public CLI surface

The public CLI deliberately exposes capability-oriented workflows only. The historical
`outcomelibrary`, `outcomesource`, and `stakeengine` handler namespaces remain private implementation
delegates; their supported workflows are reached through `generate`, `sample`, `report`, `diff`,
`export`, `import`, and `validate`.

`tests/cli/residualPublicSurface.contract.test.ts` compares the production registration factory with
the Phase 7 executable inventory map and the maintained CLI guide. It also sends unknown command,
missing argument, invalid target, invalid format, unknown source, and unknown path requests through
the real dispatcher, asserting actionable messages without stacks, `ENOENT`, or source-file leakage.
`publicCommandTree.test.ts` separately checks that the top-level help omits private namespaces and
that the delegated `generate` and `sample` help trees render their public command names.

The bounded rerun transcript is retained in [TRANSCRIPT.md](TRANSCRIPT.md).
