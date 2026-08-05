import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import {computeGameBlueprintHash, DEV_OPERATION, GAME_BLUEPRINT_SCHEMA_VERSION, GameBlueprint, PokieClientServer, PokieDevServer, SERVE_OPERATION, SIM_OPERATION, VALIDATE_OPERATION} from "pokie";
import {createStarterGameBlueprint} from "../../../cli/build/createStarterGameBlueprint.js";
import {DevCommand} from "../../../cli/commands/DevCommand.js";
import {ServeCommand} from "../../../cli/commands/ServeCommand.js";
import {SimCommand} from "../../../cli/commands/SimCommand.js";
import {StudioCommand} from "../../../cli/commands/StudioCommand.js";
import {ValidateCommand} from "../../../cli/commands/ValidateCommand.js";
import {BlueprintMaterializationError} from "../../../cli/materialize/BlueprintMaterializationError.js";
import {BlueprintProjectMaterializer} from "../../../cli/materialize/BlueprintProjectMaterializer.js";
import {createMaterializingRuntimePackageResolver} from "../../../cli/materialize/materializeRuntimePackage.js";
import {PackageCommandResult, PackageCommandRunning, withLocalPokieInstall} from "../../../cli/prepare/PackageCommandRunner.js";
import {StudioServer} from "../../../cli/studio/StudioServer.js";
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

function computeDefaultCacheDir(blueprint: GameBlueprint, pokieVersion: string): string {
    const raw = `blueprintHash:${computeGameBlueprintHash(blueprint)}|pokieVersion:${pokieVersion}|buildContractVersion:${GAME_BLUEPRINT_SCHEMA_VERSION}`;
    const cacheKey = crypto.createHash("sha256").update(raw).digest("hex");
    return path.join(DEFAULT_CACHE_ROOT, cacheKey);
}

type SignalHandler = () => void;

// A minimal NodeJS.Process stand-in so StudioCommand's/DevCommand's own SIGINT/SIGTERM registration
// never touches the real, shared `process` object running this test file -- same shape as the
// FakeProcess already used by tests/cli/commands/StudioCommand.test.ts and DevCommand.test.ts.
class FakeProcess {
    public readonly exitCalls: number[] = [];

    public once(_event: string, _handler: SignalHandler): FakeProcess {
        return this;
    }

    public exit(code: number): void {
        this.exitCalls.push(code);
    }
}

async function postJson(url: string, body: unknown = {}): Promise<{status: number; body: Record<string, unknown>}> {
    const response = await fetch(url, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
    });
    return {status: response.status, body: (await response.json()) as Record<string, unknown>};
}

// Deliberately never a real, published npm version -- every scenario below proves it never matters,
// since "pokie" itself, and every one of its own runtime dependencies (e.g. "exceljs"), are always
// resolved locally (via withLocalPokieInstall -- production's own mechanism, used completely
// unmodified here, never a test-only stand-in for it) rather than looked up against a registry at all.
// Randomized per test run (never a fixed literal) so a materialize() call below always performs a
// genuine fresh install -- proving the real npm mechanism runs, not just that a stale cache entry left
// over from a previous run of this same file gets borrowed.
const UNPUBLISHED_POKIE_VERSION = `0.0.0-offline-e2e-unpublished-${crypto.randomBytes(4).toString("hex")}`;

// Fails the very first "npm install" it's asked to run (a real, structured rejection shaped like a real
// execFile failure -- a message plus a separate "stderr") and delegates every call after that to `base` --
// standing in for a real, transient local npm failure (a flaky lock, a momentarily-corrupt npm cache)
// followed by a successful retry, without ever faking BlueprintProjectMaterializer's own recovery logic.
function failFirstInstallThenDelegate(base: PackageCommandRunning): PackageCommandRunning & {calls: number} {
    let calls = 0;
    let failed = false;
    const runner = (command: string, args: string[], cwd: string): Promise<PackageCommandResult> => {
        calls++;
        if (args[0] === "install" && !failed) {
            failed = true;
            return Promise.reject(
                Object.assign(new Error("Command failed: npm install\nnpm ERR! simulated transient local npm failure"), {
                    stderr: "npm ERR! simulated transient local npm failure -- e.g. a momentarily locked npm cache",
                }),
            );
        }
        return base(command, args, cwd);
    };
    // Object.assign copies a getter's *current value*, not the accessor itself -- defineProperty is what
    // keeps `.calls` live across every subsequent invocation of `runner`. Reflect.defineProperty returns
    // a success boolean, not the target, so the added property needs an explicit cast on `runner` itself
    // afterward.
    Reflect.defineProperty(runner, "calls", {
        get: () => calls,
    });
    return runner as PackageCommandRunning & {calls: number};
}

// Proves BlueprintProjectMaterializer's real, shipped offline mechanism end to end, through the actual
// production entry point (createMaterializingRuntimePackageResolver) every CLI/Studio operation that
// loads a POKIE game package is built from -- not a hand-constructed BlueprintProjectMaterializer
// standing in for it. A real ProjectTargetResolver recognizes the raw blueprint file exactly as a bare
// `pokie <blueprint.json>` launch would; a real GamePackageGenerator, a real spawned "npm install" that
// never reaches a registry (see below), and a real PokieGamePackageValidator load the result.
//
// `pokiePackageRootWithSpaces` stands in for "the running POKIE installation's own root directory" (see
// cli/pokie.ts's readOwnPackageRoot()) at a path shaped the way a real end user's machine easily
// produces one (e.g. under "Program Files", "My Projects") -- a symlink to this checkout's own
// REPO_ROOT, so every provenance withLocalPokieDependency's own doc comment lists (a dev checkout, an
// npm-linked target, a tarball-installed or ordinarily npm-installed copy) is equally well represented:
// the mechanism only ever cares about the resolved absolute path, never how it got there, and a symlink
// resolves to exactly the same kind of absolute path any of them would.
//
// Every "npm install" spawned below also runs with the registry forced unreachable and npm's own
// `--offline` mode forced on (see beforeAll) -- so an unpublished pokieVersion alone could never be
// mistaken for proof that *every* transitive dependency avoids registry resolution (e.g. "exceljs" alone
// pulls in dozens of packages of its own -- see withLocalPokieDependencyClosure's own doc comment in
// PackageCommandRunner.ts): if this checkout's own dependency-closure rewrite ever missed one, npm would
// fail fast here instead of silently succeeding against a reachable registry.
//
// Slow (real npm), same "pokie-integration" project as BlueprintProjectMaterializer.integration.test.ts
// (see jest.config.mjs's `*.integration.test.ts` glob).
describe("BlueprintProjectMaterializer (offline end-to-end: default production resolver, unpublished pokie version, real npm, no registry, spaced installation path)", () => {
    jest.setTimeout(300000);

    let cacheRoot: string;
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
        });

        pokiePackageRootWithSpaces = path.join(os.tmpdir(), `pokie install root with spaces ${crypto.randomBytes(4).toString("hex")}`);
        fs.symlinkSync(REPO_ROOT, pokiePackageRootWithSpaces, "dir");

        // Forces any npm dependency resolution that isn't already rewritten to a local `file:` spec to
        // fail loudly and immediately, instead of silently succeeding against a reachable registry in a
        // network-connected dev/CI environment -- see this describe block's own doc comment. `offline`
        // alone already guarantees zero network requests of any kind (a DNS-independent, deterministic
        // failure mode); the unreachable registry URL is defense in depth in case any single install
        // step doesn't inherit that flag.
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
        cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie materialize cache offline e2e "));
        sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie materialize source offline e2e "));
    });

    afterEach(() => {
        fs.rmSync(cacheRoot, {recursive: true, force: true});
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
                fs.readFileSync(path.join(first.runtimePath, "node_modules", "pokie", "package.json"), "utf-8"),
            ) as {name: string};
            expect(installedPokiePackageJson.name).toBe("pokie");

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

    it("recovers from a failed staging build through the production resolver, leaves no cache artifacts, and safely retries without a second install once cached", async () => {
        const blueprintPath = writeStarterBlueprint();

        const flakyRunner = failFirstInstallThenDelegate(withLocalPokieInstall(pokiePackageRootWithSpaces));
        const materializer = new BlueprintProjectMaterializer(
            UNPUBLISHED_POKIE_VERSION,
            undefined,
            undefined,
            undefined,
            flakyRunner,
            undefined,
            cacheRoot,
        );
        // `resolveProject` stays the real default (undefined) -- only the materializer's own runCommand
        // needs to be flaky here, so project resolution is exercised exactly as production does it.
        const resolveRuntimePackageRoot = createMaterializingRuntimePackageResolver(UNPUBLISHED_POKIE_VERSION, DEV_OPERATION, undefined, {materializer});

        const caught = await resolveRuntimePackageRoot(blueprintPath).catch((error: unknown) => error);

        expect(caught).toBeInstanceOf(BlueprintMaterializationError);
        const materializationError = caught as BlueprintMaterializationError;
        expect(materializationError.phase).toBe("dependencies");
        // The human-facing message leads with a plain-English summary -- the raw npm output never leaks
        // into it, only into the error's own "details" (see BlueprintMaterializationError's own doc
        // comment, and cli/dispatch.ts's own secondary "npm output:" block).
        expect(materializationError.message).not.toContain("npm ERR!");
        expect(materializationError.message.toLowerCase()).toContain("dependencies");
        expect(materializationError.details).toContain("npm ERR! simulated transient local npm failure");
        expect(fs.readdirSync(cacheRoot)).toEqual([]);

        const retried = await resolveRuntimePackageRoot(blueprintPath);
        try {
            expect(fs.existsSync(path.join(retried.runtimePath, "dist", "index.js"))).toBe(true);
            expect(fs.existsSync(path.join(retried.runtimePath, "node_modules", "pokie"))).toBe(true);
            expect(flakyRunner.calls).toBe(2);

            const cachedAfterRetry = await resolveRuntimePackageRoot(blueprintPath);
            try {
                expect(cachedAfterRetry.runtimePath).toBe(retried.runtimePath);
                expect(flakyRunner.calls).toBe(2);
            } finally {
                await cachedAfterRetry.release();
            }
        } finally {
            await retried.release();
        }
    });
});

// Proves the offline mechanism above isn't just reachable through BlueprintProjectMaterializer/
// createMaterializingRuntimePackageResolver directly (the describe block above), but through every
// required CLI runtime entry point a real user would actually run against an unpublished Blueprint:
// `pokie validate`, `pokie sim`, `pokie serve`, `pokie dev`, the implicit `pokie <blueprint.json>`
// Studio launch (see resolveCliInvocation.ts's own doc comment on why a bare, existing path argument
// opens Studio's Project mode for it), and Studio's Play runtime -- the "applicable play path" for a
// Blueprint, which has no separately-built package a second, standalone play surface could otherwise
// come from. Every command below is constructed exactly the way cli/pokie.ts itself constructs it --
// createMaterializingRuntimePackageResolver(pokieVersion, <that command's own operation>,
// pokiePackageRootWithSpaces), with no `dependencies` override -- so a passing run here is proof the
// *real* production wiring reaches a materialized runtime for each of them, never a hand-rolled
// resolver/materializer standing in for it.
//
// All six share one pokieVersion and one unmodified starter Blueprint, so -- exactly as a real, shared
// cache would -- only the first command below to run actually performs a real "npm install"; every
// command after it borrows that same cache entry (BlueprintProjectMaterializer's own cache key never
// depends on which PokieOperation asked for it -- see that class's own doc comment). That's still full
// proof every entry point *reaches* the shared mechanism; the dedicated fresh-install/cache-reuse
// behavior itself is already covered by the describe block above, so it isn't repeated six times here.
describe("CLI command coverage (offline end-to-end): validate, sim, serve, dev, implicit Blueprint target opening, and Play -- all through the default production resolver wiring", () => {
    jest.setTimeout(300000);

    const POKIE_VERSION = `0.0.0-offline-cli-e2e-unpublished-${crypto.randomBytes(4).toString("hex")}`;

    let pokiePackageRootWithSpaces: string;
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

        pokiePackageRootWithSpaces = path.join(os.tmpdir(), `pokie install root with spaces cli e2e ${crypto.randomBytes(4).toString("hex")}`);
        fs.symlinkSync(REPO_ROOT, pokiePackageRootWithSpaces, "dir");

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
        fs.rmSync(pokiePackageRootWithSpaces, {force: true});
        fs.rmSync(sourceDir, {recursive: true, force: true});
        fs.rmSync(computeDefaultCacheDir(blueprint, POKIE_VERSION), {recursive: true, force: true});
        restoreEnv("npm_config_offline", originalNpmOffline);
        restoreEnv("npm_config_registry", originalNpmRegistry);
    });

    it("validate reaches a materialized runtime through the default production resolver", async () => {
        const resolveRuntimePackageRoot = createMaterializingRuntimePackageResolver(POKIE_VERSION, VALIDATE_OPERATION, pokiePackageRootWithSpaces);
        const exitCode = await new ValidateCommand(undefined, undefined, resolveRuntimePackageRoot).run([blueprintPath]);
        expect(exitCode).toBe(0);
    });

    it("sim reaches a materialized runtime through the default production resolver", async () => {
        const resolveRuntimePackageRoot = createMaterializingRuntimePackageResolver(POKIE_VERSION, SIM_OPERATION, pokiePackageRootWithSpaces);
        const outFile = path.join(sourceDir, "sim-report.json");
        await new SimCommand(undefined, undefined, undefined, undefined, undefined, resolveRuntimePackageRoot).run([
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
        const report = JSON.parse(fs.readFileSync(outFile, "utf-8")) as {game: {id: string}; rounds: number};
        expect(report.game.id).toBe("starter-slot");
        expect(report.rounds).toBe(50);
    });

    it("serve reaches a materialized runtime through the default production resolver and answers real HTTP", async () => {
        const resolveRuntimePackageRoot = createMaterializingRuntimePackageResolver(POKIE_VERSION, SERVE_OPERATION, pokiePackageRootWithSpaces);
        let server: PokieDevServer | undefined;
        jest.spyOn(console, "log").mockImplementation(() => undefined);
        try {
            await new ServeCommand(
                undefined,
                (game, options) => {
                    server = new PokieDevServer(game, options);
                    return server;
                },
                resolveRuntimePackageRoot,
            ).run([blueprintPath, "--port", "0"]);

            const printed = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join("\n");
            const port = Number(printed.match(/http:\/\/127\.0\.0\.1:(\d+)/)![1]);
            const gameResponse = await fetch(`http://127.0.0.1:${port}/game`);
            expect((await gameResponse.json()) as {id: string}).toMatchObject({id: "starter-slot"});
        } finally {
            (console.log as jest.Mock).mockRestore();
            await server?.stop();
        }
    });

    it("dev reaches a materialized runtime through the default production resolver and serves a healthy API", async () => {
        const resolveRuntimePackageRoot = createMaterializingRuntimePackageResolver(POKIE_VERSION, DEV_OPERATION, pokiePackageRootWithSpaces);
        const clientRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie cli offline e2e client "));
        fs.writeFileSync(path.join(clientRoot, "index.html"), "<html>preview</html>");
        let apiServer: PokieDevServer | undefined;
        let clientServer: PokieClientServer | undefined;
        jest.spyOn(console, "log").mockImplementation(() => undefined);
        try {
            await new DevCommand(
                undefined,
                (game, options) => {
                    apiServer = new PokieDevServer(game, options);
                    return apiServer;
                },
                {
                    clientRoot,
                    createClientServer: (root, options) => {
                        clientServer = new PokieClientServer(root, options);
                        return clientServer;
                    },
                    process: new FakeProcess() as unknown as NodeJS.Process,
                },
                resolveRuntimePackageRoot,
            ).run([blueprintPath, "--port", "0", "--client-port", "0", "--no-open"]);

            const printed = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join("\n");
            const apiPort = Number(printed.match(/dev server \(experimental\) listening on http:\/\/127\.0\.0\.1:(\d+)/)![1]);
            const healthResponse = await fetch(`http://127.0.0.1:${apiPort}/health`);
            expect(healthResponse.status).toBe(200);
        } finally {
            (console.log as jest.Mock).mockRestore();
            await apiServer?.stop();
            await clientServer?.stop();
            fs.rmSync(clientRoot, {recursive: true, force: true});
        }
    });

    it("implicit Blueprint target opening and Play both reach a materialized runtime through Studio's own default production resolver", async () => {
        const studioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie cli offline e2e studio-root "));
        let studioServer: StudioServer | undefined;
        jest.spyOn(console, "log").mockImplementation(() => undefined);
        try {
            // Mirrors exactly what `pokie <blueprint.json>` dispatches to -- see resolveCliInvocation.ts's
            // own precedence table: a bare, existing path argument resolves to {commandName: "studio",
            // args: [thatPath]}, and cli/pokie.ts constructs StudioCommand with this exact same
            // (pokieVersion, pokiePackageRoot) pair.
            await new StudioCommand(POKIE_VERSION, pokiePackageRootWithSpaces, {
                studioRoot,
                process: new FakeProcess() as unknown as NodeJS.Process,
                createServer: (options) => {
                    studioServer = new StudioServer(options);
                    return studioServer;
                },
            }).run([blueprintPath, "--port", "0", "--no-open"]);

            const printed = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join("\n");
            const studioPort = Number(printed.match(/POKIE Studio listening on http:\/\/127\.0\.0\.1:(\d+)/)![1]);
            const baseUrl = `http://127.0.0.1:${studioPort}`;

            const dashboard = await pollProjectDashboard(baseUrl);
            expect(dashboard.status).toBe("loaded");
            expect((dashboard.game as {id: string}).id).toBe("starter-slot");

            const started = await postJson(`${baseUrl}/api/project/runtime/start`, {port: 0});
            expect(started.status).toBe(201);

            const created = await postJson(`${baseUrl}/api/project/runtime/sessions`, {});
            expect(created.status).toBe(201);
            const sessionId = (created.body.session as {sessionId: string}).sessionId;

            const spun = await postJson(`${baseUrl}/api/project/runtime/sessions/${sessionId}/spins`, {requestId: "offline-cli-e2e-spin"});
            expect(spun.status).toBe(200);

            const stopped = await postJson(`${baseUrl}/api/project/runtime/stop`);
            expect(stopped.status).toBe(200);
        } finally {
            (console.log as jest.Mock).mockRestore();
            await studioServer?.stop();
            fs.rmSync(studioRoot, {recursive: true, force: true});
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

function restoreEnv(name: string, value: string | undefined): void {
    if (value === undefined) {
        Reflect.deleteProperty(process.env, name);
    } else {
        process.env[name] = value;
    }
}
