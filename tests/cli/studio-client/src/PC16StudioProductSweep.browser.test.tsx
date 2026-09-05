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
import {renderRoutedApp} from "./testUtils/renderRoutedApp";

function writeStudioAssets(root: string): void {
    fs.writeFileSync(path.join(root, "index.html"), "<html>studio</html>");
    fs.writeFileSync(path.join(root, "main.js"), "console.log('studio');");
    fs.writeFileSync(path.join(root, "style.css"), "body { margin: 0; }");
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

describe("PC-16 Studio product sweep (browser, real Studio HTTP)", () => {
    let studioRoot: string;
    let projectRoot: string;
    let workDir: string;
    let server: StudioServer;
    let fetchImpl: FetchLike;

    beforeEach(async () => {
        studioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-pc16-sweep-assets-"));
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-pc16-sweep-project-"));
        writeStudioAssets(studioRoot);
        const blueprintPath = path.join(workDir, "sweep.blueprint.json");
        fs.writeFileSync(blueprintPath, JSON.stringify({
            manifest: {id: "sweep", name: "Sweep Slot", version: "1.0.0"},
            reels: 2, rows: 1, symbols: ["A", "B"], paytable: {A: {2: 2}},
            reelStrips: [["A", "B"], ["A", "B"]], availableBets: [1],
        }));
        const generatedPackage = path.join(workDir, "generated-package");
        expect(await new BuildCommand("1.0.0").run([blueprintPath, "--target", "tsPackage", "--out", generatedPackage])).toBe(0);
        projectRoot = generatedPackage;
        const homeService = new StudioHomeService("1.0.0");
        server = new StudioServer({
            pokieVersion: "1.0.0", host: "127.0.0.1", port: 0, studioRoot,
            homeService,
            blueprintService: new StudioBlueprintService("1.0.0", studioRoot, homeService),
            loadGame: createStudioGameLoader(process.cwd()),
            resolveRuntimePackageRoot: passthroughRuntimePackageResolver,
            initialContext: {mode: "project", projectRoot},
        });
        const address = await server.start();
        fetchImpl = createServerFetch(`http://${address.host}:${address.port}`);
    });

    afterEach(async () => {
        await server.stop();
        fs.rmSync(studioRoot, {recursive: true, force: true});
        fs.rmSync(workDir, {recursive: true, force: true});
    });

    it("turns a retired deep link into one visible recovery path without mounting a duplicate workflow", async () => {
        const user = userEvent.setup();
        const route = `/project/${encodeURIComponent(projectRoot)}/deployment`;
        const {router} = renderRoutedApp({fetchImpl, initialEntries: [route]});

        await screen.findByRole("heading", {name: "Sweep Slot"});
        await waitFor(() => expect(router.state.location.pathname).toBe(`/project/${encodeURIComponent(projectRoot)}/exportDeploy`));
        expect(screen.getByText("Deployment has moved into Build/Export. Choose Remote delivery there to preview or publish to a configured target.")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Build/Export"})).toHaveAttribute("aria-current", "page");
        expect(screen.queryByRole("button", {name: "Deployment"})).not.toBeInTheDocument();

        const runSimulation = screen.getByRole("button", {name: "Simulation"});
        await user.click(runSimulation);
        const rounds = await screen.findByRole("textbox", {name: "Rounds"});
        await user.clear(rounds);
        await user.type(rounds, "2");
        await user.click(screen.getByRole("button", {name: "Run Simulation"}));
        await screen.findByRole("button", {name: /View results/}, {}, {timeout: 30000});
        expect(screen.queryByText(/Deployment has moved into Build\/Export/)).not.toBeInTheDocument();
    });
});
