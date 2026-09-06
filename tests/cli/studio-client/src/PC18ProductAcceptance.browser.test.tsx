import {act, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import {passthroughRuntimePackageResolver} from "../../../../cli/materialize/materializeRuntimePackage.js";
import {StudioArtifactConversionPlanningService} from "../../../../cli/studio/artifacts/StudioArtifactConversionPlanningService.js";
import {StudioBlueprintService} from "../../../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioHomeService} from "../../../../cli/studio/home/StudioHomeService.js";
import {StudioServer} from "../../../../cli/studio/StudioServer.js";
import {computeGameBlueprintHash} from "../../../../src/generated/computeGameBlueprintHash.js";
import type {FetchLike} from "../../../../cli/studio-client/src/api/apiClient.js";
import {buildFixtureGame} from "../../../weightedoutcome/generate/GenerateTestFixtures.js";
import {renderRoutedApp} from "./testUtils/renderRoutedApp";

function writeStudioAssets(root: string): void {
    fs.writeFileSync(path.join(root, "index.html"), "<html>studio</html>");
    fs.writeFileSync(path.join(root, "main.js"), "");
    fs.writeFileSync(path.join(root, "style.css"), "");
}

function createServerFetch(baseUrl: string): FetchLike {
    return (url, init) => new Promise((resolve, reject) => {
        const request = http.request(`${baseUrl}${url}`, {method: init?.method, headers: init?.headers}, (response) => {
            const chunks: Buffer[] = [];
            response.on("data", (chunk: Buffer) => chunks.push(chunk));
            response.on("end", () => resolve({
                ok: (response.statusCode ?? 500) < 300, status: response.statusCode ?? 500,
                json: () => Promise.resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))),
            }));
        });
        request.on("error", reject);
        request.end(init?.body);
    });
}

describe("PC-18 Studio product acceptance", () => {
    it("does not make a prior project's visible dashboard interactive after a project switch", async () => {
        const studioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-pc18-browser-assets-"));
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-pc18-browser-projects-"));
        writeStudioAssets(studioRoot);
        const first = path.join(workDir, "first.blueprint.json");
        const second = path.join(workDir, "second.blueprint.json");
        for (const [project, id, name] of [[first, "first", "First PC-18 Slot"], [second, "second", "Second PC-18 Slot"]] as const) {
            fs.writeFileSync(project, JSON.stringify({
                manifest: {id, name, version: "1.0.0"}, reels: 2, rows: 1, symbols: ["A", "B"],
                paytable: {A: {2: 1}}, reelStrips: [["A", "B"], ["A", "B"]], availableBets: [1],
            }));
        }
        const loadGame = (project: string) => Promise.resolve({getManifest: () => ({
            id: project === first ? "first" : "second", name: project === first ? "First PC-18 Slot" : "Second PC-18 Slot", version: "1.0.0",
        })}) as never;
        const home = new StudioHomeService("1.0.0", undefined, loadGame, undefined, passthroughRuntimePackageResolver);
        const server = new StudioServer({
            pokieVersion: "1.0.0", host: "127.0.0.1", port: 0, studioRoot, homeService: home,
            blueprintService: new StudioBlueprintService("1.0.0", studioRoot, home), loadGame,
            resolveRuntimePackageRoot: passthroughRuntimePackageResolver, initialContext: {mode: "project", projectRoot: first},
        });
        try {
            const address = await server.start();
            const {router} = renderRoutedApp({fetchImpl: createServerFetch(`http://${address.host}:${address.port}`), initialEntries: [`/project/${encodeURIComponent(first)}/overview`]});
            await screen.findByRole("heading", {name: "First PC-18 Slot"});
            await act(async () => {
                await router.navigate(`/project/${encodeURIComponent(second)}/simulation`);
            });
            await screen.findByRole("heading", {name: "Second PC-18 Slot"});
            await waitFor(() => expect(router.state.location.pathname).toBe(`/project/${encodeURIComponent(second)}/simulation`));
            expect(screen.queryByRole("heading", {name: "First PC-18 Slot"})).not.toBeInTheDocument();
        } finally {
            await server.stop();
            fs.rmSync(studioRoot, {recursive: true, force: true});
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("hands a rendered managed Blueprint Outcome Library action to a fresh canonical Stake plan", async () => {
        const studioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-pc18-outcome-assets-"));
        const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-pc18-outcome-project-"));
        const blueprint = path.join(projectRoot, "blueprint.json");
        const source = {
            manifest: {id: "fixture-slot", name: "Fixture Slot", version: "1.0.0"},
            reels: 2,
            rows: 1,
            symbols: ["A", "B"],
            paytable: {A: {2: 5}},
            reelStrips: [["A", "A", "B"], ["A", "B"]],
            availableBets: [1],
        };
        fs.writeFileSync(blueprint, JSON.stringify(source));
        writeStudioAssets(studioRoot);
        const fixture = buildFixtureGame();
        const loadGame = jest.fn(() => Promise.resolve({
            ...fixture,
            getManifest: () => source.manifest,
            getConfigHash: () => computeGameBlueprintHash(source),
        }) as never);
        const prepare = jest.spyOn(StudioArtifactConversionPlanningService.prototype, "prepare");
        const server = new StudioServer({
            pokieVersion: "1.0.0",
            host: "127.0.0.1",
            port: 0,
            studioRoot,
            homeService: new StudioHomeService("1.0.0", undefined, loadGame, undefined, passthroughRuntimePackageResolver),
            blueprintService: new StudioBlueprintService("1.0.0", studioRoot, new StudioHomeService("1.0.0", undefined, loadGame, undefined, passthroughRuntimePackageResolver)),
            loadGame,
            resolveRuntimePackageRoot: passthroughRuntimePackageResolver,
            initialContext: {mode: "project", projectRoot: blueprint},
        });
        try {
            const address = await server.start();
            const requests: string[] = [];
            const serverFetch = createServerFetch(`http://${address.host}:${address.port}`);
            const fetchImpl: FetchLike = (url, init) => {
                requests.push(`${init?.method ?? "GET"} ${url.split("?")[0]}`);
                return serverFetch(url, init);
            };
            const user = userEvent.setup();
            renderRoutedApp({fetchImpl, initialEntries: [`/project/${encodeURIComponent(blueprint)}/exportDeploy`]});

            await screen.findByRole("button", {name: "Generate exact outcome library (base)"});
            await waitFor(() => expect(requests.filter((request) => request === "POST /api/project/outcome-libraries/generate/estimate").length).toBeGreaterThan(1));
            const generate = screen.getByRole("button", {name: "Generate exact outcome library (base)"});
            await waitFor(() => expect(generate).toBeEnabled());
            await user.click(generate);
            expect(await screen.findByText(/Generated .* outcomes for mode "base" using exact/, {}, {timeout: 10000})).toBeInTheDocument();

            expect(prepare).toHaveBeenCalledWith(
                blueprint,
                "outcomeLibrary",
                path.join(projectRoot, "outcomelibrary"),
                expect.objectContaining({generationSemantics: "exact"}),
            );
            await waitFor(() => expect(requests.filter((request) => request === "POST /api/project/artifacts/preview").length).toBeGreaterThan(4));

            const stakeCard = screen.getByText("Stake Engine export", {selector: "p"}).closest('div[style*="margin-bottom"]');
            expect(stakeCard).not.toBeNull();
            const build = within(stakeCard!).getByRole("button", {name: "Build"});
            await waitFor(() => expect(build).toBeEnabled());
        } finally {
            prepare.mockRestore();
            await server.stop();
            fs.rmSync(studioRoot, {recursive: true, force: true});
            fs.rmSync(projectRoot, {recursive: true, force: true});
        }
    }, 30000);
});
