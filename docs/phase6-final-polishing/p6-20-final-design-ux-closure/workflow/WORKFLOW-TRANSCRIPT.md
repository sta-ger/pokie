# P6-20 independent workflow UX audit

Candidate audited: `6ee8bc9ddfac4845e1923d8b4cfef1e9ce8115d4`  
Companion checkout verified clean at: `09a0889b8d335eeacbdb277c37376d97de96c268`

## Result

Finding: the public first-time workflow cannot reach a usable Studio session for
the specified companion candidate. The public `pokie dev` launch rejected that
checkout before starting Studio because its `package.json` has no `pokie.entry`.
One fresh-profile public client session was then rendered as a recovery check,
but it could not connect because the required API was never able to start.

## Natural interaction transcript

1. As a first-time user, chose the public `pokie dev` workflow for the supplied
   `pokie-examples` checkout. **Destination:** launch validation. **Dead end:**
   the command stopped before opening Studio, reporting that the checkout's
   `package.json` lacks `pokie.entry`; no UI path was available to create,
   select, or repair a project.
2. Started exactly one fresh-profile, visible public Studio/client session from
   the candidate, pointed at the expected local API. **Destination:** client
   landing page. It rendered `Unable to connect` and `Couldn't connect: Failed
   to fetch`; Spin was disabled and all values were blank.
3. Question: what does the connection error mean and how can I recover?
   Opened **Technical details**. **Destination:** inline stack trace only. The
   rendered detail identified `createSession`/`ensureSession` fetch failure,
   but gave no user-facing remediation for the failed project launch.
4. Used **Retry** once. **Destination:** same disconnected state. This was the
   sole retry; it did not recover the unavailable API.
5. Used the visible **Start new session** affordance once, leaving the optional
   seed at its default empty state. **Destination:** same disconnected state;
   no session, project workflow, or enabled Spin action became available.

No further actions were repeated. Creation, editing, save/reopen, Play,
Simulation, Replay, Build, Outcome, Stake, navigation/path interactions,
tabs/steppers, keyboard/accessibility, back/forward, destructive recovery, and
persistence were not reachable from this public state.

## Rendered proof

The screenshots are direct captures of the fresh visible browser session; no
DOM or application state was injected.

- `screenshots/01-client-disconnected.png` — rendered disconnected landing state.
- `screenshots/02-technical-details.png` — expanded error detail.
- `screenshots/03-retry-still-disconnected.png` — one Retry attempt did not recover.
- `screenshots/04-new-session-unavailable.png` — Start new session did not recover.

See `CHECKSUMS.txt` for SHA-256 values. Screenshots include the browser chrome
because the audit used a genuinely fresh browser profile.
