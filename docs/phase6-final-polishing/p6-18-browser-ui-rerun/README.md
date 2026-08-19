# P6-18 independent cold-start Studio rerun — finding

Candidate: `a0b3ce4df1d6cca0c60df0e4f08a49e67ef3609d`
Date: 2026-08-19 (Europe/Warsaw)

## Result

**Finding `p6-18-mathematician-cold-start-workflow` (P1): the corrected public
Studio startup path fails before a local client can be opened.**

The independent rerun used the public command documented by the candidate:

```sh
npm run dev-studio-client
```

It completed `build-cli`, then stopped its backend readiness check. The concise
terminal evidence was:

```text
Usage: pokie <command>
Commands:
  ... (no `studio` command)
POKIE Studio stopped before it became available (exit 1).
```

The launcher runs `dist/cli/pokie.js studio --no-open --host 127.0.0.1 --port
3200`, but this candidate's built public CLI does not provide that command.
Consequently neither the Studio backend nor Vite client was available, so a
fresh browser UI could not begin the Valera/mathematician workflow. No UI
questions were reached and no remediation or affected-workflow rerun was
possible in this bounded run.

The prior screenshot from the earlier, pre-correction candidate was removed:
it is not evidence for this candidate.
