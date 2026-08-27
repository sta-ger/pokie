import assert from "node:assert/strict";
import {test} from "@jest/globals";
import {claimCoverageFor, REQUIRED_ACTION_COVERAGE, validateInventory} from "../../scripts/collect-studio-inventory.mjs";

const claim = {
    id: "DOC-04",
    owner: "P8-05",
    renderedGoals: ["Project tab: Overview", "Project tab: Replay"],
};

function action(coverageId, owner, goal) {
    return {
        coverageId,
        owner,
        goal,
        action: `click ${coverageId}`,
        latencyMs: 1,
        visibleResult: "A newly visible result",
        visibleResultAt: "2026-08-26T00:00:00.000Z",
        resultWasFalseBeforeInput: true,
    };
}

function completeRecord() {
    return {
        schemaVersion: 3,
        provenance: {candidateSha: "0123456789abcdef0123456789abcdef01234567"},
        publicDocumentationClaims: {claims: [claim]},
        screens: claim.renderedGoals.map((goal) => ({goal, owner: "P8-05", statesObserved: {}, focusOrder: []})),
        actions: [
            action("managed-project-open", "P8-02", "Managed project Open opens the project workspace"),
            action("managed-project-open-conflict", "P8-02", "Managed project Open reveals the unsaved-changes dialog"),
            action("managed-project-open-stay", "P8-02", "Managed project Open stays in the draft after its conflict dialog"),
            action("managed-project-remove-confirm", "P8-02", "Managed project Remove opens a non-destructive confirmation"),
            action("managed-project-remove-cancel", "P8-02", "Managed project Remove is cancelled"),
            action("simulation-run", "P8-05", "Simulation run begins or reports an error"),
            action("replay-load", "P8-05", "Replay Load configures a new replay session"),
            action("build-generate-outcome-library", "P8-05", "Build/Export generates an outcome library or reports an error"),
            action("stake-engine-export", "P8-05", "Build/Export completes Stake Engine export or reports an error"),
            action("build-typescript-game-package", "P8-05", "Build/Export TypeScript Game Package Build completes or reports an error"),
            action("build-outcome-library", "P8-05", "Build/Export Outcome library Build completes or reports an error"),
            action("build-stake-engine-export", "P8-05", "Build/Export Stake Engine export Build completes or reports an error"),
            action("build-par-sheet", "P8-05", "Build/Export PAR sheet (.xlsx) Build completes or reports an error"),
        ],
        findings: [],
        claimCoverage: [{id: claim.id, owner: claim.owner, observedGoals: [...claim.renderedGoals], status: "observed"}],
    };
}

test("collector contract requires exact browser-action coverage with matching roadmap owners", () => {
    const record = completeRecord();
    assert.equal(record.actions.length, REQUIRED_ACTION_COVERAGE.length);
    assert.deepEqual(REQUIRED_ACTION_COVERAGE.map((entry) => entry.id), [
        "managed-project-open-conflict",
        "managed-project-open-stay",
        "managed-project-open",
        "managed-project-remove-confirm",
        "managed-project-remove-cancel",
        "simulation-run",
        "replay-load",
        "build-generate-outcome-library",
        "stake-engine-export",
        "build-typescript-game-package",
        "build-outcome-library",
        "build-stake-engine-export",
        "build-par-sheet",
    ]);
    assert.doesNotThrow(() => validateInventory(record, true));

    record.actions.find((entry) => entry.coverageId === "build-par-sheet").owner = "P8-02";
    assert.throws(() => validateInventory(record, true), /owner|action/i);
});

test("collector contract rejects a missing required action and a misowned action finding", () => {
    const record = completeRecord();
    record.actions = record.actions.filter((entry) => entry.coverageId !== "build-stake-engine-export");
    assert.throws(() => validateInventory(record, true), /browser-input result/i);

    record.findings.push({
        id: "P8-01-F-BUILD-STAKE-EXPORT",
        surface: "Build/Export Stake Engine export",
        owner: "P8-02",
        status: "unreached",
        observedBy: "clean-profile",
        coverageId: "build-stake-engine-export",
    });
    assert.throws(() => validateInventory(record, true), /browser-input result/i);

    record.findings[0].owner = "P8-05";
    assert.doesNotThrow(() => validateInventory(record, true));

    record.actions.push(action("build-stake-engine-export", "P8-05", "Build/Export Stake Engine export Build completes or reports an error"));
    assert.throws(() => validateInventory(record, true), /exactly one browser-input result/i);
});

test("documentation claims are observed only when every rendered goal is present", () => {
    const screens = [{goal: "Project tab: Overview"}];
    const finding = {id: "P8-01-F-DOC-04", owner: "P8-05", documentationClaimId: "DOC-04"};
    const coverage = claimCoverageFor([claim], screens, [finding]);
    assert.deepEqual(coverage, [{id: "DOC-04", owner: "P8-05", observedGoals: ["Project tab: Overview"], status: "finding", findingId: "P8-01-F-DOC-04"}]);

    const record = completeRecord();
    record.screens.pop();
    record.claimCoverage = [{id: claim.id, owner: claim.owner, observedGoals: ["Project tab: Overview"], status: "observed"}];
    assert.throws(() => validateInventory(record, true), /documentation claim/i);
});

test("documentation claims with outstanding claim findings are not observed", () => {
    const finding = {id: "P8-01-F-DOC-04", owner: "P8-05", documentationClaimId: "DOC-04"};
    const coverage = claimCoverageFor([claim], claim.renderedGoals.map((goal) => ({goal})), [finding]);
    assert.deepEqual(coverage, [{
        id: claim.id,
        owner: claim.owner,
        observedGoals: [...claim.renderedGoals],
        status: "finding",
        findingId: "P8-01-F-DOC-04",
    }]);

    const record = completeRecord();
    record.findings.push({...finding, status: "unreached", observedBy: "clean-profile"});
    assert.throws(() => validateInventory(record, true), /documentation claim/i);
});

test("collector contract rejects findings absent from or misowned in the ownership ledger", () => {
    const record = completeRecord();
    const finding = {
        id: "P8-01-F-EXAMPLE",
        surface: "Example unavailable capability",
        owner: "P8-05",
        status: "unreached",
        observedBy: "clean-profile",
    };
    record.findings.push(finding);
    const ledger = {findingAssignments: [{id: finding.id, owner: finding.owner}]};
    assert.doesNotThrow(() => validateInventory(record, true, ledger));

    assert.throws(() => validateInventory(record, true, {findingAssignments: []}), /ownership-ledger/i);
    assert.throws(() => validateInventory(record, true, {findingAssignments: [{id: finding.id, owner: "P8-02"}]}), /ownership-ledger/i);
});
