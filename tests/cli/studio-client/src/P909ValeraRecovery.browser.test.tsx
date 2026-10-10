/** @jest-environment node */
import {spawn, type ChildProcess} from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {constants, runInThisContext} from "node:vm";

type Devtools = {
    events: Array<{method: string; params: {requestId?: string; response?: {url: string; status: number}}}>;
    send(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>;
    close(): Promise<void>;
};

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

async function waitUntil(check: () => Promise<boolean>, label: string, overallDeadline: number): Promise<void> {
    const deadline = Math.min(Date.now() + 60_000, overallDeadline);
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

it("retains bounded real work through keyboard reload, reconnect, cancellation, project reopening and destination recovery", async () => {
    const frozen = process.env.P909_FROZEN_OBSERVATIONS;
    if (frozen === undefined) throw new Error("Controller must freeze independent P9-09 observations first and provide P909_FROZEN_OBSERVATIONS.");
    expect((await fs.readFile(frozen, "utf8")).trim().length).toBeGreaterThan(0);
    const candidate = process.cwd();
    const overallDeadline = Date.now() + 180_000;
    const until = (check: () => Promise<boolean>, label: string) => waitUntil(check, label, overallDeadline);
    const remaining = () => Math.max(1, Math.min(30_000, overallDeadline - Date.now()));
    // These exact assets are served by the production CLI. No fallback to mocked or source UI.
    await fs.access(path.join(candidate, "dist/cli/pokie.js"));
    await fs.access(path.join(candidate, "dist/cli/studio-client/index.html"));
    // Reject stale dist rather than silently testing another candidate. The controller builds
    // these assets; this regression never invokes a compiler, packaging or a source UI loader.
    const newestSource = async (directory: string): Promise<number> => {
        const entries = await fs.readdir(directory, {withFileTypes: true});
        const times = await Promise.all(entries.map(async (entry) => {
            const filename = path.join(directory, entry.name);
            if (entry.isDirectory()) return newestSource(filename);
            return (/\.(ts|tsx|mjs)$/).test(entry.name) ? (await fs.stat(filename)).mtimeMs : 0;
        }));
        return Math.max(0, ...times);
    };
    expect((await fs.stat(path.join(candidate, "dist/cli/studio-client/index.html"))).mtimeMs).toBeGreaterThanOrEqual(await newestSource(path.join(candidate, "cli/studio-client/src")));
    expect((await fs.stat(path.join(candidate, "dist/cli/pokie.js"))).mtimeMs).toBeGreaterThanOrEqual(await newestSource(path.join(candidate, "cli/studio")));
    const assets = path.join(candidate, "dist/cli/studio-client/assets");
    const bundle = (await Promise.all((await fs.readdir(assets)).filter((name) => name.endsWith(".js")).map((name) => fs.readFile(path.join(assets, name), "utf8")))).join("\n");
    expect(bundle).toContain("Reattach to retained work");
    // Managed projects reject destinations beneath node_modules. Keep all owned fixture state
    // in this worktree, outside the npm wrapper's TMPDIR, and remove it in finally.
    const root = await fs.mkdtemp(path.join(candidate, ".p909-recovery-"));
    let studio: ChildProcess | undefined;
    let browser: ChildProcess | undefined;
    let devtools: Devtools | undefined;
    let stdout = "";
    let stderr = "";
    let startupError: Error | undefined;
    let origin = "";
    try {
        const documents = path.join(root, "documents");
        const workspace = path.join(root, "workspace");
        const profile = path.join(root, "browser-profile");
        const cache = path.join(root, "runtime-cache");
        for (const directory of [documents, workspace, profile, cache]) await fs.mkdir(directory);
        // The production child gets the same caller context under npm and direct Jest launches.
        const studioEnvironment = {...process.env};
        for (const key of Object.keys(studioEnvironment)) {
            if (key.startsWith("npm_lifecycle_") || key.startsWith("npm_package_") || key === "INIT_CWD") {
                Reflect.deleteProperty(studioEnvironment, key);
            }
        }
        studio = spawn(process.execPath, [path.join(candidate, "dist/cli/pokie.js"), "--no-open", "--port", "0"], {
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
        await until(() => {
            if (startupError !== undefined) throw startupError;
            if (studio !== undefined && (studio.exitCode !== null || studio.signalCode !== null)) throw new Error(`Studio exited: ${stderr}`);
            origin = stdout.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0] ?? "";
            return Promise.resolve(origin !== "");
        }, "production Studio startup");
        browser = spawn(process.env.P909_CHROMIUM_BINARY ?? "chromium-browser", [
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
        const transportUrl = pathToFileURL(path.join(candidate, "scripts/p8-05-valera-browser-audit.mjs")).href;
        // ts-jest compiles this component lane to CommonJS. Preserve a native ESM import for
        // the .mjs transport instead of letting it become Jest's require(fileURL).
        const transport = await runInThisContext(`import(${JSON.stringify(transportUrl)})`, {
            importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
        }) as {connectP805Devtools: (url: string, initialUrl: string) => Promise<Devtools>};
        devtools = await bounded(transport.connectP805Devtools(`http://127.0.0.1:${port}`, `${origin}/#/`), "DevTools startup", remaining());
        const connection = devtools;
        await bounded(connection.send("Emulation.setDeviceMetricsOverride", {width: 1100, height: 800, deviceScaleFactor: 1, mobile: false}), "compact viewport", remaining());
        const send = (method: string, params: Record<string, unknown>) => bounded(connection.send(method, params), method, remaining());
        const evaluate = async <T, >(expression: string): Promise<T> => {
            const response = await bounded(connection.send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true}), "rendered operation", remaining());
            if (response.exceptionDetails !== undefined) throw new Error(JSON.stringify(response.exceptionDetails));
            return (response.result as {value: T}).value;
        };
        const button = (label: string, scope = "document") => `Array.from((${scope})?.querySelectorAll('button') ?? []).find(e => e.textContent.trim() === ${JSON.stringify(label)} && e.getClientRects().length && !e.disabled)`;
        const key = async (name: string, code: string, virtualKey: number, modifiers = 0) => {
            // Chromium needs Enter's character as well as its key code to perform native button
            // activation. A keyDown without text delivers a key event but never submits it.
            await send("Input.dispatchKeyEvent", {type: "keyDown", key: name, code, windowsVirtualKeyCode: virtualKey, modifiers, ...(name === "Enter" ? {text: "\r", unmodifiedText: "\r"} : {})});
            await send("Input.dispatchKeyEvent", {type: "keyUp", key: name, code, windowsVirtualKeyCode: virtualKey, modifiers});
        };
        const shiftModifier = 8; // DevTools modifier bits use 8 for Shift; 1 is Alt.
        // Reach every operation through native Tab/Enter activation. DOM inspection only locates
        // the target and reads its observable state; it never clicks or focuses the target for us.
        const focus = async (expression: string) => {
            await until(() => evaluate<boolean>(`Boolean(${expression})`), `keyboard target: ${expression}`);
            for (let tabs = 0; tabs < 100; tabs++) {
                // Modal initialization can move focus after Tab, and responsive layout can move
                // a focused control after Chromium's scroll. Observe both after rendering, then
                // continue native navigation instead of waiting for lost focus to return itself.
                const state = await evaluate<string>(`new Promise(resolve => {
                    if (document.activeElement !== (${expression})) {resolve('seek'); return;}
                    requestAnimationFrame(() => requestAnimationFrame(() => {
                        const e = (${expression});
                        if (!e || document.activeElement !== e) {resolve('seek'); return;}
                        const r = e.getBoundingClientRect();
                        resolve(r.left >= 0 && r.right <= innerWidth+1 && r.top >= 0 && r.bottom <= innerHeight+1 ? 'ready' : 'clipped');
                    }));
                })`);
                if (state === "ready") {
                    expect(await evaluate<boolean>("document.activeElement.matches(':focus-visible')")).toBe(true);
                    return;
                }
                await key("Tab", "Tab", 9);
                // Re-enter a clipped target through the native tab order so the browser scrolls
                // it into the settled layout. Never focus or scroll a control through DOM APIs.
                if (state === "clipped") await key("Tab", "Tab", 9, shiftModifier);
            }
            throw new Error(`Keyboard cannot reach focused control inside viewport: ${expression}`);
        };
        const activate = async (expression: string) => {
            await focus(expression);
            await key("Enter", "Enter", 13);
        };
        const inputFor = (label: string, scope = "document") => `(() => {const l=Array.from((${scope})?.querySelectorAll('label') ?? []).find(e=>e.textContent.startsWith(${JSON.stringify(label)})); return l ? document.getElementById(l.htmlFor) : undefined;})()`;
        const fill = async (expression: string, value: string) => {
            await focus(expression);
            await key("a", "KeyA", 65, 2);
            await send("Input.insertText", {text: value});
            await key("Tab", "Tab", 9);
        };
        let small = false;
        const navigate = async (label: string) => {
            if (small) {
                await activate("document.getElementById('studio-navigation-toggle')");
                expect(await evaluate<boolean>("document.getElementById('studio-navigation-toggle').getAttribute('aria-expanded') === 'true'")).toBe(true);
            }
            await activate(button(label, "document.getElementById('studio-navigation-panel')"));
            if (small) {
                await until(() => evaluate<boolean>("document.getElementById('studio-navigation-toggle').getAttribute('aria-expanded') === 'false' && document.getElementById('studio-navigation-panel').inert"), "hidden navigation removed from keyboard order");
            }
        };
        const geometry = async () => {
            expect(await evaluate<boolean>("document.documentElement.scrollWidth <= innerWidth + 1")).toBe(true);
            expect(await evaluate<boolean>("document.activeElement !== document.body && document.activeElement.isConnected")).toBe(true);
        };
        const job = async (id: string) => {
            const response = await fetch(`${origin}/api/project/jobs/${encodeURIComponent(id)}`, {signal: AbortSignal.timeout(5_000)});
            expect(response.ok).toBe(true);
            return await response.json() as {id: string; status: string; progress?: {current: number}; result?: {outputs?: Array<{downloadPath?: string}>}};
        };
        await until(() => evaluate<boolean>("document.body.innerText.includes('POKIE is a slot-game logic framework')"), "public Home");
        await activate(button("Create game"));
        await until(() => evaluate<boolean>("location.hash.endsWith('/overview') && document.body.innerText.includes('Valid — no issues found.')"), "managed small project");
        const originalProject = await evaluate<string>("decodeURIComponent(location.hash.split('/')[2])");
        await fs.access(originalProject);
        await navigate("Simulation");
        // A sub-million real run leaves a few seconds for the native keyboard recovery actions,
        // while remaining bounded. The smaller completed-report run below still uses 20 rounds.
        await fill(inputFor("Rounds"), "500000");
        await activate(button("Run Simulation"));
        let capturedJob = "";
        await until(async () => {
            capturedJob = await evaluate<string>("document.querySelector('[data-pokie-lifecycle-result-job]')?.getAttribute('data-pokie-lifecycle-result-job') ?? ''");
            return capturedJob !== "";
        }, "accepted durable simulation identity");
        const beforeReload = await job(capturedJob);
        expect(["queued", "running"]).toContain(beforeReload.status);
        // Real execution must expose actual progress before reload. No delayed fake completion,
        // synthetic progress or enlarged million-round workload is used to hold this window open.
        await until(async () => {
            const progress = (await job(capturedJob)).progress?.current;
            return typeof progress === "number" && progress > 0;
        }, "actual simulation progress");
        const runRequestsBefore = connection.events.filter((event) => event.method === "Network.responseReceived" && event.params.response?.url.endsWith("/api/project/simulations")).length;
        await send("Page.reload", {ignoreCache: true});
        await until(() => evaluate<boolean>(`document.querySelector('[data-pokie-lifecycle-result-job]')?.getAttribute('data-pokie-lifecycle-result-job') === ${JSON.stringify(capturedJob)}`), "same durable identity after reload");
        await send("Network.emulateNetworkConditions", {offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1});
        await until(() => evaluate<boolean>("document.body.innerText.includes('reconnecting automatically')"), "visible transport recovery");
        expect(await evaluate<boolean>(`document.body.innerText.includes(${JSON.stringify(capturedJob)}) || document.querySelector('[data-pokie-lifecycle-result-job]')?.getAttribute('data-pokie-lifecycle-result-job') === ${JSON.stringify(capturedJob)}`)).toBe(true);
        await send("Network.emulateNetworkConditions", {offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1});
        await until(() => evaluate<boolean>("!document.body.innerText.includes('reconnecting automatically')"), "automatic reattachment");
        expect(connection.events.filter((event) => event.method === "Network.responseReceived" && event.params.response?.url.endsWith("/api/project/simulations"))).toHaveLength(runRequestsBefore);
        const observed = await job(capturedJob);
        if (["queued", "running"].includes(observed.status)) {
            // Declining a project transition must leave the same work active.
            await activate(button("Close project"));
            await until(() => evaluate<boolean>("Boolean(document.querySelector('[role=dialog]'))"), "project transition confirmation");
            expect(await evaluate<boolean>("document.querySelector('[role=dialog]').innerText.includes('simulation')")).toBe(true);
            await activate(button("Cancel", "document.querySelector('[role=dialog]')"));
            await until(() => evaluate<boolean>("!document.querySelector('[role=dialog]')"), "declined transition");
            expect(await evaluate<boolean>("document.activeElement?.textContent.trim() === 'Close project'")).toBe(true);
            await activate("document.getElementById('simulation-cancel')");
            await activate(button("Cancel", "document.querySelector('[role=dialog]')"));
            await until(() => evaluate<boolean>("document.activeElement?.id === 'simulation-cancel'"), "declined cancellation focus");
            await activate("document.getElementById('simulation-cancel')");
            await activate(button("Confirm", "document.querySelector('[role=dialog]')"));
        }
        const jobDeadline = Date.now() + 30_000;
        await until(async () => {
            if (Date.now() > jobDeadline) throw new Error(`Bounded job deadline: ${capturedJob}`);
            return ["completed", "cancelled"].includes((await job(capturedJob)).status);
        }, "truthful bounded terminal and cleanup");
        const terminal = await job(capturedJob);
        // Retained job history can settle before the local workflow finishes cancellation cleanup.
        // Verify this simulation's own terminal projection before continuing its keyboard path.
        await until(() => evaluate<boolean>(`Array.from(document.querySelectorAll('[data-pokie-lifecycle-result="simulation"]')).some(e=>e.getAttribute('data-pokie-lifecycle-result-job') === ${JSON.stringify(capturedJob)} && e.getAttribute('data-pokie-lifecycle-terminal') === ${JSON.stringify(terminal.status)} && e.innerText.toLowerCase().includes(${JSON.stringify(`simulation ${terminal.status}`)}))`), "rendered simulation terminal");
        if (terminal.status === "cancelled") expect(terminal.result?.outputs?.some((output) => output.downloadPath?.includes("reports"))).not.toBe(true);
        // Confirmed cancellation removes its trigger. Reach the next workflow step by native Tab
        // before asserting focus geometry, rather than sampling modal teardown's transient focus.
        await focus("document.getElementById('simulation-configure')");
        await geometry();

        // One small completion proves retained report access even if the observed active run was
        // cancelled. This is a single recovery path, not an operation/state workload matrix.
        await activate("Array.from(document.querySelectorAll('button')).find(e=>e.textContent.includes('Configure') && e.getClientRects().length)");
        await fill(inputFor("Rounds"), "20");
        await activate(button("Run Simulation"));
        let reportJob = "";
        await until(async () => {
            reportJob = await evaluate<string>("document.querySelector('[data-pokie-lifecycle-result-job]')?.getAttribute('data-pokie-lifecycle-result-job') ?? ''");
            return reportJob !== "" && reportJob !== capturedJob && (await job(reportJob)).status === "completed";
        }, "small completed report");
        const reportResponse = await fetch(`${origin}/api/project/reports/${encodeURIComponent(reportJob)}/download?format=json`, {signal: AbortSignal.timeout(5_000)});
        expect(reportResponse.ok).toBe(true);
        expect((await reportResponse.json() as {rounds: number}).rounds).toBe(20);
        await activate(button("Close project"));
        await until(() => evaluate<boolean>("document.body.innerText.includes('Projects') && location.hash.includes('/home/projects')"), "close preserves saved project");
        await fs.access(originalProject);
        await navigate("Start a game");
        await activate(button("Create game"));
        await until(() => evaluate<boolean>("location.hash.endsWith('/overview')"), "second small project");
        const secondProject = await evaluate<string>("decodeURIComponent(location.hash.split('/')[2])");
        expect(secondProject).not.toBe(originalProject);
        expect(await evaluate<boolean>(`!document.body.innerText.includes(${JSON.stringify(reportJob)})`)).toBe(true);
        await activate(button("Close project"));
        await until(() => evaluate<boolean>("location.hash.includes('/home/projects')"), "second project closed");
        await send("Emulation.setDeviceMetricsOverride", {width: 390, height: 844, deviceScaleFactor: 1, mobile: false});
        small = true;
        await activate("document.getElementById('studio-navigation-toggle')");
        await key("Escape", "Escape", 27);
        expect(await evaluate<boolean>("document.activeElement?.id === 'studio-navigation-toggle' && document.getElementById('studio-navigation-panel').inert")).toBe(true);
        await activate(button("Open", `Array.from(document.querySelectorAll('.project-registry-entry')).find(e=>e.innerText.includes(${JSON.stringify(originalProject)}))`));
        await until(() => evaluate<boolean>(`location.hash.endsWith('/overview') && decodeURIComponent(location.hash.split('/')[2]) === ${JSON.stringify(originalProject)}`), "original reopened at smaller viewport");
        await until(() => evaluate<boolean>(`Boolean(Array.from(document.querySelectorAll('a')).find(e=>e.href.includes(${JSON.stringify(reportJob)}) && e.textContent.includes('Download')))`), "retained report download control");
        await focus(`Array.from(document.querySelectorAll('a')).find(e=>e.href.includes(${JSON.stringify(reportJob)}) && e.textContent.includes('Download'))`);
        await geometry();
        await navigate("Simulation");
        await until(() => evaluate<boolean>(`document.body.innerText.includes('20') && document.querySelector('[data-pokie-lifecycle-result-job]')?.getAttribute('data-pokie-lifecycle-result-job') === ${JSON.stringify(reportJob)}`), "restored readable report");
        await geometry();
        await navigate("Build/Export");
        const scope = "document.getElementById('artifact-build-tsPackage')?.closest('[data-pokie-lifecycle-form=artifact-build]')";
        const occupied = path.join(workspace, "occupied");
        await fs.mkdir(occupied);
        const sentinel = Buffer.from([0, 255, 37, 10]);
        await fs.writeFile(path.join(occupied, "sentinel.bin"), sentinel);
        await fill(inputFor("Output directory", scope), occupied);
        await until(() => evaluate<boolean>(`Boolean((${scope})?.innerText.includes('Choose a different destination'))`), "occupied destination explanation");
        expect(await evaluate<boolean>(`(${scope}).querySelector('input').getAttribute('aria-invalid') === 'true'`)).toBe(true);
        expect(await evaluate<boolean>(`Array.from((${scope}).querySelectorAll('button')).find(e=>e.textContent.trim()==='Build').disabled`)).toBe(true);
        expect(await fs.readFile(path.join(occupied, "sentinel.bin"))).toEqual(sentinel);
        const alternate = path.join(workspace, "alternate-package");
        await fill(inputFor("Output directory", scope), alternate);
        await until(() => evaluate<boolean>(`(${scope})?.innerText.includes('Ready to build') === true`), "new destination ready");
        expect(await evaluate<boolean>(`(${scope}).querySelector('input').getAttribute('aria-invalid') !== 'true'`)).toBe(true);
        await activate(button("Build", scope));
        await until(() => evaluate<boolean>(`Boolean(${button("Open as Project", scope)})`), "real alternate package publication");
        await fs.access(path.join(alternate, "dist/index.js"));
        expect(await fs.readdir(occupied)).toEqual(["sentinel.bin"]);
        expect(await fs.readFile(path.join(occupied, "sentinel.bin"))).toEqual(sentinel);
        // Loading disables Build, which can release native focus. Prove the published result's
        // follow-up is reachable through Tab at the smaller viewport as well as compact desktop.
        await focus(button("Open as Project", scope));
        await geometry();
        // The keyboard publish control must also remain usable at the compact viewport.
        await send("Emulation.setDeviceMetricsOverride", {width: 1100, height: 800, deviceScaleFactor: 1, mobile: false});
        small = false;
        // A resize retains focus without scrolling it to the new layout. Re-enter the native
        // tab order so Chromium brings this control into view at the compact viewport too.
        await key("Tab", "Tab", 9);
        await key("Tab", "Tab", 9, shiftModifier);
        await focus(button("Open as Project", scope));
        await geometry();
    } catch (error) {
        const rendered = devtools === undefined ? undefined : await bounded(devtools.send("Runtime.evaluate", {
            expression: "JSON.stringify({url:location.href,active:{tag:document.activeElement?.tagName,id:document.activeElement?.id,text:document.activeElement?.textContent.slice(0,200)},rect:document.activeElement?.getBoundingClientRect().toJSON(),width:innerWidth,height:innerHeight,text:document.body.innerText.slice(0,8000)})",
            returnByValue: true,
        }), "failure diagnostics", 2_000).catch(() => undefined);
        console.error("P9-09 browser failure", {rendered, stdout, stderr});
        throw error;
    } finally {
        try {
            if (origin !== "" && studio?.exitCode === null) {
                const response = await fetch(`${origin}/api/project/jobs`, {signal: AbortSignal.timeout(3_000)}).catch(() => undefined);
                const records = response?.ok ? await response.json() as {jobs: Array<{id: string; status: string}>} : {jobs: []};
                for (const record of records.jobs.filter((entry) => ["queued", "running", "cancelling"].includes(entry.status))) {
                    await fetch(`${origin}/api/project/jobs/${encodeURIComponent(record.id)}/cancel`, {method: "POST", headers: {Origin: origin}, signal: AbortSignal.timeout(3_000)});
                    await waitUntil(async () => {
                        const polled = await fetch(`${origin}/api/project/jobs/${encodeURIComponent(record.id)}`, {signal: AbortSignal.timeout(3_000)}).then((result) => result.json()) as {status: string};
                        return !["queued", "running", "cancelling"].includes(polled.status);
                    }, `owned job cleanup ${record.id}`, Date.now() + 10_000);
                }
            }
        } finally {
            try {
                if (devtools !== undefined) {
                    await bounded(devtools.send("Browser.close"), "browser shutdown", 2_000).catch(() => undefined);
                    await bounded(devtools.close(), "DevTools cleanup", 2_000);
                }
            } finally {
                try {
                    await stop(browser);
                } finally {
                    try {
                        // Cooperative Studio shutdown drains all owned executors, including the
                        // previous project's cancellation cleanup after a confirmed transition.
                        await stop(studio);
                    } finally {
                        await fs.rm(root, {recursive: true, force: true});
                    }
                }
            }
        }
    }
}, 240_000);
