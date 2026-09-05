import {act, screen, waitFor} from "@testing-library/react";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import {passthroughRuntimePackageResolver} from "../../../../cli/materialize/materializeRuntimePackage.js";
import {StudioBlueprintService} from "../../../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioHomeService} from "../../../../cli/studio/home/StudioHomeService.js";
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

describe("PC-16 Studio context lifecycle (browser, real Studio HTTP)", () => {
    let studioRoot: string;
    let workDir: string;
    let firstProject: string;
    let secondProject: string;
    let server: StudioServer;
    let fetchImpl: FetchLike;

    beforeEach(async () => {
        studioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-pc16-context-assets-"));
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-pc16-context-projects-"));
        writeStudioAssets(studioRoot);
        firstProject = path.join(workDir, "first.blueprint.json");
        secondProject = path.join(workDir, "second.blueprint.json");
        for (const [projectRoot, id, name] of [[firstProject, "first", "First Slot"], [secondProject, "second", "Second Slot"]] as const) {
            fs.writeFileSync(projectRoot, JSON.stringify({
                manifest: {id, name, version: "1.0.0"},
                reels: 2, rows: 1, symbols: ["A", "B"], paytable: {A: {2: 1}},
                reelStrips: [["A", "B"], ["A", "B"]], availableBets: [1],
            }));
        }
        const loadGame = (projectRoot: string) => Promise.resolve({getManifest: () => ({
            id: projectRoot === firstProject ? "first" : "second",
            name: projectRoot === firstProject ? "First Slot" : "Second Slot",
            version: "1.0.0",
        })}) as never;
        const homeService = new StudioHomeService("1.0.0", undefined, loadGame, undefined, passthroughRuntimePackageResolver);
        server = new StudioServer({
            pokieVersion: "1.0.0", host: "127.0.0.1", port: 0, studioRoot,
            homeService,
            blueprintService: new StudioBlueprintService("1.0.0", studioRoot, homeService),
            loadGame,
            resolveRuntimePackageRoot: passthroughRuntimePackageResolver,
            initialContext: {mode: "project", projectRoot: firstProject},
        });
        const address = await server.start();
        fetchImpl = createServerFetch(`http://${address.host}:${address.port}`);
    });

    afterEach(async () => {
        await server.stop();
        fs.rmSync(studioRoot, {recursive: true, force: true});
        fs.rmSync(workDir, {recursive: true, force: true});
    });

    it("restores the exact historical project before its tab becomes interactive", async () => {
        const firstRoute = `/project/${encodeURIComponent(firstProject)}/overview`;
        const secondRoute = `/project/${encodeURIComponent(secondProject)}/overview`;
        const {router} = renderRoutedApp({fetchImpl, initialEntries: [firstRoute]});

        await screen.findByRole("heading", {name: "First Slot"});
        await act(async () => {
            await router.navigate(secondRoute);
        });
        await screen.findByRole("heading", {name: "Second Slot"});
        expect(screen.getByRole("button", {name: "Overview"})).toHaveAttribute("aria-current", "page");
        expect(screen.queryByText("First Slot")).not.toBeInTheDocument();

        await act(async () => {
            await router.navigate(-1);
        });
        await screen.findByRole("heading", {name: "First Slot"});
        await waitFor(() => expect(router.state.location.pathname).toBe(firstRoute));
        expect(screen.getByRole("button", {name: "Overview"})).toHaveAttribute("aria-current", "page");
    });
});
