# P6-18 independent cold-start Studio rerun — finding

Candidate: `a400e007003f27a6b51c85f58aeefa9edf5443e9`
Run: 2026-08-19, fresh local Studio at `http://127.0.0.1:4632`, a fresh Chrome profile, no pre-existing Studio project opened.
Method: only visible Studio controls were read and activated through browser mouse/keyboard events; no product API, docs, source, roadmap, internal coaching, or prepared workflow script was used.

## Cold-start questions

None. The rendered UI exposed the project creation choices and the workflow controls without a question.

## Transcript and result

1. Opened Studio's rendered **Design Game** home screen and chose **New Blueprint → Recommended**.
2. Edited the displayed game id to `valera-mathematician` and game name to `Valera Mathematician`; the screen remained `Valid`.
3. Used the visible **Create Project** action. Studio saved the managed Blueprint and opened its Workspace.
4. Opened **Game Model → Edit**, entered the description `Cold-start browser verification`, and used **Save**. The rendered Game Model showed the saved description and `Valid` validation.
5. Opened **Play → New Play session**. The rendered Play page showed Bet `1.00`, **Spin**, and `No round played yet -- Spin to play.`
6. Entered `2` in the visible **Bet** control and blurred it. The control returned to `1.00`. Activated the visible **Spin** control once and waited a further 10 seconds. The rendered page still said `No round played yet -- Spin to play.` No error or round result was rendered.

This blocks the mandatory Play portion of the requested workflow, so the bounded rerun stopped immediately rather than attempting unrelated flows or retrying the same failed interaction. The required remediation and rerun remain outstanding.

## Evidence

`play-spin-no-round.png` is the single representative screen after the failed Spin. SHA-256:

`4e5d4a4f8cf0b078f6ba3d073e69fd5bb007dcbdfd90c78c0d068294adb75063`
