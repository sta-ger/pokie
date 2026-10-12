import {ChildProcessWithoutNullStreams, spawn} from "child_process";
import crypto from "crypto";
import ExcelJS from "exceljs";
import fs from "fs";
import os from "os";
import path from "path";
import {computeGameBlueprintHash, DEV_OPERATION, GAME_BLUEPRINT_SCHEMA_VERSION, GameBlueprint} from "@fromstan/pokie";
import {createStarterGameBlueprint} from "../../../cli/build/createStarterGameBlueprint.js";
import {createLocalRuntimeIdentity, createMaterializingRuntimePackageResolver} from "../../../cli/materialize/materializeRuntimePackage.js";
import {REPO_ROOT} from "../../testUtils/offlinePokieDependencyOverride.js";
import {ensureCompiledTestOutput} from "../../testUtils/ensureCompiledTestOutput.js";

const COMPILED_CJS_ENTRY = path.join(REPO_ROOT, "dist", "cjs", "index.js");
const COMPILED_CJS_PACKAGE_JSON = path.join(REPO_ROOT, "dist", "cjs", "package.json");
const COMPILED_ESM_WORKER_ENTRY = path.join(REPO_ROOT, "dist", "esm", "simulation", "parallel", "internal", "simulationWorkerEntry.js");

// Mirrors BlueprintProjectMaterializer's own private DEFAULT_CACHE_ROOT exactly (a machine-wide,
// process-external tmp location) -- there is no way to override it without handing
// createMaterializingRuntimePackageResolver a test-only `materializer`, which the CLI-command coverage
// below deliberately never does (see that describe block's own doc comment). Computing the same cache
// key production would and removing only that one entry afterward keeps this test from ever touching
// another concurrent process's own cache entries.
const DEFAULT_CACHE_ROOT = path.join(os.tmpdir(), "pokie-materialize-cache");

function computeDefaultCacheDir(blueprint: GameBlueprint, pokieVersion: string, runtimeIdentity: string): string {
    const raw =
        `blueprintHash:${computeGameBlueprintHash(blueprint)}|` +
        `pokieVersion:${pokieVersion}|` +
        `buildContractVersion:${GAME_BLUEPRINT_SCHEMA_VERSION}|` +
        `runtimeIdentity:${runtimeIdentity}|` +
        "sourceIdentity:blueprint";
    const cacheKey = crypto.createHash("sha256").update(raw).digest("hex");
    return path.join(DEFAULT_CACHE_ROOT, cacheKey);
}

async function postJson(url: string, body: unknown = {}): Promise<{status: number; body: Record<string, unknown>}> {
    const response = await fetch(url, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
    });
    return {status: response.status, body: (await response.json()) as Record<string, unknown>};
}

// An unpublished version and an unreachable registry prove that the default production resolver
// links the running local installation. Real npm retry/pack/install/link cases and their setup live
// in tests/packaging/BlueprintProjectMaterializer.offline.test.ts for the final packaging boundary.
const UNPUBLISHED_POKIE_VERSION = `0.0.0-offline-e2e-unpublished-${crypto.randomBytes(4).toString("hex")}`;

describe("BlueprintProjectMaterializer (offline end-to-end: default production resolver, unpublished pokie version, local runtime link, no registry, spaced installation path)", () => {
    jest.setTimeout(300000);

    let sourceDir: string;
    let pokiePackageRootWithSpaces: string;
    let originalNpmOffline: string | undefined;
    let originalNpmRegistry: string | undefined;

    beforeAll(() => {
        ensureCompiledTestOutput({
            repositoryRoot: REPO_ROOT,
            outputPaths: [COMPILED_CJS_ENTRY, COMPILED_CJS_PACKAGE_JSON, COMPILED_ESM_WORKER_ENTRY],
            lockName: "compiled-runtime",
            command: ["npm", "run", "build-test-runtime"],
            forceRebuild: true,
        });

        pokiePackageRootWithSpaces = path.join(os.tmpdir(), `pokie install root with spaces ${crypto.randomBytes(4).toString("hex")}`);
        fs.symlinkSync(REPO_ROOT, pokiePackageRootWithSpaces, "dir");

        // Keep the registry unreachable even if the production resolver regresses to npm resolution.
        originalNpmOffline = process.env.npm_config_offline;
        originalNpmRegistry = process.env.npm_config_registry;
        process.env["npm_config_offline"] = "true";
        process.env["npm_config_registry"] = "http://127.0.0.1:1/";
    });

    afterAll(() => {
        fs.rmSync(pokiePackageRootWithSpaces, {force: true});
        restoreEnv("npm_config_offline", originalNpmOffline);
        restoreEnv("npm_config_registry", originalNpmRegistry);
    });

    beforeEach(() => {
        sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie materialize source offline e2e "));
    });

    afterEach(() => {
        fs.rmSync(sourceDir, {recursive: true, force: true});
    });

    function writeStarterBlueprint(): string {
        const blueprintPath = path.join(sourceDir, "game.json");
        fs.writeFileSync(blueprintPath, JSON.stringify(createStarterGameBlueprint(), null, 4));
        return blueprintPath;
    }

    it("materializes a genuinely loadable runtime through the default production resolver and reuses the cache -- fully offline, registry unreachable, pokieVersion never published, installation path containing spaces", async () => {
        const resolveRuntimePackageRoot = createMaterializingRuntimePackageResolver(UNPUBLISHED_POKIE_VERSION, DEV_OPERATION, pokiePackageRootWithSpaces);
        const blueprintPath = writeStarterBlueprint();

        const first = await resolveRuntimePackageRoot(blueprintPath);
        try {
            // "pokie" really did resolve to this exact (spaced-path) checkout, not any registry-published
            // version.
            const installedPokiePackageJson = JSON.parse(
                fs.readFileSync(path.join(first.runtimePath, "node_modules", "@fromstan", "pokie", "package.json"), "utf-8"),
            ) as {name: string};
            expect(installedPokiePackageJson.name).toBe("@fromstan/pokie");

            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const entry = require(path.join(first.runtimePath, "dist", "index.js"));
            const game = entry.default ?? entry;
            expect(game.getManifest().id).toBe("starter-slot");
        } finally {
            await first.release();
        }

        const second = await resolveRuntimePackageRoot(blueprintPath);
        try {
            expect(second.runtimePath).toBe(first.runtimePath);
        } finally {
            await second.release();
        }
    });

});

type CliExecution = {exitCode: number | null; stdout: string; stderr: string};

// Runs the built CLI executable to completion exactly the way a real installed "pokie" binary would --
// a genuine child process, dispatched through its own real argv/dispatch() (cli/dispatch.ts), never a
// hand-constructed command instance -- and waits for it to exit on its own. The right shape for a
// one-shot command (validate/sim) that never binds a port. "--preserve-symlinks-main" is what keeps
// `pokieJsPath`'s own spaced path the one cli/pokie.ts's ownPackageDir()/readOwnPackageRoot() actually
// observes -- see the describe block below's own doc comment for why that matters and why this is one of
// only two places in the suite that spawns a real CLI subprocess.
function runPokieCliToCompletion(pokieJsPath: string, args: string[]): Promise<CliExecution> {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ["--preserve-symlinks-main", pokieJsPath, ...args]) as ChildProcessWithoutNullStreams;
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk: Buffer) => {
            stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
        });
        child.once("error", reject);
        child.once("exit", (exitCode) => {
            resolve({exitCode, stdout, stderr});
        });
    });
}

type CliServerHandle = {baseUrl: string; stop(): Promise<void>};

// Same real-subprocess mechanism as runPokieCliToCompletion, for a command that starts a server and
// keeps running (serve/dev/studio): resolves once `readyPattern` matches its own "listening on
// http://..." stdout line -- the same thing a real user watches for -- and stop() sends the exact
// signal a real user's Ctrl+C would (SIGINT), driving the command's own registered shutdown handler
// (DevCommand/StudioCommand) or Node's own default SIGINT termination (ServeCommand, which registers no
// handler of its own) rather than a forced kill.
function startPokieCliServer(pokieJsPath: string, args: string[], readyPattern: RegExp): Promise<CliServerHandle> {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ["--preserve-symlinks-main", pokieJsPath, ...args]) as ChildProcessWithoutNullStreams;
        let stdout = "";
        let stderr = "";
        let settled = false;
        child.stdout.on("data", (chunk: Buffer) => {
            stdout += chunk.toString();
            if (settled) {
                return;
            }
            const match = readyPattern.exec(stdout);
            if (match) {
                settled = true;
                resolve({baseUrl: `http://127.0.0.1:${match[1]}`, stop: () => stopPokieCliChild(child)});
            }
        });
        child.stderr.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
        });
        child.once("error", (error) => {
            if (!settled) {
                settled = true;
                reject(error);
            }
        });
        child.once("exit", (exitCode) => {
            if (!settled) {
                settled = true;
                reject(new Error(`pokie CLI exited (code ${exitCode}) before reporting it was listening.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
            }
        });
    });
}

function stopPokieCliChild(child: ChildProcessWithoutNullStreams): Promise<void> {
    return new Promise((resolve, reject) => {
        if (child.exitCode !== null) {
            resolve();
            return;
        }
        const timer = setTimeout(() => {
            reject(new Error("Timed out waiting for the pokie CLI child process to exit after SIGINT."));
        }, 15000);
        child.once("exit", () => {
            clearTimeout(timer);
            resolve();
        });
        child.kill("SIGINT");
    });
}

// Proves the offline mechanism above isn't just reachable through BlueprintProjectMaterializer/
// createMaterializingRuntimePackageResolver directly (the describe block above), but through the real,
// built `pokie` CLI executable itself -- a genuine child process running dist/cli/pokie.js exactly the
// way an installed "pokie" binary would, dispatched via its own real argv/dispatch() (cli/dispatch.ts),
// never a hand-constructed command instance -- for every required CLI runtime entry point a real user
// would actually run against an unpublished Blueprint: `pokie validate`, `pokie sim`, `pokie serve`,
// `pokie dev`, the implicit `pokie <blueprint.json>` Studio launch (see resolveCliInvocation.ts's own
// doc comment on why a bare, existing path argument opens Studio's Project mode for it), and Studio's
// Play runtime -- the "applicable play path" for a Blueprint, which has no separately-built package a
// second, standalone play surface could otherwise come from.
//
// This is the one other sanctioned place in the suite that spawns a real CLI subprocess (see
// tests/packaging/npmPackSmoke.test.ts's own doc comment on the project's "never spawn a CLI command as
// a subprocess in tests" convention) -- for a different reason than that file's own packaging proof:
// this describe block exists to prove *running-installation-root discovery* (cli/pokie.ts's own
// readOwnPackageRoot()/ownPackageDir(), and the real dispatch() precedence that routes a bare path to
// Studio) actually reaches a materialized runtime end to end, not per-command argument-parsing behavior
// -- that stays covered, fast and in-process, by tests/cli/cliCommandInventory.contract.test.ts.
//
// `pokiePackageRootWithSpaces` stands in for "the running POKIE installation's own root directory" at a
// path shaped the way a real end user's machine easily produces one (e.g. under "Program Files", "My
// Projects"). Unlike the describe block above's own plain symlink-to-REPO_ROOT, this one is a *real*
// directory: it also needs its own package.json "version" field rewritten to an unpublished value (see
// POKIE_VERSION below), which would corrupt this checkout's own package.json if the whole root were
// just a symlink to it. Only its two large, read-only subtrees are symlinked in -- dist/ (built moments
// earlier by ensureCompiledTestOutput below) and node_modules/, both real REPO_ROOT copies, never
// duplicated on disk -- and package.json itself is a real, rewritten copy. Every provenance
// withLocalPokieDependency's own doc comment lists (a dev checkout, an npm-linked target, a
// tarball-installed or ordinarily npm-installed copy) is equally well represented: the mechanism only
// ever cares about the resolved absolute path and package.json content, never how either got there.
//
// Node's own module loader would ordinarily resolve a symlinked *main* module (dist/cli/pokie.js, or any
// of its symlinked ancestor directories) to its real, non-spaced target path before import.meta.url is
// ever read -- the "--preserve-symlinks-main" flag every spawn above passes is what keeps the spaced path
// itself the one cli/pokie.ts's own ownPackageDir()/readOwnPackageRoot() actually observes, so a passing
// run here is proof the *real* running-installation discovery mechanism resolves a spaced path
// correctly, not just that it resolves *some* path. (This has no bearing on ordinary dependency
// resolution -- "commander"/"exceljs" resolve through the symlinked node_modules/ exactly as they would
// without the flag; only the main module's own realpath-for-import.meta.url is affected.)
//
// The production resolver links the running installation, so these CLI cases execute no npm install.
// Every command reaches that shared resolver through its real dispatch and root discovery. The first
// command materializes the fresh Blueprint cache and the later commands reuse it. Offline mode and an
// unreachable registry remain enabled to reject any accidental registry dependency.
// Runtime/CLI compiler setup stays here because these assertions execute the actual built surfaces.
describe("CLI command coverage (offline end-to-end, through the built CLI executable): validate, sim, serve, dev, implicit Blueprint target opening, and Play -- all through dispatch() and the running installation's own root discovery", () => {
    jest.setTimeout(300000);

    const POKIE_VERSION = `0.0.0-offline-cli-e2e-unpublished-${crypto.randomBytes(4).toString("hex")}`;

    let pokiePackageRootWithSpaces: string;
    let pokieJsPath: string;
    let sourceDir: string;
    let blueprintPath: string;
    let blueprint: GameBlueprint;
    let originalNpmOffline: string | undefined;
    let originalNpmRegistry: string | undefined;

    beforeAll(() => {
        ensureCompiledTestOutput({
            repositoryRoot: REPO_ROOT,
            outputPaths: [COMPILED_CJS_ENTRY, COMPILED_CJS_PACKAGE_JSON, COMPILED_ESM_WORKER_ENTRY],
            lockName: "compiled-runtime",
            command: ["npm", "run", "build-test-runtime"],
        });
        // Built directly via tsc -- never "npm run build-cli", which also builds the client/studio-client
        // frontends through vite. Neither is needed here: PokieClientServer/StudioServer both serve their
        // own static assets lazily and never validate that clientRoot/studioRoot exist up front, and every
        // assertion below only ever talks to a JSON API, never a served frontend asset. This produces the
        // exact compiled dist/cli/pokie.js every command below is spawned from.
        ensureCompiledTestOutput({
            repositoryRoot: REPO_ROOT,
            outputPaths: [path.join(REPO_ROOT, "dist", "cli", "pokie.js")],
            lockName: "compiled-cli",
            command: [path.join(REPO_ROOT, "node_modules", ".bin", "tsc"), "--project", "tsconfig.cli.json"],
            forceRebuild: true,
        });

        pokiePackageRootWithSpaces = fs.mkdtempSync(path.join(os.tmpdir(), "pokie install root with spaces cli e2e "));
        fs.symlinkSync(path.join(REPO_ROOT, "dist"), path.join(pokiePackageRootWithSpaces, "dist"), "dir");
        fs.symlinkSync(path.join(REPO_ROOT, "node_modules"), path.join(pokiePackageRootWithSpaces, "node_modules"), "dir");
        const repoPackageJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf-8")) as Record<string, unknown>;
        fs.writeFileSync(
            path.join(pokiePackageRootWithSpaces, "package.json"),
            JSON.stringify({...repoPackageJson, version: POKIE_VERSION}, null, 4),
        );
        pokieJsPath = path.join(pokiePackageRootWithSpaces, "dist", "cli", "pokie.js");

        originalNpmOffline = process.env.npm_config_offline;
        originalNpmRegistry = process.env.npm_config_registry;
        process.env["npm_config_offline"] = "true";
        process.env["npm_config_registry"] = "http://127.0.0.1:1/";

        sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie cli offline e2e source "));
        blueprint = createStarterGameBlueprint();
        blueprintPath = path.join(sourceDir, "game.json");
        fs.writeFileSync(blueprintPath, JSON.stringify(blueprint, null, 4));
    });

    afterAll(() => {
        fs.rmSync(computeDefaultCacheDir(blueprint, POKIE_VERSION, createLocalRuntimeIdentity(pokiePackageRootWithSpaces)), {recursive: true, force: true});
        fs.rmSync(pokiePackageRootWithSpaces, {recursive: true, force: true});
        fs.rmSync(sourceDir, {recursive: true, force: true});
        restoreEnv("npm_config_offline", originalNpmOffline);
        restoreEnv("npm_config_registry", originalNpmRegistry);
    });

    it("`pokie validate` reaches a materialized runtime through the built CLI executable", async () => {
        const result = await runPokieCliToCompletion(pokieJsPath, ["validate", blueprintPath]);
        expect(result.stderr).toBe("");
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("valid           yes");
    });

    it("`pokie sim` reaches a materialized runtime through the built CLI executable", async () => {
        const outFile = path.join(sourceDir, "sim-report.json");
        const result = await runPokieCliToCompletion(pokieJsPath, [
            "sim",
            blueprintPath,
            "--rounds",
            "50",
            "--workers",
            "1",
            "--seed",
            "offline-cli-e2e",
            "--out",
            outFile,
        ]);
        expect(result.stderr).toBe("");
        expect(result.exitCode).toBe(0);
        const report = JSON.parse(fs.readFileSync(outFile, "utf-8")) as {game: {id: string}; rounds: number};
        expect(report.game.id).toBe("starter-slot");
        expect(report.rounds).toBe(50);
    });

    it("`pokie serve` reaches a materialized runtime through the built CLI executable and answers real HTTP", async () => {
        const server = await startPokieCliServer(
            pokieJsPath,
            ["serve", blueprintPath, "--port", "0"],
            /POKIE dev server listening on http:\/\/127\.0\.0\.1:(\d+)/,
        );
        try {
            const gameResponse = await fetch(`${server.baseUrl}/game`);
            expect((await gameResponse.json()) as {id: string}).toMatchObject({id: "starter-slot"});
        } finally {
            await server.stop();
        }
    });

    it("`pokie dev` reaches a materialized runtime through the built CLI executable and serves a healthy API", async () => {
        const server = await startPokieCliServer(
            pokieJsPath,
            ["dev", blueprintPath, "--port", "0", "--client-port", "0", "--no-open"],
            /POKIE dev server listening on http:\/\/127\.0\.0\.1:(\d+)/,
        );
        try {
            const healthResponse = await fetch(`${server.baseUrl}/health`);
            expect(healthResponse.status).toBe(200);
        } finally {
            await server.stop();
        }
    });

    it("implicit Blueprint target opening and Play both reach a materialized runtime through the built CLI executable's own dispatch", async () => {
        // Mirrors exactly what `pokie <blueprint.json>` dispatches to -- see resolveCliInvocation.ts's own
        // precedence table: a bare, existing path argument resolves to {commandName: "studio", args:
        // [thatPath, ...everyTrailingFlag]}.
        const server = await startPokieCliServer(
            pokieJsPath,
            [blueprintPath, "--port", "0", "--no-open"],
            /POKIE Studio listening on http:\/\/127\.0\.0\.1:(\d+)/,
        );
        try {
            const dashboard = await pollProjectDashboard(server.baseUrl);
            expect(dashboard.status).toBe("loaded");
            expect((dashboard.game as {id: string}).id).toBe("starter-slot");

            // Play is Studio's only game mode -- a real session driven entirely in-process, with no
            // separate server/host/port of its own (see StudioServer.ts's own doc comment on
            // handlePlayNewSession/handlePlaySpin).
            const created = await postJson(`${server.baseUrl}/api/project/play/session`, {});
            expect(created.status).toBe(201);
            const sessionId = (created.body.session as {sessionId: string}).sessionId;

            const spun = await postJson(`${server.baseUrl}/api/project/play/sessions/${sessionId}/spin`, {});
            expect(spun.status).toBe(200);
        } finally {
            await server.stop();
        }
    });

    it("corrupt and incomplete PAR workbooks fail through every built CLI runtime adapter before a runtime, listener, report, or replay descriptor exists", async () => {
        const corrupt = path.join(sourceDir, "corrupt.par.xlsx");
        const incomplete = path.join(sourceDir, "incomplete.par.xlsx");
        fs.writeFileSync(corrupt, "not an XLSX");
        const workbook = new ExcelJS.Workbook();
        workbook.addWorksheet("Manifest");
        await workbook.xlsx.writeFile(incomplete);

        for (const workbookPath of [corrupt, incomplete]) {
            const simulationReport = `${workbookPath}.simulation.json`;
            const replayDescriptor = `${workbookPath}.replay.json`;
            for (const args of [
                ["serve", workbookPath, "--port", "0"],
                ["dev", workbookPath, "--port", "0", "--client-port", "0", "--no-open"],
                ["sim", workbookPath, "--rounds", "1", "--workers", "1", "--out", simulationReport],
                ["replay", workbookPath, "--round", "1", "--out", replayDescriptor],
            ]) {
                const result = await runPokieCliToCompletion(pokieJsPath, args);
                expect(result.exitCode).not.toBe(0);
                expect(`${result.stdout}\n${result.stderr}`).toMatch(/Cannot prepare a runnable runtime.*PAR workbook recognition.*failed PAR recognition\/import stage.*Next:/);
                expect(`${result.stdout}\n${result.stderr}`).not.toMatch(/listening on http:\/\//);
            }
            expect(fs.existsSync(simulationReport)).toBe(false);
            expect(fs.existsSync(replayDescriptor)).toBe(false);
        }
    });

    it("a compatible PAR workbook reaches generated runtimes through every public CLI and Studio runtime adapter", async () => {
        // This is deliberately the checked-in workbook rather than a mocked ProjectResolving result or
        // an injected runtime path.  Every command below receives the PAR file itself, so each route has
        // to import it into the resolver-owned temporary Blueprint stage and then load the generated
        // cached runtime before it can produce an observable result.
        const workbookPath = path.join(sourceDir, "starter.par.xlsx");
        fs.copyFileSync(path.join(REPO_ROOT, "examples", "parsheets", "starter.par.xlsx"), workbookPath);

        const simOut = path.join(sourceDir, "par-simulation.json");
        const sim = await runPokieCliToCompletion(pokieJsPath, [
            "sim",
            workbookPath,
            "--rounds",
            "25",
            "--workers",
            "1",
            "--seed",
            "par-cli-e2e",
            "--out",
            simOut,
        ]);
        expect(sim).toMatchObject({exitCode: 0, stderr: ""});
        expect(JSON.parse(fs.readFileSync(simOut, "utf-8"))).toMatchObject({game: {id: "par-sheet-starter"}, rounds: 25});

        const replayOut = path.join(sourceDir, "par-replay.json");
        const replay = await runPokieCliToCompletion(pokieJsPath, ["replay", workbookPath, "--round", "3", "--seed", "par-cli-e2e", "--out", replayOut]);
        expect(replay).toMatchObject({exitCode: 0, stderr: ""});
        expect(JSON.parse(fs.readFileSync(replayOut, "utf-8"))).toMatchObject({game: {id: "par-sheet-starter"}, round: 3, seed: "par-cli-e2e"});

        const serve = await startPokieCliServer(
            pokieJsPath,
            ["serve", workbookPath, "--port", "0"],
            /POKIE dev server listening on http:\/\/127\.0\.0\.1:(\d+)/,
        );
        try {
            expect((await (await fetch(`${serve.baseUrl}/game`)).json()) as {id: string}).toMatchObject({id: "par-sheet-starter"});
        } finally {
            await serve.stop();
        }

        const dev = await startPokieCliServer(
            pokieJsPath,
            ["dev", workbookPath, "--port", "0", "--client-port", "0", "--no-open"],
            /POKIE dev server listening on http:\/\/127\.0\.0\.1:(\d+)/,
        );
        try {
            expect((await fetch(`${dev.baseUrl}/health`)).status).toBe(200);
        } finally {
            await dev.stop();
        }

        // A bare artifact argument is the same Studio handoff users receive from `pokie <artifact>`.
        // The dashboard load plus all three runtime actions independently resolve the workbook, which
        // proves no PAR-only adapter bypass is hiding behind the initial dashboard runtime.
        const studio = await startPokieCliServer(
            pokieJsPath,
            [workbookPath, "--port", "0", "--no-open"],
            /POKIE Studio listening on http:\/\/127\.0\.0\.1:(\d+)/,
        );
        try {
            const dashboard = await pollProjectDashboard(studio.baseUrl);
            expect(dashboard).toMatchObject({status: "loaded", projectRoot: path.resolve(workbookPath), game: {id: "par-sheet-starter"}});

            const play = await postJson(`${studio.baseUrl}/api/project/play/session`, {});
            expect(play.status).toBe(201);
            const sessionId = (play.body.session as {sessionId: string}).sessionId;
            expect((await postJson(`${studio.baseUrl}/api/project/play/sessions/${sessionId}/spin`, {})).status).toBe(200);

            const simulation = await postJson(`${studio.baseUrl}/api/project/simulations`, {rounds: 25, seed: "par-studio-e2e"});
            expect(simulation.status).toBe(202);
            const completedSimulation = await pollStudioRuntimeJob(`${studio.baseUrl}/api/project/simulations/${simulation.body.id as string}`);
            expect(completedSimulation).toMatchObject({status: "completed", report: {game: {id: "par-sheet-starter"}, rounds: 25}});

            const replayJob = await postJson(`${studio.baseUrl}/api/project/replays`, {round: 3, seed: "par-studio-e2e"});
            expect(replayJob.status).toBe(202);
            const completedReplay = await pollStudioRuntimeJob(`${studio.baseUrl}/api/project/replays/${replayJob.body.id as string}`);
            expect(completedReplay).toMatchObject({status: "completed", descriptor: {game: {id: "par-sheet-starter"}, round: 3, seed: "par-studio-e2e"}});
        } finally {
            await studio.stop();
        }
    });
});

// Polls GET /api/project/context -- the exact route the Project Dashboard itself polls -- until the
// background load StudioServer kicked off at startup (see StudioServer.ts's own startProjectDashboardLoad)
// settles out of "loading"/"empty" into a terminal status. Mirrors StudioFullWorkflow.integration.test.ts's
// own pollUntilTerminal, tailored to this context's own status vocabulary.
async function pollProjectDashboard(baseUrl: string): Promise<Record<string, unknown>> {
    for (let attempt = 0; attempt < 2000; attempt++) {
        const response = await fetch(`${baseUrl}/api/project/context`);
        const body = (await response.json()) as Record<string, unknown>;
        if (body.status !== "loading" && body.status !== "empty") {
            return body;
        }
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
    }
    throw new Error(`Timed out waiting for ${baseUrl}/api/project/context to leave "loading".`);
}

async function pollStudioRuntimeJob(url: string): Promise<Record<string, unknown>> {
    for (let attempt = 0; attempt < 2000; attempt++) {
        const response = await fetch(url);
        const body = (await response.json()) as Record<string, unknown>;
        if (body.status !== "queued" && body.status !== "running") {
            return body;
        }
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
    }
    throw new Error(`Timed out waiting for ${url} to complete.`);
}

function restoreEnv(name: string, value: string | undefined): void {
    if (value === undefined) {
        Reflect.deleteProperty(process.env, name);
    } else {
        process.env[name] = value;
    }
}
