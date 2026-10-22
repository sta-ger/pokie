/** @jest-environment node */
import {execFileSync, spawn, type ChildProcess} from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {constants, runInThisContext} from "node:vm";
import {productionStudioCandidate} from "./productionStudioCandidate";

type Devtools = {
    events: Array<{method: string; params: {requestId?: string; response?: {url: string; status: number}}}>;
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

it("loads the shared Studio test setup without supplying a simulated browser DOM", () => {
    expect(typeof Element).toBe("undefined");
    expect(typeof window).toBe("undefined");
});

it("retains the authenticated installed candidate across the complete gate-test correction", async () => {
    const root = await fs.mkdtemp(path.join(process.cwd(), "node_modules/.cache/pokie-tmp/p908-candidate-"));
    try {
        const fixtureUrl = pathToFileURL(path.join(process.cwd(), "tests/testUtils/createP911CandidateFixture.mjs")).href;
        const {candidateFixture, commitP911ToolingDescendant, P911_TOOLING_DESCENDANT_PATHS} = await runInThisContext(`import(${JSON.stringify(fixtureUrl)})`, {
            importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
        }) as {
            candidateFixture: (directory: string) => Promise<{repository: string; reference: {path: string; sha256: string}; handoff: {candidateId: string; installationRoot: string; browserDriver: {path: string}}}>;
            commitP911ToolingDescendant: (fixture: {repository: string}) => Promise<string>;
            P911_TOOLING_DESCENDANT_PATHS: string[];
        };
        const fixture = await candidateFixture(root);
        expect(P911_TOOLING_DESCENDANT_PATHS).toEqual(expect.arrayContaining([
            "tests/cli/studio-client/src/P908ValeraProducer.browser.test.tsx",
            "tests/cli/studio-client/src/components/common/StudioPresentation.test.tsx",
            "scripts/p9-11-candidate.mjs",
            "tests/testUtils/createP911CandidateFixture.mjs",
            "scripts/p8-05-release-handoff.mjs",
            "docs/v2-completion/V2C-34.md",
        ]));
        // Both archive selectors must admit the complete correction since the
        // authenticated candidate, including its already retained recheck receipt.
        const correctionPaths = [
            "tests/cli/studio-client/src/P908ValeraProducer.browser.test.tsx",
            "tests/cli/commands/BuildCommand.test.ts",
            "tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts",
            "tests/cli/studio/StudioJobRoutes.integration.test.ts",
            "tests/cli/studio/StudioServer.test.ts",
            "tests/v2/ExistingMechanicsAuthoring.test.ts",
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
        await expect(fs.access(path.join(fixture.repository, "dist"))).rejects.toThrow("ENOENT");
        await expect(productionStudioCandidate({...environment, POKIE_P911_CANDIDATE_HANDOFF_SHA256: "b".repeat(64)}, fixture.repository)).rejects.toThrow("receipt digest mismatch");
        const driver = await fs.readFile(fixture.handoff.browserDriver.path);
        await fs.writeFile(fixture.handoff.browserDriver.path, "changed external driver");
        await expect(productionStudioCandidate(environment, fixture.repository)).rejects.toThrow("authenticated controller browser driver required");
        await fs.writeFile(fixture.handoff.browserDriver.path, driver);
        const protectedBase = execFileSync("git", ["rev-parse", "HEAD"], {cwd: fixture.repository, encoding: "utf8"}).trim();
        for (const file of ["cli/studio-client/src/changed.ts", "tsconfig.prod.json", "tests/cli/studio-client/src/unnamed.test.tsx"]) {
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

it("saves an edited design, validates and plays it, then builds and reopens its real local package", async () => {
    const repository = process.cwd();
    const overallDeadline = Date.now() + WORKFLOW_TIMEOUT;
    const until = (check: () => Promise<boolean>, label: string, timeout?: number) => waitUntil(check, label, overallDeadline, timeout);
    const remaining = () => Math.max(1, Math.min(30_000, overallDeadline - Date.now()));
    // These exact assets are served by the production CLI. No fallback to mocked or source UI.
    const candidate = await productionStudioCandidate(process.env, repository);
    // Managed projects reject destinations beneath node_modules. Keep their fixture
    // in this worktree, outside the npm wrapper's TMPDIR, and remove it in finally.
    const root = await fs.mkdtemp(path.join(repository, ".p908-producer-"));
    // The standalone CLI snapshots its checkout as the host runtime. Keep its
    // temporary snapshots under the existing excluded node_modules boundary,
    // outside the managed-project fixture it would otherwise copy into itself.
    const cache = await fs.mkdtemp(path.join(repository, "node_modules/.cache/pokie-tmp/p908-runtime-"));
    let studio: ChildProcess | undefined;
    let browser: ChildProcess | undefined;
    let devtools: Devtools | undefined;
    let stdout = "";
    let stderr = "";
    let startupError: Error | undefined;
    try {
        const documents = path.join(root, "documents");
        const workspace = path.join(root, "workspace");
        const profile = path.join(root, "browser-profile");
        for (const directory of [documents, workspace, profile]) await fs.mkdir(directory);
        // The production child gets the same caller context under npm and direct Jest launches.
        const studioEnvironment = {...process.env};
        for (const key of Object.keys(studioEnvironment)) {
            if (key.startsWith("npm_lifecycle_") || key.startsWith("npm_package_") || key === "INIT_CWD") {
                Reflect.deleteProperty(studioEnvironment, key);
            }
        }
        studio = spawn(process.execPath, [candidate.bin, "--no-open", "--port", "0"], {
            cwd: workspace,
            env: {...studioEnvironment, XDG_DOCUMENTS_DIR: documents, XDG_DATA_HOME: path.join(root, "data"), XDG_CONFIG_HOME: path.join(root, "config"), TMPDIR: cache, NPM_CONFIG_CACHE: path.join(root, "npm-cache")},
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
        const click = async (expression: string, timeout?: number) => {
            await until(() => evaluate<boolean>(`Boolean(${expression})`), `available control: ${expression}`, timeout);
            let point: {x: number; y: number} | undefined;
            // Validation and disclosure transitions can move or disable a control
            // after it first appears. Dispatch once, only at a settled, hittable target.
            await until(async () => {
                point = await evaluate<{x: number; y: number} | undefined>(`(async () => {
                    const e = ${expression};
                    if (!e) return;
                    e.scrollIntoView({block:'center', behavior:'instant'});
                    const before = e.getBoundingClientRect();
                    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                    if (${expression} !== e || !e.isConnected || e.disabled || e.getAttribute('aria-busy') === 'true') return;
                    const r = e.getBoundingClientRect();
                    if (r.width <= 0 || r.height <= 0 || ['x', 'y', 'width', 'height'].some(key => Math.abs(before[key] - r[key]) > 0.1)) return;
                    const point = {x:r.x+r.width/2, y:r.y+r.height/2};
                    if (!e.contains(document.elementFromPoint(point.x, point.y))) return;
                    return point;
                })()`);
                return point !== undefined;
            }, `settled pointer target: ${expression}`);
            await bounded(connection.send("Input.dispatchMouseEvent", {type: "mousePressed", ...point, button: "left", clickCount: 1}), "pointer press");
            await bounded(connection.send("Input.dispatchMouseEvent", {type: "mouseReleased", ...point, button: "left", clickCount: 1}), "pointer release");
        };
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
        const packageCursor = connection.events.length;
        await click(button("Open as Project", packageScope));
        try {
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
                    try {
                        await fs.rm(root, {recursive: true, force: true});
                    } finally {
                        await fs.rm(cache, {recursive: true, force: true});
                    }
                }
            }
        }
    }
}, WORKFLOW_TIMEOUT + 30_000);
