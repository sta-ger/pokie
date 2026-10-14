/** @jest-environment-options {"customExportConditions": ["node", "node-addons"]} */
import fs from "fs";
import {GamePackageGenerator, loadPokieGameRuntime, type GameBlueprint} from "@fromstan/pokie";
import http from "http";
import os from "os";
import path from "path";
import {screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {StudioServer} from "../../../../../../cli/studio/StudioServer.js";
import {StudioHomeService} from "../../../../../../cli/studio/home/StudioHomeService.js";
import {StudioBlueprintService} from "../../../../../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioProjectRegistrationService} from "../../../../../../cli/studio/StudioProjectRegistrationService.js";
import {StudioJobService} from "../../../../../../cli/studio/jobs/StudioJobService.js";
import {FileStudioJobRepository} from "../../../../../../cli/studio/jobs/FileStudioJobRepository.js";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import type {StudioArtifactBuildView, StudioArtifactPreviewView} from "../../../../../../cli/studio-client/src/api/types";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

it("submits the original Blueprint refreshed Stake operation once and borrows its compatible prerequisite", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-p906-handoff-"));
    const blueprint = path.join(directory, "source game.blueprint.json");
    const manifest = {id: "handoff-slot", name: "Handoff Slot", version: "1.0.0"};
    const model: GameBlueprint = {
        manifest, reels: 5, rows: 1, symbols: ["A"], paytable: {A: {5: 3}},
        reelStrips: Array.from({length: 5}, () => Array<string>(10).fill("A")), availableBets: [1],
    };
    fs.writeFileSync(blueprint, JSON.stringify(model));
    // Generator preflight and execution consume a real generated game; the
    // resolver avoids compiler subprocesses while using the identical model.
    const runtimeRoot = path.join(directory, "runtime");
    new GamePackageGenerator("1.3.0").generate(model, directory, runtimeRoot);
    const runtime = await loadPokieGameRuntime(runtimeRoot, (entry) => require(entry));
    const loadGame = () => Promise.resolve(runtime.game);
    const resolveRuntimePackageRoot = () => Promise.resolve({runtimePath: runtimeRoot, release: () => Promise.resolve()});
    const home = new StudioHomeService("1.3.0", undefined, loadGame, undefined, resolveRuntimePackageRoot);
    const server = new StudioServer({
        pokieVersion: "1.3.0", host: "127.0.0.1", port: 0, studioRoot: directory,
        homeService: home, blueprintService: new StudioBlueprintService("1.3.0", directory, home),
        projectRegistrationService: new StudioProjectRegistrationService(),
        jobService: new StudioJobService(new FileStudioJobRepository(path.join(directory, "jobs"))),
        loadGame, resolveRuntimePackageRoot,
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
        const generations: Record<string, unknown>[] = [];
        let stakeResult: Extract<StudioArtifactBuildView, {status: "ok"}> | undefined;
        const fetchImpl: FetchLike = (url, init) => new Promise((resolve, reject) => {
            if (url === "/api/project/artifacts/build") builds.push(JSON.parse(init?.body ?? "{}"));
            if (url === "/api/project/outcome-libraries/generate/jobs" && init?.method === "POST") generations.push(JSON.parse(init.body ?? "{}"));
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
                    if (url === "/api/project/artifacts/preview" && body.target === "stakeAdapter" && generations.length > 0 && body.plan?.source?.kind === "blueprint") {
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
        const card = (name: string) => screen.getByText(name, {selector: "p"}).closest('[data-pokie-lifecycle-form]') as HTMLElement;
        const stakeCard = await screen.findByText("Stake Engine export", {selector: "p"});
        expect(stakeCard).toBeVisible();
        await user.click(within(card("Stake Engine export")).getByRole("button", {name: "Configure Stake Engine export"}));
        await waitFor(() => expect(within(card("Stake Engine export")).getByRole("button", {name: "Build"})).toBeEnabled());
        const initialOperation = stakePreviews.at(-1)?.preparedOperationId;
        expect(stakePreviews.at(-1)?.stakePreflight?.route).toBe("generate");
        expect(document.getElementById("artifact-build-outcomeLibrary")).toBeNull();
        const generator = card("Outcome library generator");
        expect(generator).toHaveAttribute("data-pokie-lifecycle-form", "outcome-library");
        await user.click(within(generator).getByRole("button", {name: "Configure Outcome library generator"}));
        await user.click(within(generator).getByRole("button", {name: "Sampled"}));
        const sample = within(generator).getByLabelText("Sample size");
        await user.clear(sample);
        await user.type(sample, "5000");
        await user.click(within(generator).getByRole("button", {name: "Show Advanced generation controls"}));
        const seed = within(generator).getByLabelText("Coverage seed");
        await user.clear(seed);
        await user.type(seed, "p911-programmer-library");
        const generate = document.getElementById("outcome-library-generate")!;
        await waitFor(() => expect(generate).toBeEnabled());
        await user.click(generate);
        await waitFor(() => expect(generator.querySelector('[data-pokie-lifecycle-terminal="completed"]')).not.toBeNull());
        const inspectLibrary = within(generator).getByRole("button", {name: "Inspect library"});
        const outcomeRoot = inspectLibrary.getAttribute("data-pokie-lifecycle-artifact-output")!;
        expect(generations).toEqual([expect.objectContaining({generation: "sampled", sample: {sampleSize: "5000", seed: "p911-programmer-library"}})]);
        const outcomeManifest = fs.readFileSync(path.join(outcomeRoot, "manifest.json"), "utf8");
        expect(JSON.parse(outcomeManifest).modes[0].generator).toMatchObject({strategy: "bounded-coverage", sampledRawCount: 5000});

        await waitFor(() => expect(stakePreviews.at(-1)?.preparedOperationId).not.toBe(initialOperation));
        // Preserve configurable generation coverage, then establish the automatic
        // compatibility policy through the existing public build endpoint.
        expect(stakePreviews.at(-1)?.stakePreflight?.route).toBe("generate");
        expect(within(card("Stake Engine export")).getByRole("button", {name: "Build"})).toBeDisabled();
        expect(builds).toEqual([]);
        const compatibleRoot = path.join(directory, "compatible-outcome-library");
        const prerequisite = await fetchImpl("/api/project/artifacts/build", {
            method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({target: "outcomeLibrary", outDir: compatibleRoot}),
        });
        expect(prerequisite.status).toBe(202);
        const accepted = await prerequisite.json() as {job: {id: string}};
        await waitFor(async () => {
            const response = await fetchImpl(`/api/project/artifacts/build/${accepted.job.id}`);
            const job = await response.json() as {status: string; result: {status: string; outputPath: string}};
            expect(job).toMatchObject({status: "completed", result: {status: "ok", outputPath: compatibleRoot}});
        }, {timeout: 10_000});
        const compatibleManifest = fs.readFileSync(path.join(compatibleRoot, "manifest.json"), "utf8");
        await user.click(screen.getByRole("button", {name: "Overview"}));
        await user.click(screen.getByRole("button", {name: "Build/Export"}));
        await user.click(await screen.findByRole("button", {name: "Configure Stake Engine export"}));
        await waitFor(() => expect(stakePreviews.at(-1)).toMatchObject({
            stakePreflight: {route: "reuse", selectedPrerequisiteLocation: compatibleRoot},
            plan: {source: {kind: "blueprint", canonicalLocation: blueprint}},
        }));
        const refreshedOperation = stakePreviews.at(-1)?.preparedOperationId;
        expect(refreshedOperation).toBeTruthy();
        expect(refreshedOperation).not.toBe(initialOperation);
        expect(within(card("Stake Engine export")).getByRole("button", {name: "Build"})).toBeDisabled();
        expect(builds.filter(build => build.target === "stakeAdapter")).toEqual([]);
        releaseRefreshedPreview();
        await waitFor(() => expect(within(card("Stake Engine export")).getByRole("button", {name: "Build"})).toBeEnabled());
        expect(screen.queryByRole("heading", {name: "Outcome Source"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Draw an outcome"})).not.toBeInTheDocument();
        await user.click(within(card("Stake Engine export")).getByRole("button", {name: "Build"}));
        await waitFor(() => expect(
            card("Stake Engine export").querySelector('[data-pokie-lifecycle-terminal="completed"]')
                ?? within(card("Stake Engine export")).queryByText(/prepared conversion graph is stale or invalid/),
        ).not.toBeNull());
        expect(within(card("Stake Engine export")).queryByText(/prepared conversion graph is stale or invalid/)).not.toBeInTheDocument();
        expect(stakeResult).toMatchObject({status: "ok", stakePrerequisiteProvenance: {
            route: "reuse", disposition: "borrowed", selectedPrerequisiteLocation: compatibleRoot,
        }, plan: {source: {kind: "blueprint", canonicalLocation: blueprint}}});
        const terminal = card("Stake Engine export").querySelector('[data-pokie-lifecycle-terminal="completed"]')!;
        const terminalJob = await fetchImpl(`/api/project/artifacts/build/${terminal.getAttribute("data-pokie-lifecycle-result-job")}`);
        expect(await terminalJob.json()).toMatchObject({status: "completed", result: stakeResult});
        expect(stakePreviews.at(-1)?.preparedOperationId).not.toBe(initialOperation);
        expect(builds.filter(build => build.target === "stakeAdapter")).toEqual([
            {target: "stakeAdapter", preparedOperationId: refreshedOperation, deferExecution: true},
        ]);
        expect(fs.readFileSync(path.join(compatibleRoot, "manifest.json"), "utf8")).toBe(compatibleManifest);
        expect(fs.readFileSync(path.join(outcomeRoot, "manifest.json"), "utf8")).toBe(outcomeManifest);
        expect(JSON.parse(fs.readFileSync(path.join(stakeResult!.outputPath, "pokie-manifest.json"), "utf8")).modes).toEqual([expect.objectContaining({name: "base"})]);
        expect(screen.queryByText(/prepared conversion graph is stale or invalid/)).not.toBeInTheDocument();
    } finally {
        releaseRefreshedPreview();
        unmount?.();
        await server.stop();
        await runtime.release();
        fs.rmSync(directory, {recursive: true, force: true});
    }
}, 30_000);

it("cancels a real TypeScript publication while its queued start response is withheld", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-v2c11-startup-"));
    const blueprint = path.join(directory, "source.blueprint.json");
    const model: GameBlueprint = {
        manifest: {id: "startup-slot", name: "Startup Slot", version: "1.0.0"},
        reels: 3, rows: 1, symbols: ["A"], paytable: {A: {3: 3}},
        reelStrips: [["A"], ["A"], ["A"]], availableBets: [0.05],
    };
    fs.writeFileSync(blueprint, JSON.stringify(model));
    const input = fs.readFileSync(blueprint);
    const runtimeRoot = path.join(directory, "runtime");
    new GamePackageGenerator("1.3.0").generate(model, directory, runtimeRoot);
    const runtime = await loadPokieGameRuntime(runtimeRoot, (entry) => require(entry));
    const loadGame = () => Promise.resolve(runtime.game);
    const resolveRuntimePackageRoot = () => Promise.resolve({runtimePath: runtimeRoot, release: () => Promise.resolve()});
    const home = new StudioHomeService("1.3.0", undefined, loadGame, undefined, resolveRuntimePackageRoot);
    const jobs = new StudioJobService(new FileStudioJobRepository(path.join(directory, "jobs")));
    const server = new StudioServer({
        pokieVersion: "1.3.0", host: "127.0.0.1", port: 0, studioRoot: directory,
        homeService: home, blueprintService: new StudioBlueprintService("1.3.0", directory, home),
        projectRegistrationService: new StudioProjectRegistrationService(), jobService: jobs,
        loadGame, resolveRuntimePackageRoot, initialContext: {mode: "project", projectRoot: blueprint},
    });
    let unmount: (() => void) | undefined;
    let releaseStart!: () => void;
    const startDelivery = new Promise<void>(resolve => {
        releaseStart = resolve;
    });
    let jobId: string | undefined;
    let activations = 0;
    try {
        const address = await server.start();
        const fetchImpl: FetchLike = (url, init) => new Promise((resolve, reject) => {
            if (url.endsWith("/activate")) activations++;
            const request = http.request(`http://${address.host}:${address.port}${url}`, {method: init?.method, headers: init?.headers}, response => {
                const chunks: Buffer[] = [];
                response.on("data", (chunk: Buffer) => chunks.push(chunk));
                response.on("end", () => {
                    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
                    const result = {ok: (response.statusCode ?? 500) < 300, status: response.statusCode ?? 500, json: () => Promise.resolve(body)};
                    if (url === "/api/project/artifacts/build") {
                        jobId = body.job.id;
                        startDelivery.then(() => resolve(result));
                    } else resolve(result);
                });
            });
            request.on("error", reject);
            request.setTimeout(10_000, () => request.destroy(new Error(`Timed out: ${url}`)));
            request.end(init?.body);
        });
        const user = userEvent.setup();
        unmount = renderRoutedApp({fetchImpl, initialEntries: [`/project/${encodeURIComponent(blueprint)}/exportDeploy`]}).unmount;
        const card = (await screen.findByText("TypeScript Game Package", {selector: "p"})).closest('[data-pokie-lifecycle-form]') as HTMLElement;
        const configure = document.getElementById("export-configure-artifact-tsPackage")!;
        if (configure.getAttribute("aria-expanded") === "false") await user.click(configure);
        const build = within(card).getByRole("button", {name: "Build"});
        await waitFor(() => expect(build).toBeEnabled());
        await user.click(build);
        await waitFor(() => expect(jobId).toBeDefined());
        expect(jobs.get(blueprint, jobId!)?.status).toBe("queued");
        expect(fs.existsSync(path.join(directory, "tsPackage"))).toBe(false);
        await user.click(within(card).getByRole("button", {name: "Cancel"}));
        expect(await within(card).findByText(/Starting artifact build.*Cancellation requested/)).toBeVisible();
        expect(within(card).getByLabelText("Output directory (optional)")).toBeDisabled();
        releaseStart();
        await within(card).findByText(/Build cancelled/);
        expect(jobs.get(blueprint, jobId!)).toMatchObject({status: "cancelled"});
        expect(jobs.get(blueprint, jobId!)?.result?.outputs).toBeUndefined();
        expect(activations).toBe(0);
        expect(fs.existsSync(path.join(directory, "tsPackage"))).toBe(false);
        expect(fs.readFileSync(blueprint)).toEqual(input);
        for (const name of ["Open as Project", "Add to Projects", "Open output folder"]) {
            expect(within(card).queryByRole("button", {name})).not.toBeInTheDocument();
        }
    } finally {
        releaseStart();
        unmount?.();
        await server.stop();
        fs.rmSync(directory, {recursive: true, force: true});
    }
});
