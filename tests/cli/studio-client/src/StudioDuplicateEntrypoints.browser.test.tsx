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
        const request = http.request(`${baseUrl}${url}`, {
            method: init?.method,
            headers: init?.headers,
        }, (response) => {
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

describe("Studio duplicate entrypoints (browser, real Studio HTTP)", () => {
    let studioRoot: string;
    let workDir: string;
    let projectRoot: string;
    let server: StudioServer;
    let fetchImpl: FetchLike;

    beforeEach(async () => {
        studioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-duplicate-routes-assets-"));
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-duplicate-routes-project-"));
        writeStudioAssets(studioRoot);
        projectRoot = path.join(workDir, "route-slot.blueprint.json");
        fs.writeFileSync(projectRoot, JSON.stringify({
            manifest: {id: "route-slot", name: "Route Slot", version: "1.0.0"},
            reels: 2, rows: 1, symbols: ["A", "B"], paytable: {A: {2: 1}},
            reelStrips: [["A", "B"], ["A", "B"]], availableBets: [1],
        }));
        const homeService = new StudioHomeService("1.0.0");
        server = new StudioServer({
            pokieVersion: "1.0.0", host: "127.0.0.1", port: 0, studioRoot,
            homeService,
            blueprintService: new StudioBlueprintService("1.0.0", studioRoot, homeService),
            // The browser only needs the dashboard manifest. Validation and every
            // route DTO below still come from the real Blueprint/server domain.
            loadGame: () => Promise.resolve({getManifest: () => ({id: "route-slot", name: "Route Slot", version: "1.0.0"})}) as never,
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

    it("renders scoped and unscoped retired-route recovery from real project DTOs", async () => {
        const cases: Array<["legacy" | "scoped", string, "overview" | "exportDeploy", RegExp]> = [
            ["legacy", "deployment", "exportDeploy", /Deployment has moved into Build\/Export/],
            ["scoped", "deployment", "exportDeploy", /Deployment has moved into Build\/Export/],
            ["legacy", "stakeEngineExport", "exportDeploy", /Stake Engine Export has moved into Build\/Export/],
            ["scoped", "stakeEngineExport", "exportDeploy", /Stake Engine Export has moved into Build\/Export/],
            ["legacy", "outcomeLibraries", "overview", /Outcome Libraries is no longer available in Studio/],
            ["scoped", "outcomeLibraries", "overview", /Outcome Libraries is no longer available in Studio/],
            ["legacy", "validate", "overview", /Validate is now part of Overview diagnostics/],
            ["scoped", "validation", "overview", /Validate is now part of Overview diagnostics/],
            ["legacy", "retired-section", "overview", /The requested Studio section is no longer available/],
            ["scoped", "retired-section", "overview", /The requested Studio section is no longer available/],
        ];
        const initialEntry = `/project/${encodeURIComponent(projectRoot)}/overview`;
        const {router} = renderRoutedApp({fetchImpl, initialEntries: [initialEntry]});

        await screen.findByRole("heading", {name: "Route Slot"});
        for (const [kind, retiredTab, destination, recovery] of cases) {
            const entry = kind === "legacy" ? `/project/${retiredTab}` : `/project/${encodeURIComponent(projectRoot)}/${retiredTab}`;
            await act(async () => {
                await router.navigate(entry);
            });
            await waitFor(() => expect(router.state.location.pathname).toBe(`/project/${encodeURIComponent(projectRoot)}/${destination}`));
            await screen.findByRole("heading", {name: "Route Slot"});
            expect(screen.getByRole("button", {name: destination === "overview" ? "Overview" : "Build/Export"})).toHaveAttribute("aria-current", "page");
            expect(screen.getByText(recovery)).toBeInTheDocument();
        }
    });
});
