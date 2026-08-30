import {screen, waitFor} from "@testing-library/react";
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
import {ArtifactInteroperabilityRun, installPc14FixedRunnerClock, mergeArtifactInteroperabilityRuns} from "../../../support/ArtifactInteroperabilityRun.js";
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
    let server: StudioServer;
    let fetchImpl: FetchLike;
    let restoreRunnerClock: () => void;

    beforeEach(async () => {
        restoreRunnerClock = installPc14FixedRunnerClock();
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
        await server.stop();
        fs.rmSync(studioRoot, {recursive: true, force: true});
        fs.rmSync(workDir, {recursive: true, force: true});
        restoreRunnerClock();
    });

    it("drives real rendered output workflows over a produced package", async () => {
        const user = userEvent.setup();
        const evidence = new ArtifactInteroperabilityRun(workDir);
        renderRoutedApp({fetchImpl, initialEntries: [`/project/${encodeURIComponent(packagePath)}/overview`]});

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
        await screen.findByRole("button", {name: /View results/}, {}, {timeout: 30000});
        await user.click(screen.getByRole("button", {name: /View results/}));
        expect(screen.getAllByRole("cell", {name: /%/}).length).toBeGreaterThan(0);
        await user.click(screen.getByRole("button", {name: /Export Download report/}));
        await screen.findByRole("link", {name: /Download JSON/i});

        await user.click(screen.getByRole("button", {name: "Replay"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "Replay"})).toHaveAttribute("aria-current", "page"));
        await user.click(screen.getByText("Session Spin"));
        await screen.findByRole("button", {name: /Round 1/});
        await user.click(screen.getByRole("button", {name: /Round 1/}));
        await screen.findByText("Round inspector");

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
            ],
            observations: [
                {route: "UI /project/:projectRoot/exportDeploy (Build/Export)", result: "selected the rendered build/export workflow for the real produced package"},
                {route: "UI /project/:projectRoot/play (Play)", result: "created a session, rendered an unsupported free-games diagnostic, then recovered by spinning a completed round artifact"},
                {route: "UI /project/:projectRoot/simulation (Simulation)", result: "ran two rounds, rendered the completed report, and exposed its JSON download"},
                {route: "UI /project/:projectRoot/replay (Replay)", result: "selected the persisted Play round and rendered its replay artifact inspector"},
            ],
        });

        const evidenceDirectory = process.env.PC14_INTEROPERABILITY_EVIDENCE_OUTPUT_DIR;
        const emittedPath = evidenceDirectory === undefined
            ? path.join(workDir, "pc14-studio-ui-real-artifact-result.json")
            : path.join(evidenceDirectory, "studio-ui-real-artifact-result.json");
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
            ], persistedResultPath);
        }
    }, 60000);
});
