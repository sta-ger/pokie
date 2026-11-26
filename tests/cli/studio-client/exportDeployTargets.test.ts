import {
    describeArtifactBuildTargetCards,
    describeExportDeployTargetCards,
} from "../../../cli/studio-client/src/domain/interpret/ExportDeployTargets.js";
import type {
    StudioFormatConversionPlan,
    StudioOutputFormat,
    StudioOutputFormatView,
} from "../../../cli/studio-client/src/api/types.js";

function plan(sourceKind: "blueprint" | "tsPackage"): StudioFormatConversionPlan {
    return {
        status: "planned",
        source: {kind: sourceKind, capabilities: []},
        target: {kind: "parWorkbook", capabilities: []},
        steps: [],
        preflight: {destinationKind: "file", estimatedWork: "none", losses: [], oneWay: false},
    } as unknown as StudioFormatConversionPlan;
}

function target(target: StudioOutputFormat, sourceKind: "blueprint" | "tsPackage", supported = true): StudioOutputFormatView {
    return {
        target,
        supported,
        state: supported ? "supported" : "diagnostic-required",
        unsupportedNotes: supported ? [] : ["Not available for this source."],
        plan: plan(sourceKind),
    };
}

describe("Build/Export target cards", () => {
    it("does not offer a second 'editable game design' card when the project is already that design", () => {
        const cards = describeArtifactBuildTargetCards([
            target("blueprint", "blueprint", false),
            target("parWorkbook", "blueprint"),
        ]);
        expect(cards.map((card) => card.artifactTarget)).toEqual(["parWorkbook"]);
    });

    it("keeps the game-design extraction card for a package source", () => {
        const cards = describeArtifactBuildTargetCards([
            target("blueprint", "tsPackage"),
            target("parWorkbook", "tsPackage"),
        ]);
        expect(cards.find((card) => card.artifactTarget === "blueprint")?.label).toBe("Game design file");
    });

    it("does not reserve a Remote deployment section when no connector targets are registered", () => {
        const cards = describeExportDeployTargetCards([], [target("parWorkbook", "blueprint")]);
        expect(cards.filter((card) => card.kind === "remoteDeployment")).toEqual([]);
    });
});
