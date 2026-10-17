/** Opt-in bounded per-observation identities and half-open payout/actual-stake buckets.
 * These counters describe accepted subrounds; they do not imply logical-round coverage.
 */
export type SimulationObservationRequest = {
    events: string[];
    buckets: {min: number; max: number | null}[];
};
export type SimulationObservationCounters = {
    request: SimulationObservationRequest;
    observations: number;
    events: number[];
    buckets: number[];
};
export function emptyObservationCounters(request: SimulationObservationRequest): SimulationObservationCounters {
    if (!request || !Array.isArray(request.events) || !Array.isArray(request.buckets) || request.events.length > 100 || request.buckets.length > 100 ||
        request.events.some(event => typeof event !== "string" || !event.length || event.length > 256) || new Set(request.events).size !== request.events.length ||
        request.buckets.some(bucket => !bucket || !Number.isFinite(bucket.min) || bucket.min < 0 || bucket.max !== null && (!Number.isFinite(bucket.max) || bucket.max <= bucket.min))) throw new Error("Invalid bounded simulation observation request.");
    return {request: structuredClone(request), observations: 0, events: request.events.map(() => 0), buckets: request.buckets.map(() => 0)};
}
export function mergeObservationCounters(left?: SimulationObservationCounters, right?: SimulationObservationCounters): SimulationObservationCounters | undefined {
    const validate = (value: SimulationObservationCounters): void => {
        emptyObservationCounters(value.request);
        if (!Number.isSafeInteger(value.observations) || value.observations < 0 || value.events.length !== value.request.events.length || value.buckets.length !== value.request.buckets.length ||
            [...value.events, ...value.buckets].some(count => !Number.isSafeInteger(count) || count < 0 || count > value.observations)) throw new Error("Invalid simulation observation counts.");
    };
    if (left) validate(left);
    if (right) validate(right);
    if (!left) return right && structuredClone(right);
    if (!right) return structuredClone(left);
    if (JSON.stringify(left.request) !== JSON.stringify(right.request)) throw new Error("Cannot merge different simulation observation requests.");
    const result = {request: structuredClone(left.request), observations: left.observations + right.observations,
        events: left.events.map((count, index) => count + right.events[index]), buckets: left.buckets.map((count, index) => count + right.buckets[index])};
    validate(result);
    return result;
}
