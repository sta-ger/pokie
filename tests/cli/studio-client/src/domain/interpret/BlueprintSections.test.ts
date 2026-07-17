import type {ValidationIssue} from "../../../../../../cli/studio-client/src/api/types";
import {classifyIssuesBySection, describeSectionStatus} from "../../../../../../cli/studio-client/src/domain/interpret/BlueprintSections";

function issue(code: string, severity: ValidationIssue["severity"] = "error"): ValidationIssue {
    return {code, severity, message: `${code} message`};
}

describe("classifyIssuesBySection", () => {
    it("buckets a representative issue code from every section into the right bucket", () => {
        const issues = [
            issue("blueprint-manifest-invalid-id"),
            issue("blueprint-reels-invalid"),
            issue("blueprint-rows-suspicious", "warning"),
            issue("blueprint-paylines-duplicate"),
            issue("blueprint-symbols-duplicate"),
            issue("blueprint-wilds-unknown-symbol"),
            issue("blueprint-reelstrips-invalid"),
            issue("blueprint-reelstripgeneration-invalid-seed"),
            issue("blueprint-symbolweights-invalid-weight"),
            issue("blueprint-weighting-dominant-symbol", "warning"),
            issue("blueprint-paytable-empty"),
            issue("blueprint-symbol-missing-payout"),
            issue("blueprint-availablebets-duplicate"),
        ];

        const {bySection, unclassified} = classifyIssuesBySection(issues);

        expect(bySection.basics.map((i) => i.code)).toEqual(["blueprint-manifest-invalid-id"]);
        expect(bySection.layout.map((i) => i.code)).toEqual(["blueprint-reels-invalid", "blueprint-rows-suspicious", "blueprint-paylines-duplicate"]);
        expect(bySection.symbols.map((i) => i.code)).toEqual(["blueprint-symbols-duplicate", "blueprint-wilds-unknown-symbol"]);
        expect(bySection.reels.map((i) => i.code)).toEqual([
            "blueprint-reelstrips-invalid",
            "blueprint-reelstripgeneration-invalid-seed",
            "blueprint-symbolweights-invalid-weight",
            "blueprint-weighting-dominant-symbol",
        ]);
        expect(bySection.paytable.map((i) => i.code)).toEqual(["blueprint-paytable-empty", "blueprint-symbol-missing-payout"]);
        expect(bySection.bets.map((i) => i.code)).toEqual(["blueprint-availablebets-duplicate"]);
        expect(unclassified).toEqual([]);
    });

    it("does not confuse blueprint-symbol-missing-payout with the symbols section", () => {
        const {bySection} = classifyIssuesBySection([issue("blueprint-symbol-missing-payout")]);
        expect(bySection.symbols).toEqual([]);
        expect(bySection.paytable).toHaveLength(1);
    });

    it("falls back an unrecognized code to unclassified instead of silently dropping it", () => {
        const structural = issue("blueprint-not-object");
        const {bySection, unclassified} = classifyIssuesBySection([structural]);
        expect(unclassified).toEqual([structural]);
        for (const issues of Object.values(bySection)) {
            expect(issues).toEqual([]);
        }
    });

    it("returns an empty bucket set for an empty issue list", () => {
        const {bySection, unclassified} = classifyIssuesBySection([]);
        expect(unclassified).toEqual([]);
        expect(Object.values(bySection).every((issues) => issues.length === 0)).toBe(true);
    });
});

describe("describeSectionStatus", () => {
    it("is neutral before Validate has ever produced a result", () => {
        expect(describeSectionStatus("basics", {status: "idle"})).toEqual({tone: "neutral", errorCount: 0, warningCount: 0});
        expect(describeSectionStatus("basics", {status: "loading"})).toEqual({tone: "neutral", errorCount: 0, warningCount: 0});
    });

    it("is neutral when validation itself failed (e.g. a network error)", () => {
        expect(describeSectionStatus("basics", {status: "error", message: "boom"})).toEqual({tone: "neutral", errorCount: 0, warningCount: 0});
    });

    it("is success for a section with no issues, even while another section has an error", () => {
        const view = {status: "invalid" as const, errors: [issue("blueprint-manifest-invalid-id")], warnings: []};
        expect(describeSectionStatus("bets", view)).toEqual({tone: "success", errorCount: 0, warningCount: 0});
        expect(describeSectionStatus("basics", view)).toEqual({tone: "error", errorCount: 1, warningCount: 0});
    });

    it("is warning (not error) for a section with only warnings, even when the overall status is invalid", () => {
        const view = {
            status: "invalid" as const,
            errors: [issue("blueprint-manifest-invalid-id")],
            warnings: [issue("blueprint-rows-suspicious", "warning")],
        };
        expect(describeSectionStatus("layout", view)).toEqual({tone: "warning", errorCount: 0, warningCount: 1});
    });

    it("is success for a clean section when the overall status is ok with warnings elsewhere", () => {
        const view = {status: "ok" as const, warnings: [issue("blueprint-rows-suspicious", "warning")]};
        expect(describeSectionStatus("bets", view)).toEqual({tone: "success", errorCount: 0, warningCount: 0});
        expect(describeSectionStatus("layout", view)).toEqual({tone: "warning", errorCount: 0, warningCount: 1});
    });
});
