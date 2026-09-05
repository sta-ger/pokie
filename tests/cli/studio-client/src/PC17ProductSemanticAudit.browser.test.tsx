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
import {describeOutcomeLibraryGenerationTerminalOutcome} from "../../../../cli/studio-client/src/domain/outcomeLibraryGenerateError.js";
import {describeProjectContextFailure} from "../../../../cli/studio-client/src/domain/interpret/ProjectDashboard.js";
import {renderRoutedApp} from "./testUtils/renderRoutedApp";

const SEMANTIC_AUDIT_PATH = path.resolve(process.cwd(), "docs/evidence/phase7-product-coherence/pc-17-parity-semantic-audit/PRODUCT-SEMANTICS.md");

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

describe("PC-17 product-semantic audit", () => {
    it("keeps recovery attached to a user goal without exposing internal paths or records as prerequisites", () => {
        expect(describeProjectContextFailure("/games/example", "Cannot prepare a runnable runtime: fix the game model.")).toEqual({
            status: "error",
            projectRoot: "/games/example",
            message: "Cannot prepare a runnable runtime: fix the game model.",
        });
        expect(describeOutcomeLibraryGenerationTerminalOutcome({status: "cancelled"})).toContain("Generation was cancelled safely");

        const audit = fs.readFileSync(SEMANTIC_AUDIT_PATH, "utf-8");
        expect(audit).toContain("raw weighted-outcome JSON");
        expect(audit).toContain("never becomes a project input, readiness prerequisite");
        expect(audit).toContain("No cache marker, materialization directory, resolver implementation name, or registry path is a user prerequisite.");
        expect(audit).toContain("does not recreate retired workflows");
    });

    it("renders real HTTP project switching and a retired deep link as recoverable user goals", async () => {
        const studioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-pc17-semantic-assets-"));
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-pc17-semantic-projects-"));
        writeStudioAssets(studioRoot);
        const first = path.join(workDir, "first.blueprint.json");
        const second = path.join(workDir, "second.blueprint.json");
        for (const [projectRoot, id, name] of [[first, "first", "First Slot"], [second, "second", "Second Slot"]] as const) {
            fs.writeFileSync(projectRoot, JSON.stringify({
                manifest: {id, name, version: "1.0.0"}, reels: 2, rows: 1, symbols: ["A", "B"],
                paytable: {A: {2: 1}}, reelStrips: [["A", "B"], ["A", "B"]], availableBets: [1],
            }));
        }
        const loadGame = (projectRoot: string) => Promise.resolve({getManifest: () => ({
            id: projectRoot === first ? "first" : "second", name: projectRoot === first ? "First Slot" : "Second Slot", version: "1.0.0",
        })}) as never;
        const homeService = new StudioHomeService("1.0.0", undefined, loadGame, undefined, passthroughRuntimePackageResolver);
        const server = new StudioServer({
            pokieVersion: "1.0.0", host: "127.0.0.1", port: 0, studioRoot, homeService,
            blueprintService: new StudioBlueprintService("1.0.0", studioRoot, homeService), loadGame,
            resolveRuntimePackageRoot: passthroughRuntimePackageResolver, initialContext: {mode: "project", projectRoot: first},
        });
        try {
            const address = await server.start();
            const fetchImpl = createServerFetch(`http://${address.host}:${address.port}`);
            const firstRoute = `/project/${encodeURIComponent(first)}/overview`;
            const retiredRoute = `/project/${encodeURIComponent(second)}/deployment`;
            const {router} = renderRoutedApp({fetchImpl, initialEntries: [firstRoute]});
            await screen.findByRole("heading", {name: "First Slot"});
            await act(async () => {
                await router.navigate(retiredRoute);
            });
            await screen.findByRole("heading", {name: "Second Slot"});
            await waitFor(() => expect(router.state.location.pathname).toBe(`/project/${encodeURIComponent(second)}/exportDeploy`));
            expect(screen.getByText("Deployment has moved into Build/Export. Choose Remote delivery there to preview or publish to a configured target.")).toBeInTheDocument();
            expect(screen.getByText("Build/Export")).toBeInTheDocument();
            expect(screen.queryByRole("button", {name: "Deployment"})).not.toBeInTheDocument();
        } finally {
            await server.stop();
            fs.rmSync(studioRoot, {recursive: true, force: true});
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });
});
