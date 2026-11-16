import {act, cleanup, screen, waitFor} from "@testing-library/react";
import fs from "fs";
import {execFileSync} from "child_process";
import {pathToFileURL} from "url";
import os from "os";
import path from "path";
import {passthroughRuntimePackageResolver} from "../../../../cli/materialize/materializeRuntimePackage.js";
import {StudioBlueprintService} from "../../../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioHomeService} from "../../../../cli/studio/home/StudioHomeService.js";
import {PokiePathResolver} from "../../../../cli/paths/PokiePathResolver.js";
import {FileStudioJobRepository} from "../../../../cli/studio/jobs/FileStudioJobRepository.js";
import {StudioJobService} from "../../../../cli/studio/jobs/StudioJobService.js";
import {StudioServer} from "../../../../cli/studio/StudioServer.js";
import type {FetchLike} from "../../../../cli/studio-client/src/api/apiClient.js";
import {createStudioHttpTestClient} from "./testUtils/createStudioHttpTestClient";
import {renderRoutedApp} from "./testUtils/renderRoutedApp";

function writeStudioAssets(root: string): void {
    fs.writeFileSync(path.join(root, "index.html"), "<html>studio</html>");
    fs.writeFileSync(path.join(root, "main.js"), "console.log('studio');");
    fs.writeFileSync(path.join(root, "style.css"), "body { margin: 0; }");
}

describe("Studio duplicate entrypoints (browser, real Studio HTTP)", () => {
    let studioRoot: string;
    let workDir: string;
    let projectRoot: string;
    let server: StudioServer;
    let fetchImpl: FetchLike;
    let client: ReturnType<typeof createStudioHttpTestClient>;
    let repository: FileStudioJobRepository;
    let jobs: StudioJobService;
    let foreignRepository: FileStudioJobRepository;
    let foreignJob: ReturnType<StudioJobService["markRunning"]>;
    let defaultDirectory: jest.SpyInstance;
    let shutdown: Promise<void> | undefined;
    let expectCleanupFailure: boolean;

    function stopStudio(): Promise<void> {
        shutdown ??= (async () => {
            cleanup();
            const started = performance.now();
            await client.drain();
            const httpMs = Math.round(performance.now() - started);
            await server.stop();
            console.info(`Studio fixture drained: ${JSON.stringify({httpMs, shutdownMs: Math.round(performance.now() - started), requests: client.timings})}`);
        })();
        return shutdown;
    }

    beforeEach(async () => {
        studioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-duplicate-routes-assets-"));
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-duplicate-routes-project-"));
        writeStudioAssets(studioRoot);
        shutdown = undefined;
        expectCleanupFailure = false;
        const appData = path.join(workDir, "profile");
        defaultDirectory = jest.spyOn(PokiePathResolver.prototype, "resolveAppDataDirectory").mockReturnValue(appData);
        repository = new FileStudioJobRepository(path.join(workDir, "jobs"));
        jobs = new StudioJobService(repository);
        foreignRepository = new FileStudioJobRepository(path.join(appData, "studio-jobs"));
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
            jobService: jobs,
            blueprintService: new StudioBlueprintService("1.0.0", studioRoot, homeService),
            // The browser only needs the dashboard manifest. Validation and every
            // route DTO below still come from the real Blueprint/server domain.
            loadGame: () => Promise.resolve({getManifest: () => ({id: "route-slot", name: "Route Slot", version: "1.0.0"})}) as never,
            resolveRuntimePackageRoot: passthroughRuntimePackageResolver,
            initialContext: {mode: "project", projectRoot},
        });
        const address = await server.start();
        client = createStudioHttpTestClient(`http://${address.host}:${address.port}`);
        fetchImpl = client.fetchImpl;
        // Another listener can publish after this listener's restart reconciliation.
        const foreignJobs = new StudioJobService(foreignRepository);
        const started = foreignJobs.start({projectId: workDir, operation: "project-open-materialization", request: {}, conflictKey: workDir});
        if (started.status !== "created") throw new Error("Expected an unrelated fixture job.");
        foreignJob = foreignJobs.markRunning(started.job.id);
    });

    afterEach(async () => {
        try {
            if (expectCleanupFailure) {
                await expect(stopStudio()).rejects.toThrow("Studio shutdown could not confirm executor cleanup. Retained jobs require recovery.");
                expect(repository.getProcessState()?.status).toBe("running");
            } else {
                await stopStudio();
                expect(repository.getProcessState()?.status).toBe("gracefully-stopped");
                expect(repository.list().every(job => !["queued", "running", "cancelling"].includes(job.status))).toBe(true);
            }
            expect(client.pending.size).toBe(0);
            expect(foreignRepository.list()).toEqual([foreignJob]);
            expect(foreignRepository.getProcessState()?.status).toBe("running");
        } finally {
            defaultDirectory.mockRestore();
            fs.rmSync(studioRoot, {recursive: true, force: true});
            fs.rmSync(workDir, {recursive: true, force: true});
        }
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

    it("rejects shutdown when this listener's own executor never confirms cleanup", async () => {
        const started = jobs.start({projectId: workDir, operation: "project-open-materialization", request: {}, conflictKey: workDir});
        if (started.status !== "created") throw new Error("Expected an owned fixture job.");
        jobs.markRunning(started.job.id);
        expectCleanupFailure = true;
        await expect(stopStudio()).rejects.toThrow("Studio shutdown could not confirm executor cleanup. Retained jobs require recovery.");
        expect(repository.get(started.job.id)).toMatchObject({status: "recovery-required", recovery: {action: "retry"}});
        expect(repository.getProcessState()?.status).toBe("running");
    });
});


it("retains both authenticated candidate selectors across the complete listener-fixture correction", () => {
    const root = fs.mkdtempSync(path.join(process.cwd(), "node_modules/.cache/pokie-tmp/studio-listener-handoff-"));
    try {
        execFileSync(process.execPath, ["--input-type=module", "-e", `
            import assert from "node:assert/strict";
            import {mkdir, readFile, writeFile} from "node:fs/promises";
            import {execFileSync} from "node:child_process";
            import path from "node:path";
            import {candidateFixture, commitP911ToolingDescendant, P911_TOOLING_DESCENDANT_PATHS, V2C37_SAVED_GATE_CORRECTION_PATHS} from ${JSON.stringify(pathToFileURL(path.resolve("tests/testUtils/createP911CandidateFixture.mjs")).href)};
            import {readP911CandidateFromEnvironment} from ${JSON.stringify(pathToFileURL(path.resolve("scripts/p9-11-candidate.mjs")).href)};
            import {authenticateP805ProductTree} from ${JSON.stringify(pathToFileURL(path.resolve("scripts/p8-05-release-handoff.mjs")).href)};
            const fixture = await candidateFixture(${JSON.stringify(root)});
            const options = {repository: fixture.repository};
            const environment = {POKIE_P911_CANDIDATE_HANDOFF: fixture.reference.path, POKIE_P911_CANDIDATE_HANDOFF_SHA256: fixture.reference.sha256};
            const original = await readP911CandidateFromEnvironment(environment, options);
            const correctionPaths = ["scripts/p8-05-release-handoff.mjs", "scripts/p9-11-candidate.mjs",
                "tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx",
                "tests/cli/studio-client/src/StudioDuplicateEntrypoints.browser.test.tsx",
                "tests/cli/studio-client/src/testUtils/createStudioHttpTestClient.ts",
                "tests/testUtils/createP911CandidateFixture.mjs"].sort();
            for (const file of correctionPaths) {
                assert.ok(V2C37_SAVED_GATE_CORRECTION_PATHS.includes(file), "missing saved correction: " + file);
                assert.ok(P911_TOOLING_DESCENDANT_PATHS.includes(file), "missing descendant fixture: " + file);
                await writeFile(path.join(fixture.repository, file), "// Bounded listener correction.");
            }
            const commit = () => {
                execFileSync("git", ["add", "."], {cwd: fixture.repository});
                execFileSync("git", ["-c", "user.name=sta-ger", "-c", "user.email=pascaldelger@gmail.com", "commit", "--quiet", "-m", "listener fixture"], {cwd: fixture.repository});
                return execFileSync("git", ["rev-parse", "HEAD"], {cwd: fixture.repository, encoding: "utf8"}).trim();
            };
            const correctionId = commit();
            assert.deepEqual(authenticateP805ProductTree(fixture.handoff.candidateId, correctionId, fixture.repository).changedToolingAndEvidencePaths, correctionPaths);
            const corrected = await readP911CandidateFromEnvironment(environment, options);
            assert.deepEqual(corrected.equivalence.changedEvidenceAndTooling, correctionPaths);
            assert.deepEqual({...corrected, equivalence: original.equivalence}, original);
            const reviewedId = await commitP911ToolingDescendant(fixture);
            const selected = await readP911CandidateFromEnvironment(environment, options);
            assert.deepEqual(selected.equivalence.changedEvidenceAndTooling, [...P911_TOOLING_DESCENDANT_PATHS].sort());
            // The complete P9 fixture also changes its separately pinned rendered driver.
            // Only the six-path correction above is shared with P8; its driver stays protected.
            assert.throws(() => authenticateP805ProductTree(fixture.handoff.candidateId, reviewedId, fixture.repository), /product or build inputs/);
            assert.deepEqual({...selected, equivalence: original.equivalence}, original);
            for (const reference of [fixture.handoff.browserDriver, fixture.handoff.buildReceipt, fixture.handoff.installReceipt,
                {path: fixture.handoff.archivePath}, {path: path.join(selected.packageRoot, "dist/cli/pokie.js")}]) {
                const bytes = await readFile(reference.path);
                try {
                    await writeFile(reference.path, "changed pinned input");
                    await assert.rejects(readP911CandidateFromEnvironment(environment, options),
                        /authenticated controller browser driver required|receipt digest mismatch|archive digest mismatch|stale installed asset/);
                } finally {
                    await writeFile(reference.path, bytes);
                }
            }
            assert.deepEqual(await readP911CandidateFromEnvironment(environment, options), selected);
            for (const file of ["tests/cli/studio-client/src/StudioDuplicateEntrypoints.extra.test.tsx",
                "tests/cli/studio-client/src/testUtils/createStudioHttpTestClient.extra.ts",
                "src/index.ts", "cli/studio/StudioServer.ts", "package.json", "tsconfig.prod.json"]) {
                const target = path.join(fixture.repository, file);
                await mkdir(path.dirname(target), {recursive:true});
                await writeFile(target, "changed protected input");
                const protectedId = commit();
                try {
                    assert.throws(() => authenticateP805ProductTree(reviewedId, protectedId, fixture.repository), /product or build inputs/);
                    await assert.rejects(readP911CandidateFromEnvironment(environment, options), /product\\/build inputs changed/);
                } finally {
                    execFileSync("git", ["reset", "--hard", reviewedId], {cwd: fixture.repository, stdio: "ignore"});
                }
            }
        `], {timeout: 30_000, stdio: "pipe"});
    } finally {
        fs.rmSync(root, {recursive: true, force: true});
    }
});
