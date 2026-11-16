/** @jest-environment node */
import {execFileSync, spawn, type ChildProcess} from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {constants, runInThisContext} from "node:vm";
import {createProductionStudioTestStorage, productionStudioCandidate, stageProductionStudioTestHost} from "./productionStudioCandidate";
import {createPackageExtractionTestEnvironment} from "../../../v2/fixtures/PackageExtractionFixture.js";
import {resolvePokieGameEntryModule} from "../../../../src/gamepackage/resolvePokieGameEntryModule.js";
import {GamePackageGenerator} from "../../../../src/generated/GamePackageGenerator.js";

type Devtools = {
    events: Array<{method: string; params: {requestId?: string; request?: {url: string; method: string; postData?: string}; response?: {url: string; status: number}}}>;
    send(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>;
    close(): Promise<void>;
};

// Package opening, context/validation reads and Play each acquire and release real
// dependency snapshots. Budget those phases independently, as in the extraction
// regressions; a later route cannot spend the earlier request's remaining time.
const RUNTIME_PHASE_TIMEOUT = 120_000;
const WORKFLOW_TIMEOUT = 6 * RUNTIME_PHASE_TIMEOUT;

// Controller-owned regression, run after cold observations are frozen and the candidate is built.
// This is deliberately separate from the unscripted initial collector. It neither builds nor packs
// the candidate, substitutes UI/source loaders, nor runs the historical persona campaign.
async function bounded<T>(work: Promise<T>, label: string, timeout = 30_000): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([work, new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), timeout);
        })]);
    } finally {
        clearTimeout(timer);
    }
}

async function waitUntil(check: () => Promise<boolean>, label: string, overallDeadline: number, timeout = 60_000): Promise<void> {
    const deadline = Math.min(Date.now() + timeout, overallDeadline);
    while (Date.now() < deadline) {
        if (await check()) return;
        await new Promise((resolve) => {
            setTimeout(resolve, 100);
        });
    }
    throw new Error(`Timed out: ${label}`);
}

async function stop(child: ChildProcess | undefined): Promise<void> {
    if (child === undefined || child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise<void>((resolve) => {
        child.once("exit", () => resolve());
    });
    child.kill("SIGTERM");
    try {
        await bounded(exited, "owned process cleanup", 5_000);
    } catch {
        child.kill("SIGKILL");
        await bounded(exited, "forced process cleanup", 5_000);
    }
}

type BrowserActions = {
    evaluate<T>(expression: string): Promise<T>;
    send(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>>;
    until(check: () => Promise<boolean>, label: string, timeout?: number): Promise<void>;
};

async function nativeClick({evaluate, send, until}: BrowserActions, expression: string, timeout?: number): Promise<void> {
    await until(() => evaluate<boolean>(`Boolean(${expression})`), `available control: ${expression}`, timeout);
    let point: {x: number; y: number} | undefined;
    try {
        // The native press focuses its target. Settle that focus (and the
        // production focus-visibility scroll) before measuring, rather than
        // allowing it to move the control between press and release.
        await until(async () => {
            const candidate = await evaluate<{x: number; y: number} | undefined>(`(async () => {
                const e = ${expression};
                if (!e || e.disabled || e.getAttribute('aria-busy') === 'true') return;
                e.focus({preventScroll:true});
                e.scrollIntoView({block:'center', behavior:'instant'});
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                if (${expression} !== e || !e.isConnected || e.disabled || document.activeElement !== e) return;
                window.__p908PointerTarget = e;
                const r = e.getBoundingClientRect();
                return {x:r.x+r.width/2, y:r.y+r.height/2};
            })()`);
            if (candidate === undefined) return false;
            await send("Input.dispatchMouseEvent", {type: "mouseMoved", ...candidate, pointerType: "mouse"});
            point = await evaluate<{x: number; y: number} | undefined>(`(async () => {
                const e = window.__p908PointerTarget;
                const before = e.getBoundingClientRect();
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                if (${expression} !== e || !e.isConnected || e.disabled || e.getAttribute('aria-busy') === 'true' || document.activeElement !== e) return;
                const r = e.getBoundingClientRect();
                if (r.width <= 0 || r.height <= 0 || ['x', 'y', 'width', 'height'].some(key => Math.abs(before[key] - r[key]) > 0.1)) return;
                const point = {x:r.x+r.width/2, y:r.y+r.height/2};
                if (Math.abs(point.x - ${candidate.x}) > 0.1 || Math.abs(point.y - ${candidate.y}) > 0.1 || !e.contains(document.elementFromPoint(point.x, point.y))) return;
                const events = window.__p908PointerEvents = [];
                window.__p908CapturePointer = event => events.push({
                    type:event.type, trusted:event.isTrusted, target:e.isConnected && event.composedPath().includes(e)
                });
                for (const type of ['pointerdown','pointerup','click']) document.addEventListener(type, window.__p908CapturePointer, true);
                return point;
            })()`);
            return point !== undefined;
        }, `settled pointer target: ${expression}`, timeout);
        await send("Input.dispatchMouseEvent", {type: "mousePressed", ...point, button: "left", buttons: 1, pointerType: "mouse", clickCount: 1});
        await send("Input.dispatchMouseEvent", {type: "mouseReleased", ...point, button: "left", buttons: 0, pointerType: "mouse", clickCount: 1});
        expect(await evaluate("window.__p908PointerEvents")).toEqual([
            {type: "pointerdown", trusted: true, target: true},
            {type: "pointerup", trusted: true, target: true},
            {type: "click", trusted: true, target: true},
        ]);
    } finally {
        await evaluate(`(() => {
            for (const type of ['pointerdown','pointerup','click']) document.removeEventListener(type, window.__p908CapturePointer, true);
            delete window.__p908CapturePointer;
            delete window.__p908PointerTarget;
            delete window.__p908PointerEvents;
        })()`);
    }
}

it("settles focus reflow before native pointer delivery to the built-package follow-up", async () => {
    const url = pathToFileURL(path.join(process.cwd(), "scripts/p8-05-valera-browser-audit.mjs")).href;
    type BrowserOwner = {ownedProcesses: Map<number, unknown>};
    const {connectP805Devtools, createP805OwnedProcessRecord, drainP805TrackedOwner} = await runInThisContext(`import(${JSON.stringify(url)})`, {
        importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
    }) as {
        connectP805Devtools: (url: string) => Promise<Devtools>;
        createP805OwnedProcessRecord: (label: string, child: ChildProcess, options: Record<string, unknown>) => BrowserOwner;
        drainP805TrackedOwner: (owner: BrowserOwner, graceMs: number) => Promise<{processTreeDrained: boolean; resourcesDrained: boolean}>;
    };
    const root = await fs.mkdtemp(path.join(process.cwd(), "node_modules/.cache/pokie-tmp/p908-pointer-"));
    let owner: BrowserOwner | undefined;
    let browser: ChildProcess | undefined;
    let devtools: Devtools | undefined;
    let startupError: Error | undefined;
    let browserStderr = "";
    const deadline = Date.now() + 25_000;
    const until: BrowserActions["until"] = (check, label, timeout) => waitUntil(check, label, deadline, timeout ?? 5_000);
    try {
        browser = spawn(process.env.P908_CHROMIUM_BINARY ?? "chromium-browser", [
            "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--no-first-run",
            `--user-data-dir=${root}`, "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", "about:blank",
        ], {stdio: ["ignore", "ignore", "pipe"]});
        owner = createP805OwnedProcessRecord("producer pointer regression browser", browser, {});
        browser.stderr?.on("data", (chunk: Buffer) => {
            browserStderr = (browserStderr + chunk.toString()).slice(-8_192);
        });
        browser.on("error", (error) => {
            startupError = error;
        });
        const portFile = path.join(root, "DevToolsActivePort");
        await until(() => {
            if (startupError !== undefined) throw startupError;
            if (browser!.exitCode !== null || browser!.signalCode !== null) throw new Error(`Chromium exited before readiness: ${browserStderr}`);
            return fs.access(portFile).then(() => true, () => false);
        }, "pointer regression Chromium startup", 15_000).catch((error: unknown) => {
            throw new Error(`${String(error)}; Chromium: ${browserStderr}`, {cause: error});
        });
        const port = (await fs.readFile(portFile, "utf8")).split("\n")[0];
        devtools = await bounded(connectP805Devtools(`http://127.0.0.1:${port}`), "pointer regression DevTools startup", 5_000);
        const connection = devtools;
        const send: BrowserActions["send"] = (method, params) => bounded(connection.send(method, params), method, 5_000);
        const evaluate: BrowserActions["evaluate"] = async <T, >(expression: string): Promise<T> => {
            const result = await send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true});
            if (result.exceptionDetails !== undefined) throw new Error(JSON.stringify(result.exceptionDetails));
            return (result.result as {value: T}).value;
        };
        // A transport fixture, not a substitute Studio result. A native focus
        // handler moves the same node, reproducing the unobserved press/release
        // gap without starting an installed persona/save/build collection.
        await send("Page.setDocumentContent", {frameId: ((await send("Page.getFrameTree", {})).frameTree as {frame: {id: string}}).frame.id,
            html: '<button id="open" style="position:absolute;left:100px;top:100px">Open as Project</button>'});
        const reset = () => evaluate(`(() => {
            const e = document.getElementById('open');
            e.blur(); e.style.top = '100px'; window.delivered = 0;
            e.onfocus = () => { e.style.top = '300px'; };
            e.onclick = () => { window.delivered++; };
        })()`);
        await reset();
        const stale = await evaluate<{x: number; y: number}>("(() => { const r = document.getElementById('open').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()");
        await send("Input.dispatchMouseEvent", {type: "mousePressed", ...stale, button: "left", clickCount: 1});
        await send("Input.dispatchMouseEvent", {type: "mouseReleased", ...stale, button: "left", clickCount: 1});
        expect(await evaluate("window.delivered")).toBe(0);
        expect(await evaluate("document.activeElement.id")).toBe("open");
        await reset();
        await nativeClick({evaluate, send, until}, "document.getElementById('open')");
        expect(await evaluate("window.delivered")).toBe(1);
        // Hover can reflow a target after the first focus/scroll measurement.
        await reset();
        await evaluate(`(() => {
            const e = document.getElementById('open');
            e.onfocus = null;
            e.onpointerenter = () => { e.style.top = '400px'; e.onpointerenter = null; };
        })()`);
        await nativeClick({evaluate, send, until}, "document.getElementById('open')");
        expect(await evaluate("window.delivered")).toBe(1);
        await evaluate("document.getElementById('open').disabled = true; window.delivered = 0");
        await expect(nativeClick({evaluate, send, until}, "document.getElementById('open')", 150)).rejects.toThrow("settled pointer target");
        expect(await evaluate("window.delivered")).toBe(0);
    } finally {
        try {
            // Capture the live descendants before cooperative Browser.close
            // can reparent them; verify both process and resource drainage.
            if (browser !== undefined && owner !== undefined) {
                const finalOwner = createP805OwnedProcessRecord("producer pointer regression browser", browser, {});
                for (const [pid, identity] of finalOwner.ownedProcesses) owner.ownedProcesses.set(pid, identity);
            }
            if (devtools !== undefined) {
                await bounded(devtools.send("Browser.close"), "pointer regression browser shutdown", 2_000).catch(() => undefined);
                await bounded(devtools.close(), "pointer regression DevTools cleanup", 2_000);
            }
        } finally {
            try {
                if (owner !== undefined) {
                    expect(await drainP805TrackedOwner(owner, 1_000)).toMatchObject({processTreeDrained: true, resourcesDrained: true});
                }
                await stop(browser);
            } finally {
                await fs.rm(root, {recursive: true, force: true});
            }
        }
    }
}, 45_000);

it("loads the shared Studio test setup without supplying a simulated browser DOM", () => {
    expect(typeof Element).toBe("undefined");
    expect(typeof window).toBe("undefined");
});

it("isolates the standalone compiled host while preserving authenticated installation identities", async () => {
    const storage = await createProductionStudioTestStorage(process.cwd(), "p908-host");
    const source = path.join(storage.root, "checkout");
    try {
        const files = {
            "package.json": JSON.stringify({name: "@fromstan/pokie", type: "module"}),
            "dist/cli/pokie.js": "// Existing production CLI bytes.\n",
            "dist/cjs/index.js": "// Existing runtime bytes.\n",
            "dist/cli/studio-client/index.html": '<script src="/assets/main.js"></script>',
            "dist/cli/studio-client/assets/main.js": "// Existing production bundle bytes.\n",
            "dist/cli/studio-client/assets/main.css": "body { color: red }\n",
            "docs/observation.txt": "Retained evidence stays in the checkout.",
        };
        for (const [relative, bytes] of Object.entries(files)) {
            const file = path.join(source, relative);
            await fs.mkdir(path.dirname(file), {recursive: true});
            await fs.writeFile(file, bytes);
        }
        const candidate = {packageRoot: source, bin: path.join(source, "dist/cli/pokie.js"), authenticated: false};
        const host = await stageProductionStudioTestHost(candidate, storage.cache);
        expect(host.authenticated).toBe(false);
        expect(host.bin).not.toBe(candidate.bin);
        for (const [relative, bytes] of Object.entries(files)) {
            expect(await fs.readFile(path.join(source, relative), "utf8")).toBe(bytes);
            if (!relative.startsWith("docs/")) expect(await fs.readFile(path.join(host.packageRoot, relative), "utf8")).toBe(bytes);
        }
        expect(await fs.readdir(host.packageRoot)).toEqual(["dist", "package.json"]);
        const pinned = {...candidate, authenticated: true};
        // Do not stage, relocate, or rescue an authenticated candidate, even
        // when a disposable destination is unavailable.
        expect(await stageProductionStudioTestHost(pinned, path.join(storage.cache, "missing"))).toBe(pinned);
    } finally {
        await storage.dispose();
    }
});

it.each(["p908-producer", "p909-recovery", "p910-graphic"])("isolates %s browser state from real runtime dependency snapshots", async (prefix) => {
    const repository = process.cwd();
    const storage = await createProductionStudioTestStorage(repository, prefix);
    const restoreTemporaryDirectory = createPackageExtractionTestEnvironment({stageRuntime: false});
    const snapshots = os.tmpdir();
    let loaded: Awaited<ReturnType<typeof resolvePokieGameEntryModule>> | undefined;
    try {
        const {root, cache, profile} = storage;
        expect(path.relative(repository, root).split(path.sep)).toHaveLength(1);
        expect(path.relative(repository, cache).split(path.sep)[0]).toBe("node_modules");
        expect(path.dirname(profile)).toBe(cache);
        const game = path.join(root, "workspace", "game");
        await fs.mkdir(path.join(game, "node_modules", "@fromstan"), {recursive: true});
        await fs.mkdir(path.join(root, "documents"));
        await fs.mkdir(profile);
        // Chromium owns transient links and sockets; copying the checkout must
        // never enumerate them, even while the managed game remains readable.
        const cookie = path.join(profile, "SingletonCookie");
        await fs.symlink("chromium-cookie-token", cookie);
        await fs.writeFile(path.join(profile, "DevToolsActivePort"), "9222\n");
        await fs.writeFile(path.join(root, "documents", "saved.json"), '{"payout":7}');
        await fs.writeFile(path.join(root, "package.json"), JSON.stringify({name: "@fromstan/pokie", main: "index.cjs"}));
        await fs.writeFile(path.join(root, "index.cjs"), `const fs = require('node:fs'), path = require('node:path');
            module.exports = {root: __dirname,
                saved: JSON.parse(fs.readFileSync(path.join(__dirname, 'documents/saved.json'), 'utf8')),
                profileCopied: fs.existsSync(path.join(__dirname, 'browser-profile')),
                cacheCopied: fs.existsSync(path.join(__dirname, 'runtime-cache'))};`);
        await fs.writeFile(path.join(game, "package.json"), JSON.stringify({pokie: {entry: "index.cjs"}, dependencies: {"@fromstan/pokie": "*"}}));
        await fs.writeFile(path.join(game, "index.cjs"), "module.exports = require('@fromstan/pokie');");
        await fs.symlink(root, path.join(game, "node_modules", "@fromstan", "pokie"), "dir");
        // Jest's createRequire maps @fromstan/pokie back to source. Use Node's
        // native loader so the dependency really executes from the copied graph.
        const nativeImport = (entry: string): Promise<Record<string, unknown>> => runInThisContext(`import(${JSON.stringify(pathToFileURL(entry).href)})`, {
            importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
        }) as Promise<Record<string, unknown>>;
        loaded = await resolvePokieGameEntryModule(game, nativeImport);
        const copied = loaded.candidate as {root: string; saved: unknown; profileCopied: boolean; cacheCopied: boolean};
        expect(copied.saved).toEqual({payout: 7});
        expect(copied.profileCopied).toBe(false);
        expect(copied.cacheCopied).toBe(false);
        expect(copied.root).not.toBe(root);
        expect(path.relative(snapshots, copied.root).startsWith(`..${path.sep}`)).toBe(false);
        await fs.access(path.join(copied.root, "documents", "saved.json"));
        expect((await fs.lstat(cookie)).isSymbolicLink()).toBe(true);
        await loaded.release();
        await expect(fs.access(copied.root)).rejects.toThrow("ENOENT");
        expect(await fs.readdir(snapshots)).toEqual([]);
        // A genuine import failure still releases the copied dependency graph;
        // moving volatile storage must not turn failed loading into success.
        await fs.writeFile(path.join(game, "index.cjs"), "throw new Error('fixture import rejected');");
        await expect(resolvePokieGameEntryModule(game, nativeImport)).rejects.toThrow("fixture import rejected");
        expect(await fs.readdir(snapshots)).toEqual([]);
        await fs.access(path.join(profile, "DevToolsActivePort"));
    } finally {
        try {
            await loaded?.release();
        } finally {
            try {
                restoreTemporaryDirectory();
            } finally {
                await storage.dispose();
            }
        }
    }
    await expect(fs.access(storage.root)).rejects.toThrow("ENOENT");
    await expect(fs.access(storage.cache)).rejects.toThrow("ENOENT");
});

it("retains the authenticated installed candidate across the complete gate-test correction", async () => {
    const root = await fs.mkdtemp(path.join(process.cwd(), "node_modules/.cache/pokie-tmp/p908-candidate-"));
    try {
        const fixtureUrl = pathToFileURL(path.join(process.cwd(), "tests/testUtils/createP911CandidateFixture.mjs")).href;
        // Native ESM imports can first load node:os while a prior Jest suite owns
        // an override. Its captured function must remain usable after that suite drains.
        const restoreTemporaryDirectory = createPackageExtractionTestEnvironment();
        const retiredTmpdir = os.tmpdir;
        const retiredDirectory = retiredTmpdir();
        const fixtureModule = await (async () => {
            try {
                return await runInThisContext(`import(${JSON.stringify(fixtureUrl)})`, {
                    importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
                });
            } finally {
                restoreTemporaryDirectory();
            }
        })();
        expect(retiredTmpdir()).toBe(os.tmpdir());
        await expect(fs.access(retiredDirectory)).rejects.toThrow("ENOENT");
        const {candidateFixture, commitP911ToolingDescendant, P911_TOOLING_DESCENDANT_PATHS} = fixtureModule as {
            candidateFixture: (directory: string) => Promise<{repository: string; reference: {path: string; sha256: string}; handoff: {candidateId: string; installationRoot: string; browserDriver: {path: string}}}>;
            commitP911ToolingDescendant: (fixture: {repository: string}) => Promise<string>;
            P911_TOOLING_DESCENDANT_PATHS: string[];
        };
        const fixture = await candidateFixture(root);
        expect(P911_TOOLING_DESCENDANT_PATHS).toEqual(expect.arrayContaining([
            "tests/cli/studio-client/src/P908ValeraProducer.browser.test.tsx",
            "tests/cli/studio-client/src/productionStudioCandidate.ts",
            "tests/cli/studio-client/src/P909ValeraRecovery.browser.test.tsx",
            "tests/cli/studio-client/src/P910ValeraGraphicDesigner.browser.test.tsx",
            "tests/cli/studio-client/src/components/common/StudioPresentation.test.tsx",
            "scripts/p9-11-candidate.mjs",
            "tests/testUtils/createP911CandidateFixture.mjs",
            "scripts/p8-05-release-handoff.mjs",
            "docs/v2-completion/V2C-34.md",
        ]));
        // Both archive selectors must admit the complete correction since the
        // authenticated candidate, including its already retained recheck receipt.
        const correctionPaths = [
            "tests/cli/OutcomeLibraryGenerateWorkflow.integration.test.ts",
            "tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx",
            "tests/cli/studio-client/src/P805ValeraPersonas.browser.test.tsx",
            "tests/cli/commands/ReplayCommand.test.ts",
            "tests/gamepackage/loadPokieGame.test.ts",
            "tests/cli/commands/SimCommand.test.ts",
            "tests/project/wasm/WasmRuntimeParity.golden.test.ts",
            "tests/v2/OptimizationSearchConvergence.test.ts",
            "tests/v2/OptimizationContractsAdapters.test.ts",
            "scripts/p8-05-valera-browser-audit.mjs",
            "tests/cli/studio-client/src/P908ValeraProducer.browser.test.tsx",
            "tests/cli/studio-client/src/productionStudioCandidate.ts",
            "tests/cli/studio-client/src/P909ValeraRecovery.browser.test.tsx",
            "tests/cli/studio-client/src/P910ValeraGraphicDesigner.browser.test.tsx",
            "tests/cli/commands/BuildCommand.test.ts",
            "tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts",
            "tests/cli/studio/StudioJobRoutes.integration.test.ts",
            "tests/cli/studio/StudioServer.test.ts",
            "tests/v2/ExistingMechanicsAuthoring.test.ts",
            "tests/project/ArtifactBuilderRegistry.test.ts",
            "tests/testUtils/stageCompiledTestRuntime.ts",
            "tests/v2/fixtures/PackageExtractionFixture.ts",
            "scripts/p8-05-release-handoff.mjs", "scripts/p9-11-candidate.mjs",
            "tests/testUtils/createP911CandidateFixture.mjs", "docs/v2-completion/V2C-34.md",
        ];
        expect(P911_TOOLING_DESCENDANT_PATHS).toEqual(expect.arrayContaining(correctionPaths));
        for (const file of correctionPaths) await fs.writeFile(path.join(fixture.repository, file), "// Bounded correction fixture.\n");
        const commitFixture = () => {
            execFileSync("git", ["add", "."], {cwd: fixture.repository});
            execFileSync("git", ["-c", "user.name=sta-ger", "-c", "user.email=pascaldelger@gmail.com", "commit", "--quiet", "-m", "fixture bounded correction"], {cwd: fixture.repository});
            return execFileSync("git", ["rev-parse", "HEAD"], {cwd: fixture.repository, encoding: "utf8"}).trim();
        };
        const reviewedId = commitFixture();
        const handoffUrl = pathToFileURL(path.join(process.cwd(), "scripts/p8-05-release-handoff.mjs")).href;
        const {authenticateP805ProductTree} = await runInThisContext(`import(${JSON.stringify(handoffUrl)})`, {
            importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
        }) as {authenticateP805ProductTree: (candidateId: string, reviewedId: string, repository: string) => {changedToolingAndEvidencePaths: string[]}};
        expect(authenticateP805ProductTree(fixture.handoff.candidateId, reviewedId, fixture.repository).changedToolingAndEvidencePaths).toEqual([...correctionPaths].sort());
        await commitP911ToolingDescendant(fixture);
        const environment = {POKIE_P911_CANDIDATE_HANDOFF: fixture.reference.path, POKIE_P911_CANDIDATE_HANDOFF_SHA256: fixture.reference.sha256};
        const installed = await productionStudioCandidate(environment, fixture.repository);
        expect(installed.authenticated).toBe(true);
        expect(installed.packageRoot).toBe(path.join(fixture.handoff.installationRoot, "node_modules/@fromstan/pokie"));
        expect(await stageProductionStudioTestHost(installed, path.join(root, "unused-host"))).toBe(installed);
        await expect(fs.access(path.join(fixture.repository, "dist"))).rejects.toThrow("ENOENT");
        await expect(productionStudioCandidate({...environment, POKIE_P911_CANDIDATE_HANDOFF_SHA256: "b".repeat(64)}, fixture.repository)).rejects.toThrow("receipt digest mismatch");
        const driver = await fs.readFile(fixture.handoff.browserDriver.path);
        await fs.writeFile(fixture.handoff.browserDriver.path, "changed external driver");
        await expect(productionStudioCandidate(environment, fixture.repository)).rejects.toThrow("authenticated controller browser driver required");
        await fs.writeFile(fixture.handoff.browserDriver.path, driver);
        const protectedBase = execFileSync("git", ["rev-parse", "HEAD"], {cwd: fixture.repository, encoding: "utf8"}).trim();
        for (const file of [
            "cli/studio-client/src/changed.ts", "src/gamepackage/resolvePokieGameEntryModule.ts",
            "cli/studio/StudioProjectRegistrationService.ts", "tsconfig.prod.json",
            "tests/cli/studio-client/src/unnamed.test.tsx",
        ]) {
            await fs.mkdir(path.dirname(path.join(fixture.repository, file)), {recursive: true});
            await fs.writeFile(path.join(fixture.repository, file), "// Product, build and unnamed paths remain protected.\n");
            const changedId = commitFixture();
            await expect(productionStudioCandidate(environment, fixture.repository)).rejects.toThrow("product/build inputs changed; affected proofs must be rerun");
            expect(() => authenticateP805ProductTree(protectedBase, changedId, fixture.repository)).toThrow("new blind retests are required");
            await fs.rm(path.join(fixture.repository, file));
            commitFixture();
        }
        await expect(productionStudioCandidate(environment, fixture.repository)).resolves.toEqual(installed);
    } finally {
        await fs.rm(root, {recursive: true, force: true});
    }
});

it("opens a generated package through the real standalone Studio request boundary", async () => {
    const candidate = await productionStudioCandidate(process.env, process.cwd());
    const storage = await createProductionStudioTestStorage(process.cwd(), "p908-open");
    let studio: ChildProcess | undefined;
    let stdout = "";
    let stderr = "";
    let startupError: Error | undefined;
    const started = Date.now();
    const timings: Record<string, number> = {};
    try {
        const host = await stageProductionStudioTestHost(candidate, storage.cache);
        timings.host = Date.now() - started;
        const packageRoot = new GamePackageGenerator("2.0.0").generate({
            manifest: {id: "open-probe", name: "Open probe", version: "0.1.0"},
            reels: 3, rows: 1, symbols: ["A"], paytable: {A: {3: 7}},
        }, storage.root, undefined, undefined, {runtimePackageRoot: host.packageRoot}).projectRoot;
        const environment = {...process.env};
        for (const key of Object.keys(environment)) {
            if (key.startsWith("npm_lifecycle_") || key.startsWith("npm_package_") || key === "INIT_CWD") Reflect.deleteProperty(environment, key);
        }
        studio = spawn(process.execPath, [host.bin, "--no-open", "--port", "0"], {
            cwd: storage.root,
            env: {...environment, XDG_DATA_HOME: path.join(storage.cache, "data"), XDG_CONFIG_HOME: path.join(storage.cache, "config"), TMPDIR: storage.cache},
            stdio: ["ignore", "pipe", "pipe"],
        });
        studio.on("error", error => {
            startupError = error;
        });
        studio.stdout?.on("data", (chunk: Buffer) => {
            stdout = (stdout + chunk.toString()).slice(-16_384);
        });
        studio.stderr?.on("data", (chunk: Buffer) => {
            stderr = (stderr + chunk.toString()).slice(-16_384);
        });
        let origin = "";
        await waitUntil(() => {
            if (startupError) throw startupError;
            if (studio!.exitCode !== null || studio!.signalCode !== null) throw new Error(`Studio exited: ${stderr}`);
            origin = stdout.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0] ?? "";
            return Promise.resolve(origin !== "");
        }, "package-open probe startup", started + 150_000, 15_000);
        timings.startup = Date.now() - started;
        const response = await fetch(`${origin}/api/home/projects/open`, {
            method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({projectRoot: packageRoot}),
            signal: AbortSignal.timeout(RUNTIME_PHASE_TIMEOUT),
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({context: {mode: "project", projectRoot: packageRoot}});
        timings.open = Date.now() - started;
        const context = await fetch(`${origin}/api/context`, {signal: AbortSignal.timeout(5_000)}).then(response => response.json());
        expect(context).toMatchObject({mode: "project", projectRoot: packageRoot});
        const recent = await fetch(`${origin}/api/home/recent-projects`, {signal: AbortSignal.timeout(5_000)}).then(response => response.json());
        expect(recent).toEqual(expect.arrayContaining([expect.objectContaining({projectRoot: packageRoot, missing: false})]));
        expect((await fs.readdir(storage.cache)).filter(name => name.startsWith("pokie-runtime-"))).toEqual([]);
    } catch (error) {
        throw new Error(`${String(error)}; timings: ${JSON.stringify(timings)}; Studio: ${stderr}`, {cause: error});
    } finally {
        try {
            await stop(studio);
        } finally {
            await storage.dispose();
            timings.cleanup = Date.now() - started;
            console.log("Standalone package-open cumulative timings (ms):", timings);
        }
    }
}, 160_000);

it("saves an edited design, validates and plays it, then builds and reopens its real local package", async () => {
    const repository = process.cwd();
    const overallDeadline = Date.now() + WORKFLOW_TIMEOUT;
    const until = (check: () => Promise<boolean>, label: string, timeout?: number) => waitUntil(check, label, overallDeadline, timeout);
    const remaining = () => Math.max(1, Math.min(30_000, overallDeadline - Date.now()));
    // These exact assets are served by the production CLI. No fallback to mocked or source UI.
    const candidate = await productionStudioCandidate(process.env, repository);
    const storage = await createProductionStudioTestStorage(repository, "p908-producer");
    const {root, cache, profile} = storage;
    let studio: ChildProcess | undefined;
    let browser: ChildProcess | undefined;
    let devtools: Devtools | undefined;
    let stdout = "";
    let stderr = "";
    let startupError: Error | undefined;
    try {
        const host = await stageProductionStudioTestHost(candidate, cache);
        const documents = path.join(root, "documents");
        const workspace = path.join(root, "workspace");
        for (const directory of [documents, workspace, profile]) await fs.mkdir(directory);
        // The production child gets the same caller context under npm and direct Jest launches.
        const studioEnvironment = {...process.env};
        for (const key of Object.keys(studioEnvironment)) {
            if (key.startsWith("npm_lifecycle_") || key.startsWith("npm_package_") || key === "INIT_CWD") {
                Reflect.deleteProperty(studioEnvironment, key);
            }
        }
        studio = spawn(process.execPath, [host.bin, "--no-open", "--port", "0"], {
            cwd: workspace,
            env: {...studioEnvironment, XDG_DOCUMENTS_DIR: documents, XDG_DATA_HOME: path.join(cache, "data"), XDG_CONFIG_HOME: path.join(cache, "config"), TMPDIR: cache, NPM_CONFIG_CACHE: path.join(cache, "npm-cache")},
            stdio: ["ignore", "pipe", "pipe"],
        });
        studio.on("error", (error) => {
            startupError = error;
        });
        studio.stdout?.on("data", (chunk: Buffer) => {
            stdout = (stdout + chunk.toString()).slice(-16_384);
        });
        studio.stderr?.on("data", (chunk: Buffer) => {
            stderr = (stderr + chunk.toString()).slice(-16_384);
        });
        let origin = "";
        await until(() => {
            if (startupError !== undefined) throw startupError;
            if (studio !== undefined && (studio.exitCode !== null || studio.signalCode !== null)) throw new Error(`Studio exited: ${stderr}`);
            origin = stdout.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0] ?? "";
            return Promise.resolve(origin !== "");
        }, "production Studio startup");
        browser = spawn(process.env.P908_CHROMIUM_BINARY ?? "chromium-browser", [
            "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--no-first-run",
            `--user-data-dir=${profile}`, "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", "about:blank",
        ], {stdio: "ignore"});
        browser.on("error", (error) => {
            startupError = error;
        });
        const portFile = path.join(profile, "DevToolsActivePort");
        await until(() => {
            if (startupError !== undefined) throw startupError;
            return fs.access(portFile).then(() => true, () => false);
        }, "fresh Chromium profile");
        const port = (await fs.readFile(portFile, "utf8")).split("\n")[0];
        // Reuse only the existing transport, never its scripted persona/audit runner.
        const transportUrl = pathToFileURL(path.join(repository, "scripts/p8-05-valera-browser-audit.mjs")).href;
        // ts-jest compiles this component lane to CommonJS. Preserve a native ESM import for
        // the .mjs transport instead of letting it become Jest's require(fileURL).
        const transport = await runInThisContext(`import(${JSON.stringify(transportUrl)})`, {
            importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
        }) as {connectP805Devtools: (url: string, initialUrl: string) => Promise<Devtools>};
        devtools = await bounded(transport.connectP805Devtools(`http://127.0.0.1:${port}`, `${origin}/#/`), "DevTools startup", remaining());
        const connection = devtools;
        await bounded(connection.send("Emulation.setDeviceMetricsOverride", {width: 1280, height: 900, deviceScaleFactor: 1, mobile: false}), "producer viewport", remaining());
        const send = (method: string, params: Record<string, unknown>) => bounded(connection.send(method, params), method, remaining());
        const evaluate = async <T, >(expression: string): Promise<T> => {
            const response = await bounded(connection.send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true}), "rendered operation", remaining());
            if (response.exceptionDetails !== undefined) throw new Error(JSON.stringify(response.exceptionDetails));
            return (response.result as {value: T}).value;
        };
        const button = (label: string, scope = "document") => `Array.from((${scope})?.querySelectorAll('button') ?? []).find(e => e.textContent.trim() === ${JSON.stringify(label)} && e.getClientRects().length && !e.disabled)`;
        const click = (expression: string, timeout?: number) => nativeClick({evaluate, send, until}, expression, timeout);
        const playRound = async (projectRoot: string) => {
            await click(button("Open Play"));
            await click(button("New Play session"));
            const cursor = connection.events.length;
            await click(button("Spin"), RUNTIME_PHASE_TIMEOUT);
            let played: {status: string; session: {studioRound: number; studioProjectRoot: string; debug: {artifact: {screen: unknown[][]}}}} | undefined;
            await until(async () => {
                const response = connection.events.slice(cursor).find((event) => event.method === "Network.responseReceived" && event.params.response?.url.endsWith("/spin"));
                if (response === undefined) return false;
                expect(response.params.response?.status).toBe(200);
                try {
                    const body = await bounded(connection.send("Network.getResponseBody", {requestId: response.params.requestId}), "played response", remaining());
                    played = JSON.parse(body.body as string);
                    return true;
                } catch {
                    return false;
                }
            }, "real settled spin response", RUNTIME_PHASE_TIMEOUT);
            expect(played?.status).toBe("ok");
            expect(played?.session.studioRound).toBe(1);
            expect(played?.session.studioProjectRoot).toBe(projectRoot);
            // A game's serializer owns its public fields; the recorded artifact always carries
            // the actual reel screen, including for generated packages with no public screen field.
            expect(played?.session.debug.artifact.screen.length).toBeGreaterThan(0);
            await until(() => evaluate<boolean>("document.body.innerText.includes('Credits')"), "rendered settled round");
        };
        await until(() => evaluate<boolean>("document.body.innerText.includes('POKIE is a slot-game logic framework')"), "public Home explanation");
        await click("Array.from(document.querySelectorAll('[role=tab]')).find(e => e.textContent.startsWith('Paytable') && e.getClientRects().length)");
        const payoutSelector = await evaluate<string>("Array.from(document.querySelectorAll('input[aria-label]')).find(e => /x\\d+ payout$/.test(e.getAttribute('aria-label')) && e.getClientRects().length).getAttribute('aria-label')");
        await evaluate(`document.querySelector('input[aria-label=' + ${JSON.stringify(JSON.stringify(payoutSelector))} + ']').focus()`);
        await send("Input.dispatchKeyEvent", {type: "keyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2});
        await send("Input.dispatchKeyEvent", {type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2});
        await send("Input.insertText", {text: "7"});
        expect(await evaluate<string>("document.activeElement.value")).toBe("7");
        await send("Input.dispatchKeyEvent", {type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9});
        await send("Input.dispatchKeyEvent", {type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9});
        await click(button("Create game"));
        try {
            await until(() => evaluate<boolean>("location.hash.endsWith('/overview') && document.body.innerText.includes('Valid — no issues found.')"), "saved project validation");
        } catch (error) {
            const rendered = await evaluate("({route: location.hash, text: document.body.innerText})");
            const saves = connection.events.filter((event) => event.method === "Network.responseReceived" && event.params.response?.url.endsWith("/save-managed"));
            const responses = await Promise.all(saves.map(async (event) => ({
                status: event.params.response?.status,
                body: await send("Network.getResponseBody", {requestId: event.params.requestId}).catch(String),
            })));
            throw new Error(`${String(error)}; rendered state: ${JSON.stringify(rendered)}; save responses: ${JSON.stringify(responses)}; Studio: ${stderr}`, {cause: error});
        }
        const designPath = await evaluate<string>("decodeURIComponent(location.hash.split('/')[2])");
        expect(designPath.startsWith(documents + path.sep)).toBe(true);
        const saved = JSON.parse(await fs.readFile(designPath, "utf8")) as {paytable: Record<string, Record<string, number>>};
        const payout = payoutSelector.match(/^(.*) x(\d+) payout$/)!;
        expect(saved.paytable[payout[1]][payout[2]]).toBe(7);
        const registry = await fetch(`${origin}/api/home/projects/registry`, {signal: AbortSignal.timeout(5_000)}).then((response) => response.json()) as Array<{location: string}>;
        expect(registry.filter((entry) => entry.location === designPath)).toHaveLength(1);
        await playRound(designPath);
        await click(button("Build/Export"));
        await until(() => evaluate<boolean>("document.querySelectorAll('[data-pokie-lifecycle-card=outcome-library]').length === 1"), "single outcome generator");
        const packageScope = "document.getElementById('artifact-build-tsPackage')?.closest('[data-pokie-lifecycle-form=artifact-build]')";
        await click(button("Build", packageScope));
        await until(() => evaluate<boolean>(`Boolean(${button("Open as Project", packageScope)})`), "completed package follow-up");
        const outputPath = await evaluate<string>(`(${button("Open as Project", packageScope)}).getAttribute('data-pokie-lifecycle-artifact-output')`);
        await fs.access(path.join(outputPath, "dist/index.js"));
        const packageCursor = connection.events.length;
        try {
            await click(button("Open as Project", packageScope));
            let requestId: string | undefined;
            // A missed native click is not slow runtime materialization. Join
            // this activation to its own submitted path before waiting for work.
            await until(() => {
                requestId = connection.events.slice(packageCursor).find((event) => event.method === "Network.requestWillBeSent"
                    && event.params.request?.url.endsWith("/api/home/projects/open") && event.params.request.method === "POST"
                    && JSON.parse(event.params.request.postData ?? "{}").projectRoot === outputPath)?.params.requestId;
                return Promise.resolve(requestId !== undefined);
            }, "built package open request dispatch", 5_000);
            await until(() => Promise.resolve(connection.events.slice(packageCursor).some((event) => event.method === "Network.responseReceived" && event.params.requestId === requestId)), "built package open response", RUNTIME_PHASE_TIMEOUT);
            const opened = connection.events.slice(packageCursor).find((event) => event.method === "Network.responseReceived" && event.params.requestId === requestId)!;
            expect(opened.params.response?.status).toBe(200);
            await until(() => Promise.resolve(connection.events.slice(packageCursor).some((event) => event.method === "Network.loadingFinished" && event.params.requestId === requestId)), "completed package open response body", 5_000);
            const openedBody = await send("Network.getResponseBody", {requestId});
            expect(JSON.parse(openedBody.body as string)).toMatchObject({context: {mode: "project", projectRoot: outputPath}});
            await until(() => evaluate<boolean>("location.hash.endsWith('/overview') && document.body.innerText.includes('Game Model is read-only for this package')"), "built package opening and truthful editability", RUNTIME_PHASE_TIMEOUT);
            await until(() => evaluate<boolean>("document.body.innerText.includes('Valid — no issues found.')"), "built package validation", RUNTIME_PHASE_TIMEOUT);
        } catch (error) {
            const rendered = await evaluate("({route: location.hash, text: document.body.innerText})");
            const responses = await Promise.all(connection.events.filter((event) => event.method === "Network.responseReceived" && (/\/api\/(?:home\/projects\/open|project\/(?:context|validate))$/).test(event.params.response?.url ?? "")).slice(-8).map(async (event) => ({
                url: event.params.response?.url,
                status: event.params.response?.status,
                body: await send("Network.getResponseBody", {requestId: event.params.requestId}).catch(String),
            })));
            throw new Error(`${String(error)}; rendered state: ${JSON.stringify(rendered)}; project responses: ${JSON.stringify(responses)}; Studio: ${stderr}`, {cause: error});
        }
        const packagePath = await evaluate<string>("decodeURIComponent(location.hash.split('/')[2])");
        expect(packagePath).toBe(outputPath);
        expect(packagePath).not.toBe(designPath);
        expect(packagePath.startsWith(root + path.sep)).toBe(true);
        const validationResponse = connection.events.slice(packageCursor).find((event) => event.method === "Network.responseReceived" && event.params.response?.url.endsWith("/api/project/validate"));
        expect(validationResponse?.params.response?.status).toBe(200);
        const validationBody = await send("Network.getResponseBody", {requestId: validationResponse?.params.requestId});
        expect(JSON.parse(validationBody.body as string)).toMatchObject({packageRoot: packagePath, valid: true, errors: [], warnings: []});
        await fs.access(path.join(packagePath, "dist/index.js"));
        await fs.access(designPath);
        await playRound(packagePath);
    } finally {
        try {
            if (devtools !== undefined) {
                await bounded(devtools.send("Browser.close"), "browser shutdown", 2_000).catch(() => undefined);
                await devtools.close();
            }
        } finally {
            try {
                await stop(browser);
            } finally {
                try {
                    await stop(studio);
                } finally {
                    await storage.dispose();
                }
            }
        }
    }
}, WORKFLOW_TIMEOUT + 30_000);
