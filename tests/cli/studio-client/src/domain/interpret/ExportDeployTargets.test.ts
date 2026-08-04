import {describeExportDeployTargetCards} from "../../../../../../cli/studio-client/src/domain/interpret/ExportDeployTargets";
import type {StudioDeploymentTargetSummary, StudioProjectCapability} from "../../../../../../cli/studio-client/src/api/types";

const BUILDABLE_CAPABILITIES: StudioProjectCapability[] = ["blueprint.build"];

function target(overrides: Partial<StudioDeploymentTargetSummary> = {}): StudioDeploymentTargetSummary {
    return {id: "local-json-example", version: "1.0.0", requirements: {}, capabilities: [], ...overrides};
}

describe("describeExportDeployTargetCards", () => {
    it("includes the outcome-library builder card for a buildable project, even with no registered targets", () => {
        const cards = describeExportDeployTargetCards([], BUILDABLE_CAPABILITIES);
        const outcomeLibraryCard = cards.find((card) => card.kind === "outcomeLibrary");
        expect(outcomeLibraryCard).toBeDefined();
        expect(outcomeLibraryCard?.id).toBe("outcome-library");
        expect(outcomeLibraryCard?.deploymentTarget).toBeUndefined();
        expect(outcomeLibraryCard?.locality).toBe("local");
    });

    it("includes the Stake Engine static-export card for a buildable project, even with no registered targets", () => {
        const cards = describeExportDeployTargetCards([], BUILDABLE_CAPABILITIES);
        const stakeCard = cards.find((card) => card.kind === "staticExport");
        expect(stakeCard).toBeDefined();
        expect(stakeCard?.id).toBe("stakeengine-export");
        expect(stakeCard?.deploymentTarget).toBeUndefined();
        expect(stakeCard?.locality).toBe("local");
    });

    it("fills the remote-deployment group with a placeholder when no registered target is remote", () => {
        const cards = describeExportDeployTargetCards([], BUILDABLE_CAPABILITIES);
        const remoteCards = cards.filter((card) => card.kind === "remoteDeployment");
        expect(remoteCards).toHaveLength(1);
        expect(remoteCards[0].deploymentTarget).toBeUndefined();
        expect(remoteCards[0].locality).toBe("remote");
    });

    it("classifies the local-json-example registered target as a local adapter, carrying the real descriptor through", () => {
        const localTarget = target({id: "local-json-example", version: "2.3.0", capabilities: ["multiMode"]});
        const cards = describeExportDeployTargetCards([localTarget], BUILDABLE_CAPABILITIES);
        const localCard = cards.find((card) => card.kind === "localAdapter");
        expect(localCard).toBeDefined();
        expect(localCard?.deploymentTarget).toBe(localTarget);
        expect(localCard?.version).toBe("2.3.0");
        expect(localCard?.locality).toBe("local");
        expect(localCard?.capabilities).toEqual(["More than one bet mode in a single deployment"]);

        // The placeholder is omitted once a real local target exists but no remote one does — only the
        // group's own real cards should ever be shown.
        expect(cards.filter((card) => card.kind === "remoteDeployment")).toHaveLength(1);
        expect(cards.filter((card) => card.kind === "remoteDeployment")[0].id).toBe("remote-deployment-placeholder");
    });

    it("classifies any other registered target as remote deployment (a future adapter's extension point), dropping the placeholder", () => {
        const remoteTarget = target({id: "acme-rgs-v2", version: "0.1.0"});
        const cards = describeExportDeployTargetCards([remoteTarget], BUILDABLE_CAPABILITIES);
        const remoteCards = cards.filter((card) => card.kind === "remoteDeployment");
        expect(remoteCards).toHaveLength(1);
        expect(remoteCards[0].deploymentTarget).toBe(remoteTarget);
        expect(remoteCards[0].locality).toBe("remote");
        expect(remoteCards[0].id).toBe("acme-rgs-v2");
    });

    it("describes an empty-requirements local target as having no special requirements", () => {
        const localTarget = target({requirements: {}});
        const cards = describeExportDeployTargetCards([localTarget], BUILDABLE_CAPABILITIES);
        const localCard = cards.find((card) => card.kind === "localAdapter");
        expect(localCard?.limits).toEqual(["No special requirements -- accepts any compatible outcome library."]);
    });

    it("returns no cards at all for a project this Studio can neither build nor run, even with registered targets", () => {
        const cards = describeExportDeployTargetCards([target()], ["outcomeLibrary.read"]);
        expect(cards).toEqual([]);
    });

    it("includes every group once a project carries runtime.execute even without blueprint.build (e.g. a tsPackage project)", () => {
        const cards = describeExportDeployTargetCards([], ["runtime.execute"]);
        expect(cards.map((card) => card.kind).sort()).toEqual(["outcomeLibrary", "remoteDeployment", "staticExport"].sort());
    });
});
