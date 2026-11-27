import {MathDefinitionDiffer} from "../../src/diff/MathDefinitionDiffer.js";
import type {MathDefinitionDiff, MathDefinitionSnapshot} from "../../src/diff/MathDefinitionDiff.js";
import {mathDefinitionDiffCiExitCode, summarizeMathDefinitionDiff} from "../../src/diff/MathDefinitionDiffSummary.js";

function snapshot(name: string, payout: number, revision: string): MathDefinitionSnapshot {
    const model = {
        info: {id: "test-game", name, version: "1.0.0", author: "Valera"},
        reels: 5,
        rows: 3,
        symbols: ["A"],
        paytable: {A: {3: payout}},
        reelStrips: [["A", "A", "A", "A", "A"]],
        availableBets: [1],
        maxWinPolicy: {type: "none", authority: "test", scope: "paid-entry"},
    } as unknown as MathDefinitionSnapshot["effective"];
    return {
        identity: {kind: "blueprint", revision},
        support: "complete",
        effective: model,
        authored: model,
        fields: [],
        diagnostics: [],
        limits: [],
    };
}

function representationOnlyDiff(): MathDefinitionDiff {
    return {
        schemaVersion: 1,
        comparisonKind: "math-definition",
        scope: "declared-effective-model",
        status: "different",
        left: {
            identity: {kind: "blueprint", revision: "sha256:same"},
            support: "complete",
            fields: [],
            diagnostics: [],
            limits: [],
        },
        right: {
            identity: {kind: "blueprint", revision: "sha256:same"},
            support: "complete",
            fields: [],
            diagnostics: [],
            limits: [],
        },
        changes: [
            {
                path: "/info/name",
                classification: "representation",
                mathematical: false,
                seededTraceImpact: false,
                before: {present: false, provenance: {authority: "getInfo", status: "effective", authored: {present: false}}},
                after: {present: true, value: "Renamed", provenance: {authority: "blueprint", status: "authored", authored: {present: true, value: "Renamed"}}},
            },
        ],
    };
}

describe("math definition diff summary", () => {
    it("labels provenance-only changes as representation-only and exits 0 in CI when revisions match", () => {
        const diff = representationOnlyDiff();

        const summary = summarizeMathDefinitionDiff(diff);
        expect(summary.label).toBe("representation-only");
        expect(summary.mathematicalChanges).toBe(0);
        expect(summary.representationChanges + summary.provenanceChanges).toBeGreaterThan(0);
        expect(mathDefinitionDiffCiExitCode(diff)).toBe(0);
    });

    it("keeps a mathematical payout change distinct from representation noise", () => {
        const diff = new MathDefinitionDiffer().diff(
            snapshot("Same", 8, "sha256:left"),
            snapshot("Same", 12, "sha256:right"),
        );

        const summary = summarizeMathDefinitionDiff(diff);
        expect(summary.label).toBe("different");
        expect(summary.mathematicalChanges).toBeGreaterThan(0);
        expect(mathDefinitionDiffCiExitCode(diff)).toBeGreaterThan(0);
    });
});
