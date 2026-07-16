import {DeploymentRunTracker} from "../../../../../cli/studio-client/src/domain/deploymentRunTracker";

describe("DeploymentRunTracker", () => {
    it("returns a defined token from beginRun and reports the run as in flight", () => {
        const tracker = new DeploymentRunTracker();

        const token = tracker.beginRun();

        expect(token).toBeDefined();
        expect(tracker.isRunInFlight()).toBe(true);
    });

    it("refuses a second beginRun while one is already in flight (double submit / parallel runs)", () => {
        const tracker = new DeploymentRunTracker();

        const first = tracker.beginRun();
        const second = tracker.beginRun();

        expect(first).toBeDefined();
        expect(second).toBeUndefined();
    });

    it("allows a new run once the previous one has ended", () => {
        const tracker = new DeploymentRunTracker();

        const first = tracker.beginRun();
        tracker.endRun();
        const second = tracker.beginRun();

        expect(first).toBeDefined();
        expect(second).toBeDefined();
        expect(second).not.toBe(first);
        expect(tracker.isRunInFlight()).toBe(true);
    });

    it("endRun releases the in-flight slot", () => {
        const tracker = new DeploymentRunTracker();
        tracker.beginRun();

        tracker.endRun();

        expect(tracker.isRunInFlight()).toBe(false);
    });

    it("a token from beginRun is current until something invalidates it", () => {
        const tracker = new DeploymentRunTracker();
        const token = tracker.beginRun();

        expect(token).toBeDefined();
        expect(tracker.isCurrent(token as number)).toBe(true);
    });

    it("invalidate() makes a previously issued token stale (out-of-order/late response)", () => {
        const tracker = new DeploymentRunTracker();
        const token = tracker.beginRun() as number;

        tracker.invalidate(); // e.g. the target was changed while the request was in flight

        expect(tracker.isCurrent(token)).toBe(false);
    });

    it("invalidate() does not itself touch the in-flight flag — a genuinely pending request stays pending", () => {
        const tracker = new DeploymentRunTracker();
        tracker.beginRun();

        tracker.invalidate();

        expect(tracker.isRunInFlight()).toBe(true);
    });

    it("a second beginRun's token makes the first one stale (out-of-order response from an old run)", () => {
        const tracker = new DeploymentRunTracker();
        const firstToken = tracker.beginRun() as number;
        tracker.endRun();
        const secondToken = tracker.beginRun() as number;

        expect(tracker.isCurrent(firstToken)).toBe(false);
        expect(tracker.isCurrent(secondToken)).toBe(true);
    });

    it("simulates two overlapping requests resolving out of order: only the response matching the current token renders", () => {
        const tracker = new DeploymentRunTracker();

        // Request A begins, then (before it resolves) the user changes an input, invalidating it.
        const tokenA = tracker.beginRun() as number;
        tracker.invalidate();
        tracker.endRun(); // request A's own .then()/.catch() always runs, regardless of staleness

        // Request B begins (now allowed again, since A ended) and resolves normally.
        const tokenB = tracker.beginRun() as number;

        // A's late-arriving response, if it were to resolve now, must still be recognized as stale.
        expect(tracker.isCurrent(tokenA)).toBe(false);
        // B's own response is current.
        expect(tracker.isCurrent(tokenB)).toBe(true);
    });

    it("multiple invalidations before any run starts still leave a fresh beginRun current", () => {
        const tracker = new DeploymentRunTracker();

        tracker.invalidate();
        tracker.invalidate();
        tracker.invalidate();
        const token = tracker.beginRun();

        expect(token).toBeDefined();
        expect(tracker.isCurrent(token as number)).toBe(true);
    });
});
