# P6V-03 exact-candidate rendered rerun — inconclusive

Candidate: `2edc77378cb431b5245a17d8d8b933b9a69a3e6d` (the checkout `HEAD` before both launches). The candidate was built once before launch. Both launches used a new Studio HOME/XDG registry and a new visible Chromium profile, and launched this checkout only with:

```text
node ./dist/cli/pokie.js --no-open
```

## Rendered observations

1. Each fresh Home rendered an empty registry. Recommended, Random (seed `20260815`, then its visible **Use this blueprint**), Blank, and final Recommended all rendered successful draft replacement.
2. The Valera model rendered and completed literal-preview plus generated-reel weights, constraint, stack, preview, and Apply. The native picker selected a PNG through its focused rendered dialog; wild/scatter, paytable, bets, and free-games mechanics were saved.
3. In the managed Project, **Bets & Modes → Edit → Save** exited edit state for the metadata-default mode. A second **Edit → Cancel** also exited edit state, and the rendered **Mechanics** Edit control remained reachable immediately afterwards.
4. Rendered Play found an ordinary win and a configured free-games result. Simulation rendered RTP/results. The first launch completed exact Outcome Library generation, Stake Engine export, Close → Projects → Open persistence, with no rendered product error or console diagnostic.

## Replay limitation

The first launch rendered the Replay page, but it offered neither an enabled **Inspect** nor **Reproduce** action. The second fresh launch used the visible **Recreate from seed** form: entered seed `20260815`, clicked **Load** once, and waited for a rendered round artifact, reproducibility, completion, or error state. After 120 seconds there was no rendered success, pending, or error state and no replay request appeared in bounded Studio/network diagnostics. No replay action was repeated and no third launch was made.

This is a readiness/driver-inconclusive interaction result under the verification contract, not a product finding. Because Replay did not reach a semantic rendered result in this exact-candidate run, the complete P6V-03 checklist is not approved by this evidence.

## Bounded retained references

The controller-owned raw logs, profiles, projects, and generated outputs are intentionally not committed. Their bounded SHA-256 references are:

| Item | SHA-256 |
| --- | --- |
| First rendered transcript | `5c06b118cd47dca5ffbc9b82552ee3b0de88e15596e5f2a4f6594d118370d338` |
| First persisted Bets/Modes + Mechanics screenshot | `1bb28e7348abd9a704b62b70099196f49725e1a7f1937d0a3a05dbf4448958fb` |
| First Build/Export screenshot | `7d0390c97526640eccc7387e364056ccd1bd200481629fb1cb68fb8490b58827` |
| First reopened-persistence screenshot | `95d313b5bfab34819fa7d405db02f00bfb64b191df9bb6868db52b228696fa16` |
| Second bounded Replay-attempt transcript | `a45bf610dc7b872eb15db2831a4a81c36c2c72f323e20ae3fc47fa45756a0362` |

## Recovery closeout — passed

The retained limitation above was resolved in one further fresh, isolated rendered run on the same
candidate SHA, using the source checkout command `node ./dist/cli/pokie.js --no-open`. This is a
documentation-only descendant of the candidate; no product sources differ from the requested SHA.

The rendered Replay workflow is two-stage: **Load** accepted round `1` and seed `20260815`, exposing
its local **Run again** control; one click on that control completed with its local **Replay session**
result. This is the semantic success that the earlier bounded wait had not requested. Studio recorded
the rendered request as `POST /api/project/replays` `202`, followed by its `200` job read; these
diagnostics were not used to drive the UI. No browser console diagnostics or rendered product errors
were observed.

The same fresh run also completed Recommended, Random, and Blank draft replacement; literal-preview
and generated-reel apply; wild/scatter, paytable, metadata-default Bets & Modes **Edit → Save**,
**Edit → Cancel**, free-games mechanics, ordinary and free-games Play, Simulation RTP/results, Outcome
Library, Stake Engine export, and close/reopen persistence. Save and Cancel both exited their editor;
Mechanics Edit was reachable after Cancel.

Only checksums of the ephemeral run output are retained; no profiles, projects, generated exports,
raw logs, or screenshots were committed.

| Bounded recovery proof | SHA-256 |
| --- | --- |
| Concise rendered transcript | `cfc45e168ebf1d5418c38060d9e7e2e11941c1cf01b3065a1b374dcdca606ae5` |
| Bets & Modes / Mechanics rendered proof | `f7366d96860c941d7c4a146f61cb6f88ac21499fdb52761c580f58ba74f75891` |
| Replay rendered proof | `3667ae13b17bd5b510af086c5c4be1292ccfcfc3e208d90e8cb9d784a3d0bdc9` |
| Stake Engine export rendered proof | `c9b895ca0f86ebad728d8f5e237a2a464630af1d936efc6c69348965335d2a8f` |
| Reopened-persistence rendered proof | `186016b8c0f76f352a073199159147476dcc200f96bbe6074300bef5fd01e70f` |
