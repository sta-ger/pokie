import type {MathDefinitionChange, MathDefinitionDiff} from "../../../src/diff/MathDefinitionDiff.js";
import {describeDefinitionComparison} from "../../../cli/studio-client/src/domain/definitionComparisonNotice.js";

function change(path: string, mathematical: boolean): MathDefinitionChange {
    return {
        path,
        classification: mathematical ? "mathematical" : "representation",
        mathematical,
        seededTraceImpact: false,
        before: {present: false, provenance: {authority: "test", status: "authored", authored: {present: false}}},
        after: {present: false, provenance: {authority: "test", status: "authored", authored: {present: false}}},
    };
}

function diff(status: MathDefinitionDiff["status"], changes: MathDefinitionChange[] = []): Pick<MathDefinitionDiff, "status" | "changes"> {
    return {status, changes};
}

describe("describeDefinitionComparison", () => {
    it("confirms a clean match only for an identical, fully compared definition", () => {
        expect(describeDefinitionComparison(diff("identical"))).toEqual({
            label: "no mathematical differences",
            detail: "The editable mathematical fields match.",
        });
    });

    it("counts mathematical differences instead of claiming a match", () => {
        expect(describeDefinitionComparison(diff("different", [change("/paytable/A/3", true)]))).toEqual({
            label: "different",
            detail: "1 mathematical field differs.",
        });
    });

    it("does not present an invalid comparison as a clean mathematical match", () => {
        const notice = describeDefinitionComparison(diff("invalid", [change("/validation/advanced/report", false)]));
        expect(notice.label).toBe("invalid");
        expect(notice.detail).toMatch(/failed validation/i);
    });

    it("explains metadata-only and incomplete comparisons", () => {
        expect(describeDefinitionComparison(diff("different", [change("/info/name", false)])).detail).toMatch(
            /representation, provenance or technical metadata/i,
        );
        expect(describeDefinitionComparison(diff("partial")).detail).toMatch(/could not be compared/i);
    });

    it("surfaces every terminal non-match status", () => {
        for (const status of ["unsupported", "failed", "cancelled"] as const) {
            expect(describeDefinitionComparison(diff(status)).label).toBe(status);
        }
    });
});
