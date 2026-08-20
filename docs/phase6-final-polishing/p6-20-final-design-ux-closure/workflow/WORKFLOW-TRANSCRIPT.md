# P6-20 Independent Workflow UX Audit — blocked before Studio

Audit date: 2026-08-20

Candidate worktree HEAD: `424c49e422880e6c91f35288181cce99caca3a81`
Requested product candidate: `6ee8bc9ddfac4845e1923d8b4cfef1e9ce8115d4`

This was a fresh first-time-user attempt. No product source, product documentation,
prior audit evidence, or prepared happy-path script was read. No browser profile was
created because Studio never served a client page.

## Natural interaction record

1. I started at the supplied candidate worktree and asked the public command to open
   Studio: `pokie dev`. The shell reported `pokie: command not found`.
2. I looked only for a locally available public command (not for source or docs), found
   `./node_modules/.bin/pokie`, and invoked `./node_modules/.bin/pokie dev`. It showed
   the public usage prompt requiring `<packageRoot>`; no Studio process was started.
3. Question/recovery: as a first-time user launching from the supplied candidate
   worktree, should that worktree itself be the package root? I used the visible CLI
   affordance and ran the single actual launch attempt:
   `./node_modules/.bin/pokie dev .`.
4. Destination/dead end: the command terminated before opening Studio with:
   `"package.json" is missing a "pokie.entry" field. Add e.g. {"pokie": {"entry":
   "./dist/index.js"}}.`

## Result and limits

The supplied worktree does not provide a runnable first-time Studio entrypoint at its
root. The stated audit rules prohibit locating an undocumented alternate root by
reading source, docs, earlier evidence, or a prepared script; they also prohibit
fabricating UI interactions or screenshots. Consequently project creation, editing,
save/reopen, Play, Simulation, Replay, Build, Outcome, Stake, navigation, keyboard,
and persistence could not be reached.

No screenshots are retained: there was no rendered Studio/client surface. The four
screenshots previously present here were removed as obsolete evidence from the rejected
run rather than retained as proof for this independent attempt.

## Companion checkout check

The read-only companion checkout was clean, but its exact committed HEAD was
`bdb303dacb22b0671eafa9cd398638c316057597`, not the required
`09a0889b8d335eeacbdb277c37376d97de96c268`.
