import {describeOutcomeLibraryBundleSource} from "../../../src/weightedoutcome/bundle/describeOutcomeLibraryBundleSource.js";

describe("describeOutcomeLibraryBundleSource", () => {
    it("reports a streaming, native canonical outcome source with explicit limitations", () => {
        const descriptor = describeOutcomeLibraryBundleSource();

        expect(descriptor.kind).toBe("native");
        expect(descriptor.streaming).toBe(true);
        expect(descriptor.limitations.length).toBeGreaterThan(0);
        expect(descriptor.limitations.every((limitation) => typeof limitation === "string" && limitation.length > 0)).toBe(true);
        expect(descriptor.limitations).toContain(
            "Draws are only ever atomic against this bundle's own current on-disk content -- a rebuild mid-read reports that the source content changed, never a silently stale result.",
        );
        expect(descriptor.limitations.join("\n")).not.toMatch(/PreGeneratedOutcomeSourceConflictError/);
    });
});
