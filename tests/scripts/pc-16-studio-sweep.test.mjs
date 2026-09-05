import assert from "node:assert/strict";
import {test} from "@jest/globals";
import {PC16_WORKFLOW_GROUPS, validatePc16WorkflowGroups} from "../../scripts/pc-16-studio-sweep.mjs";

test("PC-16 assigns each retained Studio workflow to one focused regression owner", () => {
    assert.doesNotThrow(() => validatePc16WorkflowGroups());
    assert.deepEqual(PC16_WORKFLOW_GROUPS.map((group) => group.id), [
        "project-context-lifecycle",
        "generated-artifact-product-sweep",
    ]);
    assert.deepEqual(PC16_WORKFLOW_GROUPS.flatMap((group) => group.coverage), [
        "project-switch",
        "history-restore",
        "retired-route-recovery",
        "stale-result-reset",
        "generated-artifact-open",
        "play-output",
        "simulation-output",
        "replay-output",
        "artifact-publication",
    ]);
});

test("PC-16 rejects a duplicate action path in its regression closure", () => {
    const duplicate = PC16_WORKFLOW_GROUPS.map((group) => ({...group, coverage: [...group.coverage]}));
    duplicate[1].coverage.push("project-switch");
    assert.throws(() => validatePc16WorkflowGroups(duplicate), /duplicated/i);
});
