import fs from "fs";
import path from "path";

import {describeOutcomeLibraryGenerationTerminalOutcome} from "../../../../cli/studio-client/src/domain/outcomeLibraryGenerateError.js";
import {describeProjectContextFailure} from "../../../../cli/studio-client/src/domain/interpret/ProjectDashboard.js";

const SEMANTIC_AUDIT_PATH = path.resolve(process.cwd(), "docs/evidence/phase7-product-coherence/pc-17-parity-semantic-audit/PRODUCT-SEMANTICS.md");

describe("PC-17 product-semantic audit", () => {
    it("keeps recovery attached to a user goal without exposing internal paths or records as prerequisites", () => {
        expect(describeProjectContextFailure("/games/example", "Cannot prepare a runnable runtime: fix the game model.")).toEqual({
            status: "error",
            projectRoot: "/games/example",
            message: "Cannot prepare a runnable runtime: fix the game model.",
        });
        expect(describeOutcomeLibraryGenerationTerminalOutcome({status: "cancelled"})).toContain("Generation was cancelled safely");

        const audit = fs.readFileSync(SEMANTIC_AUDIT_PATH, "utf-8");
        expect(audit).toContain("raw weighted-outcome JSON");
        expect(audit).toContain("never becomes a project input, readiness prerequisite");
        expect(audit).toContain("No cache marker, materialization directory, resolver implementation name, or registry path is a user prerequisite.");
        expect(audit).toContain("does not recreate retired workflows");
    });
});
