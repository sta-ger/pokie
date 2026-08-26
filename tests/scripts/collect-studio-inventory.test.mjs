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
            action("managed-project-remove-confirm", "P8-02", "Managed project Remove opens a non-destructive confirmation"),
            action("managed-project-remove-cancel", "P8-02", "Managed project Remove is cancelled"),
            action("simulation-run", "P8-05", "Simulation run begins or reports an error"),
            action("replay-load", "P8-05", "Replay Load configures a new replay session"),
            action("build-generate-outcome-library", "P8-05", "Build/Export generates an outcome library or reports an error"),
            action("build-stake-engine-export", "P8-05", "Build/Export runs Stake Engine export or reports an error"),
        ],
        findings: [],
        claimCoverage: [{id: claim.id, owner: claim.owner, observedGoals: [...claim.renderedGoals], status: "observed"}],
    };
}

test("collector contract requires exact browser-action coverage with matching roadmap owners", () => {
    const record = completeRecord();
    assert.equal(record.actions.length, REQUIRED_ACTION_COVERAGE.length);
    assert.doesNotThrow(() => validateInventory(record, true));

    record.actions[3].owner = "P8-02";
    assert.throws(() => validateInventory(record, true), /owner|action/i);
});

test("collector contract rejects a missing required action and a misowned action finding", () => {
    const record = completeRecord();
    record.actions = record.actions.filter((entry) => entry.coverageId !== "replay-load");
    assert.throws(() => validateInventory(record, true), /primary action/i);

    record.findings.push({
        id: "P8-01-F-REPLAY-LOAD",
        surface: "Replay Load",
        owner: "P8-02",
        status: "unreached",
        observedBy: "clean-profile",
        coverageId: "replay-load",
    });
    assert.throws(() => validateInventory(record, true), /primary action/i);

    record.findings[0].owner = "P8-05";
    assert.doesNotThrow(() => validateInventory(record, true));
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
