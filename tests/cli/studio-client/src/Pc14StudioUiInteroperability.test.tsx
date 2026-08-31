import {screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import {passthroughRuntimePackageResolver} from "../../../../cli/materialize/materializeRuntimePackage.js";
import {StudioBlueprintService} from "../../../../cli/studio/blueprint/StudioBlueprintService.js";
import {BuildCommand} from "../../../../cli/commands/BuildCommand.js";
import {StudioHomeService} from "../../../../cli/studio/home/StudioHomeService.js";
import {createStudioGameLoader} from "../../../../cli/studio/loadStudioGame.js";
import {StudioServer} from "../../../../cli/studio/StudioServer.js";
import type {FetchLike} from "../../../../cli/studio-client/src/api/apiClient.js";
import {
    ArtifactInteroperabilityRun,
    installPc14FixedRunnerClock,
    mergeArtifactInteroperabilityRuns,
    recordRemainingPc05OwnerOperationBoundaries,
} from "../../../support/ArtifactInteroperabilityRun.js";
import {renderRoutedApp} from "./testUtils/renderRoutedApp";

const POKIE_VERSION = "1.3.0";

function writeStudioAssets(root: string): void {
    fs.writeFileSync(path.join(root, "index.html"), "<html>Studio</html>");
    fs.writeFileSync(path.join(root, "main.js"), "");
    fs.writeFileSync(path.join(root, "style.css"), "");
}

function createServerFetch(baseUrl: string): FetchLike {
    return (url, init) => new Promise((resolve, reject) => {
        const request = http.request(`${baseUrl}${url}`, {method: init?.method, headers: init?.headers}, (response) => {
            const chunks: Buffer[] = [];
            response.on("data", (chunk: Buffer) => chunks.push(chunk));
            response.on("end", () => {
                const body = Buffer.concat(chunks).toString("utf8");
                resolve({
                    ok: (response.statusCode ?? 500) >= 200 && (response.statusCode ?? 500) < 300,
                    status: response.statusCode ?? 500,
                    json: () => Promise.resolve(JSON.parse(body)),
                });
            });
        });
        request.on("error", reject);
        request.end(init?.body);
    });
}

describe("PC-14 Studio UI real-artifact interoperability", () => {
    let studioRoot: string;
    let workDir: string;
    let blueprintPath: string;
    let packagePath: string;
    let outcomeLibraryPath: string;
    let server: StudioServer;
    let fetchImpl: FetchLike;
    let restoreRunnerClock: () => void;
    let packageServerStopped = false;
    const additionalServers: StudioServer[] = [];

    beforeEach(async () => {
        restoreRunnerClock = installPc14FixedRunnerClock();
        packageServerStopped = false;
        studioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-pc14-ui-assets-"));
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-pc14-ui-artifacts-"));
        writeStudioAssets(studioRoot);
        blueprintPath = path.join(workDir, "ui-route-slot.blueprint.json");
        fs.writeFileSync(blueprintPath, JSON.stringify({
            manifest: {id: "ui-route-slot", name: "UI Route Slot", version: "1.0.0"},
            reels: 2, rows: 1, symbols: ["A", "B"], paytable: {A: {2: 3}},
            reelStrips: [["A", "B"], ["A", "B"]], availableBets: [1],
        }));
        packagePath = path.join(workDir, "tsPackage");
        expect(await new BuildCommand(POKIE_VERSION).run([blueprintPath, "--target", "tsPackage", "--out", packagePath])).toBe(0);
        outcomeLibraryPath = path.join(packagePath, "outcomes", "bundle");
        expect(await new BuildCommand(POKIE_VERSION).run([blueprintPath, "--target", "outcomeLibrary", "--out", outcomeLibraryPath])).toBe(0);
        const home = new StudioHomeService(POKIE_VERSION);
        server = new StudioServer({
            pokieVersion: POKIE_VERSION, host: "127.0.0.1", port: 0, studioRoot,
            homeService: home,
            blueprintService: new StudioBlueprintService(POKIE_VERSION, studioRoot, home),
            loadGame: createStudioGameLoader(process.cwd()),
            resolveRuntimePackageRoot: passthroughRuntimePackageResolver,
            initialContext: {mode: "project", projectRoot: packagePath},
        });
        const address = await server.start();
        fetchImpl = createServerFetch(`http://${address.host}:${address.port}`);
    });

    afterEach(async () => {
        if (server !== undefined && !packageServerStopped) await server.stop();
        for (const additionalServer of additionalServers.splice(0)) await additionalServer.stop();
        fs.rmSync(studioRoot, {recursive: true, force: true});
        fs.rmSync(workDir, {recursive: true, force: true});
        restoreRunnerClock();
    });

    it("drives real rendered output workflows over a produced package", async () => {
        const user = userEvent.setup();
        const evidence = new ArtifactInteroperabilityRun(workDir);
        const packageApp = renderRoutedApp({fetchImpl, initialEntries: [`/project/${encodeURIComponent(packagePath)}/overview`]});

        await screen.findByRole("heading", {name: "UI Route Slot"});
        await user.click(screen.getByRole("button", {name: "Build/Export"}));
        const buildSection = await screen.findByText("Build artifact");
        expect(buildSection.closest("fieldset")).not.toBeNull();

        // These are browser-driven workflows over StudioServer's actual
        // runtime package.  The test used to select tabs only, which could
        // not distinguish working product actions from merely reachable UI.
        await user.click(screen.getByRole("button", {name: "Play"}));
        await screen.findByRole("button", {name: "New Play session"});
        await user.click(screen.getByRole("button", {name: "New Play session"}));
        await screen.findByRole("button", {name: "Spin"});

        // Exercise an actual unsupported runtime action before the successful
        // round.  The generated package has no free-games mode; Studio must
        // retain that product diagnostic while keeping the real session
        // usable for the next action.
        await user.click(screen.getByRole("button", {name: "Find free games"}));
        const unsupportedScenario = await screen.findByRole("alert");
        expect(unsupportedScenario).not.toBeEmptyDOMElement();

        // An ordinary Spin is a full user-visible product operation, not a
        // route-table assertion: it uses the package's real runtime and emits
        // the durable round artifact consumed by the Replay surface.
        await user.click(screen.getByRole("button", {name: "Spin"}));
        await screen.findByText(/Round complete/i);

        await user.click(screen.getByRole("button", {name: "Simulation"}));
        const rounds = screen.getByRole("textbox", {name: "Rounds"});
        await user.clear(rounds);
        await user.type(rounds, "2");
        await user.click(screen.getByRole("button", {name: "Run Simulation"}));
        // Mantine exposes the step number and description as part of the
        // accessible name ("3 Review See results"), so match the user-facing
        // action instead of assuming the button contains only its label.
        const viewResults = await screen.findByRole("button", {name: /View results/}, {}, {timeout: 30000});
        await user.click(viewResults);
        expect(screen.getAllByRole("cell", {name: /%/}).length).toBeGreaterThan(0);
        await user.click(screen.getByRole("button", {name: /Export Download report/}));
        await screen.findByRole("link", {name: /Download JSON/i});

        await user.click(screen.getByRole("button", {name: "Replay"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "Replay"})).toHaveAttribute("aria-current", "page"));
        await user.click(screen.getByText("Session Spin"));
        await screen.findByRole("button", {name: /Round 1/});
        await user.click(screen.getByRole("button", {name: /Round 1/}));
        await screen.findByText("Round inspector");

        await user.click(screen.getByRole("button", {name: "Provably Fair"}));
        const fairnessBundleInput = screen.getByRole("textbox", {name: "Source outcome-library bundle directory"});
        await user.type(fairnessBundleInput, "missing-outcome-library");
        await user.type(screen.getByRole("textbox", {name: "Mode name"}), "base");
        await user.type(screen.getByRole("textbox", {name: "Server seed"}), "pc14-server-seed");
        await user.type(screen.getByRole("textbox", {name: "Client seed"}), "pc14-client-seed");
        await user.click(screen.getByRole("button", {name: "Compute commitments"}));
        await screen.findByText(/Provably Fair bundle directory/i);

        // The rendered error comes from the same Studio fairness endpoint as
        // the proof workflow.  Correcting it in place must preserve the
        // product flow rather than requiring a new page or a hand-authored
        // proof fixture.
        await user.clear(fairnessBundleInput);
        await user.type(fairnessBundleInput, "outcomes/bundle");
        await user.click(screen.getByRole("button", {name: "Compute commitments"}));
        await screen.findByText("Server seed commitment (publish first)");
        await user.click(screen.getByRole("button", {name: "Continue to Generate/inspect proof"}));
        await user.click(screen.getByRole("button", {name: "Generate round proof"}));
        await screen.findByText("Revealed round");
        await user.click(screen.getByRole("button", {name: "Continue to Verify"}));
        await user.click(screen.getByRole("button", {name: "Verify"}));
        await screen.findByText("Verified");

        // Outcome Source and Certification are deliberately capability-gated
        // to a native Outcome Library.  Reopen the real library as its own
        // Studio project rather than claiming that the runtime-package tabs
        // exercised those separate product surfaces.
        packageApp.unmount();
        await server.stop();
        packageServerStopped = true;
        fs.mkdirSync(path.join(outcomeLibraryPath, "certification"));
        const outcomeLibraryHome = new StudioHomeService(POKIE_VERSION);
        const outcomeLibraryServer = new StudioServer({
            pokieVersion: POKIE_VERSION, host: "127.0.0.1", port: 0, studioRoot,
            homeService: outcomeLibraryHome,
            blueprintService: new StudioBlueprintService(POKIE_VERSION, studioRoot, outcomeLibraryHome),
            loadGame: createStudioGameLoader(process.cwd()),
            resolveRuntimePackageRoot: passthroughRuntimePackageResolver,
            initialContext: {mode: "project", projectRoot: outcomeLibraryPath},
        });
        additionalServers.push(outcomeLibraryServer);
        const outcomeLibraryAddress = await outcomeLibraryServer.start();
        const outcomeLibraryFetch = createServerFetch(`http://${outcomeLibraryAddress.host}:${outcomeLibraryAddress.port}`);
        const outcomeLibraryApp = renderRoutedApp({fetchImpl: outcomeLibraryFetch, initialEntries: [`/project/${encodeURIComponent(outcomeLibraryPath)}/overview`]});

        await screen.findByRole("heading", {name: "Outcome Source"});
        await user.type(screen.getByRole("textbox", {name: "Seed (optional)"}), "pc14-outcome-source-seed");
        await user.click(screen.getByRole("button", {name: "Draw an outcome"}));
        await screen.findByText(/Drew outcome/);

        await user.click(screen.getByRole("button", {name: "Certification"}));
        const certificationBundleInput = screen.getByRole("textbox", {name: "Source outcome-library bundle directory"});
        await user.type(certificationBundleInput, "missing-outcome-library");
        await user.click(screen.getByRole("button", {name: "Continue to Validate"}));
        await user.click(screen.getByRole("button", {name: "Validate source bundle"}));
        await screen.findByText("Failed");
        await user.click(screen.getByText("Select/configure"));
        const recoveredCertificationBundleInput = screen.getByRole("textbox", {name: "Source outcome-library bundle directory"});
        await user.clear(recoveredCertificationBundleInput);
        await user.type(recoveredCertificationBundleInput, ".");
        await user.clear(screen.getByRole("textbox", {name: "Mode name"}));
        await user.type(screen.getByRole("textbox", {name: "Mode name"}), "base");
        await user.type(screen.getByRole("textbox", {name: "Seed"}), "pc14-certification-seed");
        await user.click(screen.getByRole("button", {name: "Continue to Validate"}));
        await user.click(screen.getByRole("button", {name: "Validate source bundle"}));
        await screen.findByText("Clean");
        await user.click(screen.getByRole("button", {name: "Continue to Build bundle"}));
        await user.clear(screen.getByRole("textbox", {name: "Output directory"}));
        await user.type(screen.getByRole("textbox", {name: "Output directory"}), "certification");
        await user.click(screen.getByRole("button", {name: "Build certification bundle"}));
        await screen.findByText("Continue to Inspect");
        await user.click(screen.getByRole("button", {name: "Continue to Inspect"}));
        await screen.findByText("Per-mode evidence");
        await user.click(screen.getByRole("button", {name: "Continue to Export"}));
        await screen.findByText("Output directory");

        // Build/Export is also the retained Studio route for Stake.  Drive
        // the rendered card through a failed occupied destination and then a
        // successful publication, so the UI evidence covers an artifact
        // output and recovery rather than only the server-side Stake service.
        await user.click(screen.getByRole("button", {name: "Build/Export"}));
        const stakeHeading = await screen.findByText("Stake Engine export");
        const stakeCard = stakeHeading.closest("div")?.parentElement;
        expect(stakeCard).not.toBeNull();
        const stake = within(stakeCard!);
        const stakeDestination = stake.getByRole("textbox", {name: "Output directory (optional)"});
        const occupiedStakePath = path.join(workDir, "occupied-stake");
        fs.mkdirSync(occupiedStakePath);
        fs.writeFileSync(path.join(occupiedStakePath, "borrowed.txt"), "caller-owned");
        await user.clear(stakeDestination);
        await user.type(stakeDestination, occupiedStakePath);
        await screen.findByText("This destination already contains files. Choose a different destination; Build will not overwrite it.");
        expect(stake.getByRole("button", {name: "Build"})).toBeDisabled();
        expect(fs.readFileSync(path.join(occupiedStakePath, "borrowed.txt"), "utf8")).toBe("caller-owned");
        const stakePath = path.join(workDir, "studio-ui-stake");
        await user.clear(stakeDestination);
        await user.type(stakeDestination, stakePath);
        await waitFor(() => expect(stake.getByRole("button", {name: "Build"})).toBeEnabled());
        await user.click(stake.getByRole("button", {name: "Build"}));
        await screen.findByText(new RegExp(`Built to ${stakePath.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}`), {}, {timeout: 30000});
        expect(fs.existsSync(path.join(stakePath, "pokie-manifest.json"))).toBe(true);

        evidence.recordScenario({
            id: "studio-ui-outcome-source-certification-output-error-recovery",
            sourcePath: outcomeLibraryPath,
            producedPath: path.join(outcomeLibraryPath, "certification"),
            result: "the rendered Outcome Source drew a recorded real outcome, while Certification rejected a missing source, recovered with the opened Outcome Library, and published inspectable certification evidence",
            surface: "studio-ui",
            owner: "OutcomeSourceOverview / CertificationTab",
            systemicClasses: ["provenance-and-freshness-binding", "durable-publication-ownership"],
            assertions: [
                "Outcome Source drew a deterministic real outcome from the opened generated library",
                "Certification rendered the missing-source diagnostic before any evidence publication",
                "correcting the source to the opened native library enabled validation, evidence publication, inspection, and export",
            ],
            observations: [
                {route: "UI /project/:projectRoot/overview (Outcome Source)", result: "drew and rendered a real round artifact from the generated Outcome Library"},
                {route: "POST /api/project/outcome-source/sample", result: "returned the recorded seeded Outcome Library draw"},
                {route: "UI /project/:projectRoot/certification (Certification)", result: "completed source error, validation recovery, build, inspection, and export workflow"},
                {route: "POST /api/project/certification/validate-source", result: "returned both the missing-path error and the recovered native-bundle validation"},
                {route: "POST /api/project/certification/build", result: "published the real certification evidence bundle consumed by the rendered inspector"},
            ],
        });

        evidence.recordScenario({
            id: "studio-ui-stake-output-error-recovery",
            sourcePath: outcomeLibraryPath,
            producedPath: stakePath,
            result: "the rendered Build/Export Stake card preserved a caller-owned occupied destination, then published a real Stake export after the destination was corrected",
            surface: "studio-ui",
            owner: "ExportDeployTab",
            systemicClasses: ["provenance-and-freshness-binding", "durable-publication-ownership"],
            assertions: [
                "the rendered Stake card received the server preflight conflict for an occupied caller-owned destination",
                "the rejected destination retained its borrowed file unchanged",
                "correcting the destination enabled the real Stake artifact publication and manifest output",
            ],
            observations: [
                {route: "UI /project/:projectRoot/exportDeploy (Stake Engine export)", result: "rendered the occupied-destination error and the recovered Stake publication"},
                {route: "POST /api/project/artifacts/preview", result: "returned the resolved occupied-destination conflict then the prepared Stake plan"},
                {route: "POST /api/project/artifacts/build", result: "published the real Stake Engine export after the corrected preflight"},
            ],
        });

        evidence.recordScenario({
            id: "studio-ui-provably-fair-output-error-recovery",
            sourcePath: outcomeLibraryPath,
            result: "the rendered Provably Fair workflow rejected a missing generated-artifact path, recovered with the real Outcome Library, and completed a generated proof verification",
            surface: "studio-ui",
            owner: "ProjectDashboardPage / ProvablyFairTab",
            systemicClasses: ["provenance-and-freshness-binding", "durable-publication-ownership"],
            assertions: [
                "the UI returned the Studio endpoint's path-aware error for a missing Outcome Library",
                "correcting the source path retained the entered seeds and computed the real commitments",
                "the same rendered workflow generated and verified a proof against the CLI-produced Outcome Library",
            ],
            observations: [
                {route: "UI /project/:projectRoot/provablyFair (Provably Fair)", result: "recovered from a missing bundle diagnostic and verified a generated proof against the real Outcome Library"},
                {route: "POST /api/project/fairness/configure", result: "rendered both the path error and the recovered commitment result"},
                {route: "POST /api/project/fairness/generate", result: "rendered the generated real round proof"},
                {route: "POST /api/project/fairness/verify", result: "rendered the verified proof result"},
            ],
        });

        evidence.recordScenario({
            id: "studio-ui-blueprint-runtime-workflows",
            sourcePath: blueprintPath,
            producedPath: packagePath,
            result: "the rendered Studio dashboard opened the real CLI-produced package, emitted a real round artifact, and exported a completed simulation report",
            surface: "studio-ui",
            owner: "ProjectDashboardPage / ExportDeployTab / PlayTab / SimulationTab / ReplayTab",
            systemicClasses: ["shared-conversion-diagnostic-parity", "durable-publication-ownership"],
            assertions: [
                "the rendered Build/Export tab exposed the real package's server-owned artifact surface",
                "the UI opened the CLI-produced package rather than a hand-authored browser fixture",
                "Play rendered the generated package's unsupported free-games diagnostic without discarding the active session",
                "the same rendered Play session recovered by spinning a completed real round after the unsupported scenario",
                "Play used the real package runtime and rendered a completed round artifact",
                "Simulation completed against the same package and exposed its real report download output",
                "Provably Fair rejected a missing Outcome Library path, then generated and verified a proof against the real generated library",
            ],
            observations: [
                {route: "UI /project/:projectRoot/exportDeploy (Build/Export)", result: "selected the rendered build/export workflow for the real produced package"},
                {route: "UI /project/:projectRoot/play (Play)", result: "created a session, rendered an unsupported free-games diagnostic, then recovered by spinning a completed round artifact"},
                {route: "UI /project/:projectRoot/simulation (Simulation)", result: "ran two rounds, rendered the completed report, and exposed its JSON download"},
                {route: "UI /project/:projectRoot/replay (Replay)", result: "selected the persisted Play round and rendered its replay artifact inspector"},
                {route: "UI /project/:projectRoot/provablyFair (Provably Fair)", result: "completed the generated-proof output, error, and recovery workflow against the real Outcome Library"},
            ],
        });

        // The project dashboard cannot exercise the creator's persisted
        // Blueprint/PAR flow: it deliberately opens an already materialized
        // project.  Reopen the rendered Home designer against the same real
        // Studio server implementation and drive the actual edit -> save ->
        // PAR export conflict/recovery -> PAR import sequence.  This keeps
        // UI observations separate from the project-dashboard API records.
        outcomeLibraryApp.unmount();
        const designHome = new StudioHomeService(POKIE_VERSION);
        const designServer = new StudioServer({
            pokieVersion: POKIE_VERSION, host: "127.0.0.1", port: 0, studioRoot,
            homeService: designHome,
            blueprintService: new StudioBlueprintService(POKIE_VERSION, studioRoot, designHome),
            loadGame: createStudioGameLoader(process.cwd()),
            resolveRuntimePackageRoot: passthroughRuntimePackageResolver,
            initialContext: {mode: "home"},
        });
        additionalServers.push(designServer);
        const designAddress = await designServer.start();
        const designFetch = createServerFetch(`http://${designAddress.host}:${designAddress.port}`);
        const designApp = renderRoutedApp({fetchImpl: designFetch, initialEntries: ["/home/design"]});

        await screen.findByRole("heading", {name: "Design Your Game"});
        const gameName = screen.getByRole("textbox", {name: "Game name"});
        await user.clear(gameName);
        await user.type(gameName, "PC-14 Edited Studio Blueprint");
        await user.click(screen.getByRole("button", {name: /Show advanced options/}));
        const savedBlueprintPath = path.join(workDir, "studio-ui-edited.blueprint.json");
        // Mantine mounts the guided editor's advanced fields through an
        // animated Collapse.  The disclosure state changes synchronously,
        // while the accessible field becomes available on the next render.
        const saveBlueprintInput = await screen.findByRole("textbox", {name: "Save to path"});
        await user.type(saveBlueprintInput, savedBlueprintPath);
        await user.click(screen.getByRole("button", {name: "Save"}));
        await screen.findByText(`Saved to "${savedBlueprintPath}".`);
        expect(JSON.parse(fs.readFileSync(savedBlueprintPath, "utf8"))).toMatchObject({manifest: {name: "PC-14 Edited Studio Blueprint"}});

        // PAR's export surface is the final step of the same guided panel;
        // selecting it before an import is intentional and validates that a
        // freshly saved Blueprint has a real export-only route.
        await user.click(screen.getAllByText("Apply / Export")[0]!);
        const parExportInput = screen.getByRole("textbox", {name: "Export to path"});
        const occupiedParPath = path.join(workDir, "occupied.par.xlsx");
        fs.writeFileSync(occupiedParPath, "caller-owned PAR destination");
        await user.clear(parExportInput);
        await user.type(parExportInput, occupiedParPath);
        await user.click(screen.getByRole("button", {name: "Export"}));
        await screen.findByText(/already exists|never overwritten/i);
        expect(fs.readFileSync(occupiedParPath, "utf8")).toBe("caller-owned PAR destination");
        const exportedParPath = path.join(workDir, "studio-ui-edited.par.xlsx");
        await user.clear(parExportInput);
        await user.type(parExportInput, exportedParPath);
        await user.click(screen.getByRole("button", {name: "Export"}));
        await screen.findByText("Exported successfully");
        expect(fs.existsSync(exportedParPath)).toBe(true);

        await user.click(screen.getAllByText("Import")[0]!);
        const parImportInput = screen.getByRole("textbox", {name: "PAR sheet path"});
        await user.type(parImportInput, exportedParPath);
        await user.click(screen.getByRole("button", {name: "Import"}));
        await user.click(await screen.findByRole("button", {name: "Continue to Preview canonical model"}));
        await user.click(screen.getByRole("button", {name: "Preview canonical model"}));
        await screen.findByRole("button", {name: "Continue to Apply / Export"});

        evidence.recordScenario({
            id: "studio-ui-blueprint-par-output-error-recovery",
            sourcePath: savedBlueprintPath,
            producedPath: exportedParPath,
            result: "the rendered Design Game editor saved an edited Blueprint, preserved an occupied caller-owned PAR destination, recovered to publish a workbook, then imported and previewed that workbook through the canonical PAR flow",
            surface: "studio-ui",
            owner: "BlueprintEditorPage / ParSheetImportExportPanel",
            systemicClasses: ["provenance-and-freshness-binding", "durable-publication-ownership"],
            assertions: [
                "editing the rendered Blueprint changed the persisted game name before save",
                "PAR export rejected an occupied caller-owned file without altering its bytes",
                "correcting the destination published a real workbook which the rendered PAR importer diagnosed and previewed",
            ],
            observations: [
                {route: "UI /home/design (Blueprint editor)", result: "edited and saved a real Blueprint through Studio's home API"},
                {route: "POST /api/home/blueprints/save", result: "persisted the edited Blueprint at the selected path"},
                {route: "UI /home/design (PAR Sheet Import / Export)", result: "rendered occupied-destination recovery, workbook publication, and import/preview"},
                {route: "POST /api/home/blueprints/par-export", result: "returned the occupied-file error then wrote the recovered workbook"},
                {route: "POST /api/home/blueprints/par-import", result: "read the UI-produced workbook into the canonical Blueprint model"},
            ],
        });
        // The editor polls a loaded source for drift.  Unmount it before
        // stopping the server so the real UI's recovery mechanism cannot
        // leave an HTTP request open during test cleanup.
        designApp.unmount();
        await designServer.stop();
        additionalServers.splice(additionalServers.indexOf(designServer), 1);

        const evidenceDirectory = process.env.PC14_INTEROPERABILITY_EVIDENCE_OUTPUT_DIR;
        const emittedPath = evidenceDirectory === undefined
            ? path.join(workDir, "pc14-studio-ui-real-artifact-result.json")
            : path.join(evidenceDirectory, "studio-ui-real-artifact-result.json");
        const priorRunPaths = evidenceDirectory === undefined ? [] : [
            path.join(evidenceDirectory, "cli-real-artifact-result.json"),
            path.join(evidenceDirectory, "studio-real-artifact-result.json"),
        ];
        // The two preceding runners have already exercised their owners.
        // Complete the remaining PC-05 public boundaries in this final,
        // rendered runner before serialising the ledger; the merge below is
        // intentionally only a complete-set validator.
        if (priorRunPaths.every((candidate) => fs.existsSync(candidate))) {
            recordRemainingPc05OwnerOperationBoundaries(evidence, blueprintPath, priorRunPaths);
        }
        evidence.write(emittedPath);
        const emittedText = fs.readFileSync(emittedPath, "utf8");
        expect(emittedText).toContain('"id": "studio-ui-blueprint-runtime-workflows"');
        expect(emittedText).toContain('"produced_path": "run-artifacts/tsPackage"');
        const persistedResultPath = process.env.PC14_INTEROPERABILITY_PERSISTED_RESULT;
        if (persistedResultPath !== undefined && evidenceDirectory !== undefined) {
            mergeArtifactInteroperabilityRuns([
                path.join(evidenceDirectory, "cli-real-artifact-result.json"),
                path.join(evidenceDirectory, "studio-real-artifact-result.json"),
                emittedPath,
            ], persistedResultPath, {requireComplete: true});
        }
    }, 120000);
});
