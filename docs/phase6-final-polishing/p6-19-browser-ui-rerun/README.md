# P6-19 independent cold-start Studio verification

Candidate: `ab032f2b022aa5da5134efb4b5565e491303a16d`
Result: **finding** — the public Studio launch command did not start a server or render the Studio UI.

This was a fresh-profile, uncoached readiness launch. No product source, documentation, prior evidence, or audit automation was consulted. The public `npm run dev-studio-client` entry point stopped in its CLI build step with unresolved `pokie` imports. Consequently, Recommended creation/save/reopen, artwork, reels/stacks, Play, Simulation, Replay, Outcome generation, and Stake export could not be reached. No screenshot exists because no browser page was rendered.

The failure is reproducible from the concise command/output excerpt in `launch-transcript.txt`. The missing local package-resolution/build precondition must be remediated before a new fresh-profile UI launch; no retry was performed because the affected product state was unchanged.
