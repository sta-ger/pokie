import {describeArtifactBuildTargetCards, describeExportDeployTargetCards} from "../../../../../../cli/studio-client/src/domain/interpret/ExportDeployTargets";
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

    // Regression for a P5-POLISH-20 audit finding: the outcome-library card's own "compatibility" prose used
    // to read "Read by Deployment and Stake Engine Export alike", a bare "Deployment" that -- taken out of
    // context in a saved DOM snapshot -- looked like a reference to the pre-P5-POLISH-04 standalone
    // Deployment tab (deleted; see ProjectDashboardPage's own doc comment on "exportDeploy"/ExportDeployTab
    // being the sole Studio build surface) rather than this single tab's own "Remote deployment" group. Every
    // card's own user-facing prose must consistently say "remote deployment", never a bare "Deployment", so
    // this shell can never again read as if a separate Deployment surface still exists.
    it("never describes any card's own prose with a bare 'Deployment' -- only ever 'remote deployment', matching the Remote deployment group's own name", () => {
        const remoteTarget = target({id: "acme-rgs-v2"});
        const cards = describeExportDeployTargetCards([remoteTarget], ["runtime.execute"]);
        expect(cards.length).toBeGreaterThan(0);
        const bareDeploymentPattern = /(?<!remote )(?<!Remote )\bDeployment\b/;
        for (const card of cards) {
            for (const field of [card.label, card.adapter, card.purpose, card.destination, card.writePublishBehavior, card.compatibility, ...card.capabilities, ...card.limits, ...card.prerequisites]) {
                expect(field).not.toMatch(bareDeploymentPattern);
            }
        }
    });
});

describe("describeArtifactBuildTargetCards", () => {
    it("uses source-neutral Outcome Library and Stake Engine wording for every matrix-supported runtime source", () => {
        const cards = describeArtifactBuildTargetCards([
            {target: "outcomeLibrary", supported: true, state: "supported", unsupportedNotes: []},
            {target: "stakeAdapter", supported: true, state: "supported", unsupportedNotes: []},
        ]);

        expect(cards).toMatchObject([
            {
                label: "Outcome library",
                purpose: "Build an outcome library from this project.",
                destination: "Choose a folder for the outcome library, or use the default destination.",
            },
            {
                label: "Stake Engine export",
                purpose: "Build a Stake Engine export from this project.",
                destination: "Choose a folder for the Stake Engine export, or use the default destination.",
            },
        ]);
    });

    it("offers a supported PAR workbook card for a Blueprint while preserving workbook republish wording", () => {
        const [card] = describeArtifactBuildTargetCards([{target: "parWorkbook", supported: true, state: "supported", unsupportedNotes: []}]);

        expect(card).toMatchObject({
            label: "PAR sheet (.xlsx)",
            supported: true,
            purpose: "Export this Game Blueprint as a PAR workbook snapshot, or republish this PAR workbook.",
            destination: "Choose where to save the PAR workbook, or use the default destination.",
        });
    });

    it("keeps an unsupported output visible with its concrete unavailable reason, while reserving destination protocol for Advanced details", () => {
        const cards = describeArtifactBuildTargetCards([
            {
                target: "stakeAdapter",
                supported: false,
                unsupportedNotes: ["This target only republishes an existing Stake Engine export."],
            },
        ]);

        expect(cards).toHaveLength(1);
        expect(cards[0]).toMatchObject({
            id: "artifact-stakeAdapter",
            supported: false,
            destination: "Choose a folder for the Stake Engine export, or use the default destination.",
            technicalDestination: "A new Stake Engine export directory beside this project by default.",
            unavailableReasons: ["This target only republishes an existing Stake Engine export."],
        });
        expect(cards[0].limits).toEqual([]);
    });

    it("supplies every unsupported artifact target with a target-specific next step when the server has no reason", () => {
        const cards = describeArtifactBuildTargetCards([
            {target: "tsPackage", supported: false, state: "diagnostic-required", unsupportedNotes: []},
            {target: "outcomeLibrary", supported: false, state: "diagnostic-required", unsupportedNotes: []},
            {target: "stakeAdapter", supported: false, state: "diagnostic-required", unsupportedNotes: []},
            {target: "parWorkbook", supported: false, state: "diagnostic-required", unsupportedNotes: []},
        ]);

        expect(cards.map((card) => card.unavailableReasons)).toEqual([
            ["This project cannot build a TypeScript Game Package. Open a Game Blueprint project to create one."],
            ["This project cannot create or republish an outcome library. Open a Game Blueprint, runnable game package, or outcome library project to continue."],
            ["This project cannot build a Stake Engine export. Open a Game Blueprint, runnable game package, outcome library, or Stake Engine export project to continue."],
            ["This project cannot export or republish a PAR workbook. Open a Game Blueprint or PAR sheet workbook project to continue."],
        ]);
    });

    it("uses product-facing primary destinations while retaining exact destination and write behavior as advanced detail", () => {
        const cards = describeExportDeployTargetCards([target()], BUILDABLE_CAPABILITIES);
        const stakeCard = cards.find((card) => card.kind === "staticExport");
        const remoteCard = cards.find((card) => card.kind === "remoteDeployment" && card.deploymentTarget !== undefined);

        expect(stakeCard?.destination).not.toMatch(/index\.json|zstd|CSV|manifest/);
        expect(stakeCard?.technicalDestination).toMatch(/index\.json.*zstd-compressed books.*pokie-manifest\.json/);
        expect(stakeCard?.writePublishBehavior).toMatch(/atomic swap/);
        expect(remoteCard?.destination).not.toMatch(/runtime adapter/);
        expect(remoteCard?.technicalDestination).toMatch(/runtime adapter/);
    });
});
