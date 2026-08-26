# P7-12 — Diff artifact verification

`DiffCommand.test.ts` creates new temporary artifacts through the production writers, then reads the command's
actual JSON output back with `JSON.parse`. It covers changed and identical simulation reports, feature-category
changes, multi-mode additions/removals, Outcome Library bundles, and Stake Engine exports. The corresponding
focused rerun is recorded in [targeted-verification.md](targeted-verification.md).
