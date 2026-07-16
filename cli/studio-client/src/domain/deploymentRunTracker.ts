// Tracks a monotonically increasing "revision" for the Deployment tab's own run/preview state, plus
// whether a run is currently in flight — the one place that decides "is this response still relevant"
// and "is a new run currently allowed to start". Kept as a small, pure, DOM-free class specifically so
// it's unit-testable on its own (same "logic lives outside main.ts" convention every interpretX.ts
// module in this app follows), even though this one isn't a data transform.
//
// Every input that could invalidate an in-flight or already-rendered run — a different target
// selected, a mode added/removed/edited, or switching projects — must call invalidate(). Starting a
// brand new preview/deploy request calls beginRun() instead, which both invalidates whatever came
// before *and* claims the "in flight" slot; its own returned token is what a response is later checked
// against via isCurrent(). A response whose own token no longer matches the current revision is stale
// and must never be rendered — see main.ts's own usage.
export class DeploymentRunTracker {
    private revision = 0;
    private inFlight = false;

    // Called whenever an input that would invalidate any in-flight/already-rendered run changes (target
    // selection, mode add/remove/edit, project switch). Bumps the revision so any in-flight response
    // becomes stale; does not itself start a run or touch `inFlight` — a request already in flight when
    // this fires keeps running (there is nothing to cancel over plain fetch), it will just be ignored as
    // stale once it resolves, and endRun() still fires normally for it.
    public invalidate(): void {
        this.revision++;
    }

    // Called right before a new preview/deploy request is sent. Returns `undefined` — without bumping
    // the revision or starting anything — when a run is already in flight, so a double submit (a second
    // click before the first request has resolved) is a harmless no-op rather than a competing request;
    // the caller is expected to check for `undefined` and simply not send the request. Otherwise bumps
    // the revision (a fresh run invalidates whatever was previously shown, same as invalidate()), marks
    // a run as in flight, and returns the token this specific request's response must be checked
    // against via isCurrent() once it arrives.
    public beginRun(): number | undefined {
        if (this.inFlight) {
            return undefined;
        }
        this.revision++;
        this.inFlight = true;
        return this.revision;
    }

    // Always called once a run's response (success or failure) has been handled, whether or not it
    // turned out to be stale — a stale run still occupied the "in flight" slot and must release it so a
    // subsequent run is allowed to start.
    public endRun(): void {
        this.inFlight = false;
    }

    public isRunInFlight(): boolean {
        return this.inFlight;
    }

    // Whether `token` (returned by a prior beginRun()) still refers to the current revision — false once
    // any invalidate()/beginRun() has happened since that call, meaning the response this token belongs
    // to is stale and must not be rendered.
    public isCurrent(token: number): boolean {
        return token === this.revision;
    }
}
