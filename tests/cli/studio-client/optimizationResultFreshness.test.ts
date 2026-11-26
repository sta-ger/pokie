import {isOptimizationResultStale} from "../../../cli/studio-client/src/domain/optimizationResultFreshness.js";

const base = {
    active: false,
    hasApplied: false,
    resultRevisions: ["rev-a"],
    sourceChangePresent: false,
};

describe("optimizer result freshness", () => {
    it("keeps an applied result current when the post-apply revision still matches", () => {
        expect(isOptimizationResultStale({...base, hasApplied: true, appliedRevision: "rev-b", currentRevision: "rev-b"})).toBe(false);
    });

    it("marks an applied result historical after a later design change", () => {
        expect(isOptimizationResultStale({...base, hasApplied: true, appliedRevision: "rev-b", currentRevision: "rev-c"})).toBe(true);
    });

    it("does not present an applied result as current when the post-apply revision was not recorded", () => {
        expect(isOptimizationResultStale({...base, hasApplied: true, currentRevision: "rev-c"})).toBe(true);
    });

    it("keeps an applied result while the current revision is still unknown", () => {
        expect(isOptimizationResultStale({...base, hasApplied: true, appliedRevision: "rev-b"})).toBe(false);
    });

    it("marks an unapplied result historical when its source revision differs", () => {
        expect(isOptimizationResultStale({...base, currentRevision: "rev-b"})).toBe(true);
    });

    it("keeps an unapplied result current when its source revision matches", () => {
        expect(isOptimizationResultStale({...base, currentRevision: "rev-a"})).toBe(false);
    });

    it("marks a result historical when only an unidentified source change is known", () => {
        expect(isOptimizationResultStale({...base, sourceChangePresent: true})).toBe(true);
    });

    it("marks a retained result without a recorded revision historical once the current revision is known", () => {
        expect(isOptimizationResultStale({...base, resultRevisions: [], currentRevision: "rev-current"})).toBe(true);
    });

    it("keeps a legacy result current only while no current revision or source-change signal exists", () => {
        expect(isOptimizationResultStale({...base, resultRevisions: []})).toBe(false);
    });

    it("never calls an active run stale", () => {
        expect(isOptimizationResultStale({...base, active: true, hasApplied: true, appliedRevision: "rev-b", currentRevision: "rev-c"})).toBe(false);
    });
});
