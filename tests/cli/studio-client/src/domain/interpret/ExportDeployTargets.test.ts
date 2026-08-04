import {describeExportDeployTargetCards} from "../../../../../../cli/studio-client/src/domain/interpret/ExportDeployTargets";
import type {StudioDeploymentTargetSummary, StudioProjectCapability} from "../../../../../../cli/studio-client/src/api/types";

const BUILDABLE_CAPABILITIES: StudioProjectCapability[] = ["blueprint.build"];

function target(overrides: Partial<StudioDeploymentTargetSummary> = {}): StudioDeploymentTargetSummary {
    return {id: "acme-rgs-v2", version: "1.0.0", requirements: {}, capabilities: [], ...overrides};
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

    it("never describes the External Adapter SDK's own local-json-example demo target as a card, even though it's registered", () => {
        const localTarget = target({id: "local-json-example", version: "2.3.0", capabilities: ["multiMode"]});
        const cards = describeExportDeployTargetCards([localTarget], BUILDABLE_CAPABILITIES);
        expect(cards.some((card) => card.id === "local-json-example")).toBe(false);

        // Nothing else is registered, so the remote-deployment group still falls back to its own
        // placeholder rather than silently disappearing or standing in the demo target's place.
        const remoteCards = cards.filter((card) => card.kind === "remoteDeployment");
        expect(remoteCards).toHaveLength(1);
        expect(remoteCards[0].id).toBe("remote-deployment-placeholder");
    });

    it("classifies any registered (non-demo) target as remote deployment, carrying the real descriptor through and dropping the placeholder", () => {
        const remoteTarget = target({id: "acme-rgs-v2", version: "0.1.0"});
        const cards = describeExportDeployTargetCards([remoteTarget], BUILDABLE_CAPABILITIES);
        const remoteCards = cards.filter((card) => card.kind === "remoteDeployment");
        expect(remoteCards).toHaveLength(1);
        expect(remoteCards[0].deploymentTarget).toBe(remoteTarget);
        expect(remoteCards[0].locality).toBe("remote");
        expect(remoteCards[0].id).toBe("acme-rgs-v2");
        expect(remoteCards[0].version).toBe("0.1.0");
    });

    it("classifies a registered target's own optional capabilities and describes an empty-requirements target as having no special requirements", () => {
        const remoteTarget = target({requirements: {}, capabilities: ["multiMode"]});
        const cards = describeExportDeployTargetCards([remoteTarget], BUILDABLE_CAPABILITIES);
        const remoteCard = cards.find((card) => card.kind === "remoteDeployment");
        expect(remoteCard?.capabilities).toEqual(["More than one bet mode in a single deployment"]);
        expect(remoteCard?.limits).toEqual(["No special requirements -- accepts any compatible outcome library."]);
    });

    it("returns no cards at all for a project with no capability any builder here needs", () => {
        const cards = describeExportDeployTargetCards([target()], ["stakeAdapter.exchange"]);
        expect(cards).toEqual([]);
    });

    it("includes every group once a project carries runtime.execute even without blueprint.build (e.g. a tsPackage project)", () => {
        const cards = describeExportDeployTargetCards([], ["runtime.execute"]);
        expect(cards.map((card) => card.kind).sort()).toEqual(["outcomeLibrary", "remoteDeployment", "staticExport"].sort());
    });

    it("includes Static export and adapter cards, but never the outcome-library generator, for a project that can only read an existing canonical outcome library (e.g. an outcomeLibrary project)", () => {
        const remoteTarget = target({id: "acme-rgs-v2"});
        const cards = describeExportDeployTargetCards([remoteTarget], ["outcomeLibrary.read"]);
        expect(cards.map((card) => card.kind).sort()).toEqual(["remoteDeployment", "staticExport"].sort());
        expect(cards.some((card) => card.kind === "outcomeLibrary")).toBe(false);
    });
});
