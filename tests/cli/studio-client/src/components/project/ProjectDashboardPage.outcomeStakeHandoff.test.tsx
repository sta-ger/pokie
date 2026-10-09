import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import {screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {passthroughRuntimePackageResolver} from "../../../../../../cli/materialize/materializeRuntimePackage.js";
import {StudioServer} from "../../../../../../cli/studio/StudioServer.js";
import {StudioHomeService} from "../../../../../../cli/studio/home/StudioHomeService.js";
import {StudioBlueprintService} from "../../../../../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioProjectRegistrationService} from "../../../../../../cli/studio/StudioProjectRegistrationService.js";
import {StudioJobService} from "../../../../../../cli/studio/jobs/StudioJobService.js";
import {FileStudioJobRepository} from "../../../../../../cli/studio/jobs/FileStudioJobRepository.js";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import type {StudioArtifactBuildView, StudioArtifactPreviewView} from "../../../../../../cli/studio-client/src/api/types";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

it("publishes Stake on its first Build after the ordinary bounded Outcome Library Build", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-p906-handoff-"));
    const blueprint = path.join(directory, "source game.blueprint.json");
    const manifest = {id: "handoff-slot", name: "Handoff Slot", version: "1.0.0"};
    fs.writeFileSync(blueprint, JSON.stringify({
        manifest, reels: 5, rows: 1, symbols: ["A"], paytable: {A: {5: 3}},
        reelStrips: Array.from({length: 5}, () => Array<string>(10).fill("A")), availableBets: [1],
    }));
    // Only dashboard runtime loading is substituted. Artifact preview, generation,
    // managed-library selection, graph validation and publication use real services.
    const loadGame = () => Promise.resolve({getManifest: () => manifest}) as never;
    const home = new StudioHomeService("1.3.0", undefined, loadGame, undefined, passthroughRuntimePackageResolver);
    const server = new StudioServer({
        pokieVersion: "1.3.0", host: "127.0.0.1", port: 0, studioRoot: directory,
        homeService: home, blueprintService: new StudioBlueprintService("1.3.0", directory, home),
        projectRegistrationService: new StudioProjectRegistrationService(),
        jobService: new StudioJobService(new FileStudioJobRepository(path.join(directory, "jobs"))),
        loadGame, resolveRuntimePackageRoot: passthroughRuntimePackageResolver,
        initialContext: {mode: "project", projectRoot: blueprint},
    });
    let unmount: (() => void) | undefined;
    let releaseRefreshedPreview!: () => void;
    const refreshedPreviewReady = new Promise<void>((resolve) => {
        releaseRefreshedPreview = resolve;
    });
    try {
        const address = await server.start();
        const stakePreviews: Extract<StudioArtifactPreviewView, {status: "ok"}>[] = [];
        const builds: {target: string; preparedOperationId?: string}[] = [];
        let stakeResult: Extract<StudioArtifactBuildView, {status: "ok"}> | undefined;
        const fetchImpl: FetchLike = (url, init) => new Promise((resolve, reject) => {
            if (url === "/api/project/artifacts/build") builds.push(JSON.parse(init?.body ?? "{}"));
            const request = http.request(`http://${address.host}:${address.port}${url}`, {method: init?.method, headers: init?.headers}, (response) => {
                const chunks: Buffer[] = [];
                response.on("data", (chunk: Buffer) => chunks.push(chunk));
                response.on("end", () => {
                    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
                    if (url === "/api/project/artifacts/preview" && body.target === "stakeAdapter" && body.status === "ok") stakePreviews.push(body);
                    if (url.startsWith("/api/project/artifacts/build/") && body.result?.target === "stakeAdapter" && body.result.status === "ok") stakeResult = body.result;
                    const result = {ok: (response.statusCode ?? 500) < 300, status: response.statusCode ?? 500, json: () => Promise.resolve(body)};
                    // Delay delivery of the real replacement plan to exercise
                    // the disabled handoff, without substituting its contents.
                    if (url === "/api/project/artifacts/preview" && body.target === "stakeAdapter" && body.stakePreflight?.route === "reuse") {
                        refreshedPreviewReady.then(() => resolve(result));
                    } else resolve(result);
                });
            });
            request.on("error", reject);
            request.setTimeout(10_000, () => request.destroy(new Error(`Timed out: ${url}`)));
            request.end(init?.body);
        });
        const user = userEvent.setup();
        unmount = renderRoutedApp({fetchImpl, initialEntries: [`/project/${encodeURIComponent(blueprint)}/exportDeploy`]}).unmount;
        const card = (name: string) => screen.getByText(name, {selector: "p"}).closest('div[style*="margin-bottom"]') as HTMLElement;
        const stakeCard = await screen.findByText("Stake Engine export", {selector: "p"});
        expect(stakeCard).toBeVisible();
        await waitFor(() => expect(within(card("Stake Engine export")).getByRole("button", {name: "Build"})).toBeEnabled());
        const initialOperation = stakePreviews.at(-1)?.preparedOperationId;
        expect(stakePreviews.at(-1)?.stakePreflight?.route).toBe("generate");
        await user.click(within(card("Outcome library")).getByRole("button", {name: "Build"}));
        await waitFor(() => expect(card("Outcome library").querySelector('[data-pokie-lifecycle-terminal="completed"]')).not.toBeNull());
        const outcomeReceipt = card("Outcome library").querySelector('[data-pokie-lifecycle-result-output]')!;
        const outcomeRoot = outcomeReceipt.getAttribute("data-pokie-lifecycle-result-output")!;
        const outcomeManifest = fs.readFileSync(path.join(outcomeRoot, "manifest.json"), "utf8");
        expect(JSON.parse(outcomeManifest).modes[0].generator).toMatchObject({strategy: "bounded-coverage", sampledRawCount: 5000});

        await waitFor(() => expect(stakePreviews.at(-1)?.stakePreflight?.route).toBe("reuse"));
        expect(within(card("Stake Engine export")).getByRole("button", {name: "Build"})).toBeDisabled();
        expect(builds).toEqual([{target: "outcomeLibrary"}]);
        releaseRefreshedPreview();
        await waitFor(() => expect(within(card("Stake Engine export")).getByRole("button", {name: "Build"})).toBeEnabled());
        await user.click(within(card("Stake Engine export")).getByRole("button", {name: "Build"}));
        await waitFor(() => expect(
            card("Stake Engine export").querySelector('[data-pokie-lifecycle-terminal="completed"]')
                ?? within(card("Stake Engine export")).queryByText(/prepared conversion graph is stale or invalid/),
        ).not.toBeNull());
        expect(within(card("Stake Engine export")).queryByText(/prepared conversion graph is stale or invalid/)).not.toBeInTheDocument();
        expect(stakeResult).toMatchObject({status: "ok", stakePrerequisiteProvenance: {route: "reuse", disposition: "borrowed", selectedPrerequisiteLocation: outcomeRoot}});
        expect(stakePreviews.at(-1)?.preparedOperationId).not.toBe(initialOperation);
        expect(builds).toEqual([
            {target: "outcomeLibrary"},
            {target: "stakeAdapter", preparedOperationId: stakePreviews.at(-1)?.preparedOperationId},
        ]);
        expect(fs.readFileSync(path.join(outcomeRoot, "manifest.json"), "utf8")).toBe(outcomeManifest);
        expect(JSON.parse(fs.readFileSync(path.join(stakeResult!.outputPath, "pokie-manifest.json"), "utf8")).modes).toEqual([expect.objectContaining({name: "base"})]);
        expect(screen.queryByText(/prepared conversion graph is stale or invalid/)).not.toBeInTheDocument();
    } finally {
        releaseRefreshedPreview();
        unmount?.();
        await server.stop();
        fs.rmSync(directory, {recursive: true, force: true});
    }
}, 30_000);
