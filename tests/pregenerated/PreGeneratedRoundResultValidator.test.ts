import {
    PreGeneratedRoundResult,
    PreGeneratedRoundResultValidator,
    buildPreGeneratedRoundResult,
    buildWeightedOutcomeLibrary,
    computeWeightedOutcomeLibraryHash,
} from "pokie";
import {artifactWith} from "../weightedoutcome/WeightedOutcomeTestFixtures.js";

function buildValidResult(): PreGeneratedRoundResult<string> {
    const library = buildWeightedOutcomeLibrary({
        libraryId: "validator-test",
        outcomes: [{id: "only", weight: 1, artifact: artifactWith({roundId: "only", totalWin: 3})}],
    });
    return buildPreGeneratedRoundResult({
        library,
        libraryHash: computeWeightedOutcomeLibraryHash(library),
        outcome: library.outcomes[0],
        runtime: {
            roundId: "round-1",
            sessionId: "session-1",
            balanceBefore: 100,
            balanceAfter: 102,
            transactions: [
                {id: "round-1:debit", type: "debit", amount: 1},
                {id: "round-1:credit", type: "credit", amount: 3},
            ],
        },
    });
}

// A two-outcome library (weight 25 of a total 100, i.e. a "real" probability of 0.25) rather than
// buildValidResult's single-outcome one — needed to forge selection.weight/probability independently
// without weight <= totalWeight already failing trivially (a single-outcome library always has
// weight === totalWeight).
function buildValidResultWithQuarterProbability(): PreGeneratedRoundResult<string> {
    const library = buildWeightedOutcomeLibrary({
        libraryId: "weights-test",
        outcomes: [
            {id: "a", weight: 25, artifact: artifactWith({roundId: "a", totalWin: 3, stake: 1})},
            {id: "b", weight: 75, artifact: artifactWith({roundId: "b", totalWin: 0, stake: 1})},
        ],
    });
    return buildPreGeneratedRoundResult({
        library,
        libraryHash: computeWeightedOutcomeLibraryHash(library),
        outcome: library.outcomes[0],
        runtime: {
            roundId: "round-1",
            sessionId: "session-1",
            balanceBefore: 100,
            balanceAfter: 102,
            transactions: [
                {id: "round-1:debit", type: "debit", amount: 1},
                {id: "round-1:credit", type: "credit", amount: 3},
            ],
        },
    });
}

describe("PreGeneratedRoundResultValidator", () => {
    const validator = new PreGeneratedRoundResultValidator<string>();

    it("reports no issues for a validly built result", () => {
        expect(validator.validate(buildValidResult())).toEqual([]);
    });

    it("flags an unsupported schemaVersion", () => {
        const result = {...buildValidResult(), schemaVersion: 999};
        const issues = validator.validate(result);
        expect(issues.some((issue) => issue.code === "pre-generated-round-schema-version-unsupported")).toBe(true);
    });

    it("flags a missing selection object", () => {
        const {selection: _selection, ...rest} = buildValidResult();
        const issues = validator.validate(rest as PreGeneratedRoundResult<string>);
        expect(issues.some((issue) => issue.code === "pre-generated-round-selection-invalid")).toBe(true);
    });

    it("flags an invalid selection.weight", () => {
        const base = buildValidResult();
        const result = {...base, selection: {...base.selection, weight: -1}};
        const issues = validator.validate(result);
        expect(issues.some((issue) => issue.code === "pre-generated-round-selection-weight-invalid")).toBe(true);
    });

    it("flags a missing runtime.sessionId", () => {
        const base = buildValidResult();
        const result = {...base, runtime: {...base.runtime, sessionId: ""}};
        const issues = validator.validate(result);
        expect(issues.some((issue) => issue.code === "pre-generated-round-session-id-invalid")).toBe(true);
    });

    it("flags a malformed transaction entry", () => {
        const base = buildValidResult();
        const result = {...base, runtime: {...base.runtime, transactions: [{id: "x", type: "oops", amount: 1}]}};
        const issues = validator.validate(result as unknown as PreGeneratedRoundResult<string>);
        expect(issues.some((issue) => issue.code === "pre-generated-round-transaction-invalid")).toBe(true);
    });

    it("delegates artifact validity to RoundArtifactValidator (e.g. totalWin mismatch)", () => {
        const base = buildValidResult();
        const result = {...base, artifact: {...base.artifact, totalWin: 999999}};
        const issues = validator.validate(result);
        expect(issues.some((issue) => issue.code === "round-artifact-total-win-mismatch")).toBe(true);
    });

    it("never throws for a completely malformed input", () => {
        const issues = validator.validate(null as unknown as PreGeneratedRoundResult<string>);
        expect(issues.some((issue) => issue.code === "pre-generated-round-malformed")).toBe(true);
    });

    it("flags selection.weight exceeding selection.totalWeight", () => {
        const base = buildValidResultWithQuarterProbability();
        const result = {...base, selection: {...base.selection, weight: base.selection.totalWeight + 1}};
        const issues = validator.validate(result);
        expect(issues.some((issue) => issue.code === "pre-generated-round-selection-weight-exceeds-total")).toBe(true);
    });

    it("flags a selection.probability that doesn't match weight/totalWeight", () => {
        const base = buildValidResultWithQuarterProbability();
        expect(base.selection.probability).toBeCloseTo(0.25);
        const result = {...base, selection: {...base.selection, probability: 0.9}};
        const issues = validator.validate(result);
        expect(issues.some((issue) => issue.code === "pre-generated-round-selection-probability-mismatch")).toBe(true);
    });

    it("flags a forged debit total that doesn't match artifact.stake", () => {
        const base = buildValidResult();
        const [debit, credit] = base.runtime.transactions;
        const result = {...base, runtime: {...base.runtime, transactions: [{...debit, amount: 999}, credit]}};
        const issues = validator.validate(result);
        expect(issues.some((issue) => issue.code === "pre-generated-round-transactions-debit-mismatch")).toBe(true);
    });

    it("flags a forged credit total that doesn't match artifact.totalWin", () => {
        const base = buildValidResult();
        const [debit, credit] = base.runtime.transactions;
        const result = {...base, runtime: {...base.runtime, transactions: [debit, {...credit, amount: 999}]}};
        const issues = validator.validate(result);
        expect(issues.some((issue) => issue.code === "pre-generated-round-transactions-credit-mismatch")).toBe(true);
    });

    it("flags a balanceAfter that doesn't reconcile with balanceBefore and the transactions", () => {
        const base = buildValidResult();
        const result = {...base, runtime: {...base.runtime, balanceAfter: 999999}};
        const issues = validator.validate(result);
        expect(issues.some((issue) => issue.code === "pre-generated-round-balance-mismatch")).toBe(true);
    });

    it("flags duplicate transaction ids", () => {
        const base = buildValidResult();
        const [debit, credit] = base.runtime.transactions;
        const result = {...base, runtime: {...base.runtime, transactions: [debit, {...credit, id: debit.id}]}};
        const issues = validator.validate(result);
        expect(issues.some((issue) => issue.code === "pre-generated-round-transaction-ids-not-unique")).toBe(true);
    });
});
