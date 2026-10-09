/** @jest-environment node */
import {spawn, type ChildProcess} from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";

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

it("saves an edited design, validates and plays it, then builds and reopens its real local package", async () => {
    const candidate = process.cwd();
    const overallDeadline = Date.now() + 180_000;
    const until = (check: () => Promise<boolean>, label: string) => waitUntil(check, label, overallDeadline);
    const remaining = () => Math.max(1, Math.min(30_000, overallDeadline - Date.now()));
    // These exact assets are served by the production CLI. No fallback to mocked or source UI.
    await fs.access(path.join(candidate, "dist/cli/pokie.js"));
    await fs.access(path.join(candidate, "dist/cli/studio-client/index.html"));
    const temporaryRoot = path.join(candidate, "node_modules/.cache/pokie-tmp");
    await fs.mkdir(temporaryRoot, {recursive: true});
    const root = await fs.mkdtemp(path.join(temporaryRoot, "p908-producer-"));
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
        const cache = path.join(root, "runtime-cache");
        for (const directory of [documents, workspace, profile, cache]) await fs.mkdir(directory);
        studio = spawn(process.execPath, [path.join(candidate, "dist/cli/pokie.js"), "--no-open", "--port", "0"], {
            cwd: workspace,
            env: {...process.env, XDG_DOCUMENTS_DIR: documents, XDG_DATA_HOME: path.join(root, "data"), XDG_CONFIG_HOME: path.join(root, "config"), TMPDIR: cache, NPM_CONFIG_CACHE: path.join(root, "npm-cache")},
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
        const transportUrl = pathToFileURL(path.join(candidate, "scripts/p8-05-valera-browser-audit.mjs")).href;
        const transport = await import(transportUrl) as {connectP805Devtools: (url: string, initialUrl: string) => Promise<Devtools>};
        devtools = await bounded(transport.connectP805Devtools(`http://127.0.0.1:${port}`, `${origin}/#/`), "DevTools startup", remaining());
        const connection = devtools;
        await bounded(connection.send("Emulation.setDeviceMetricsOverride", {width: 1280, height: 900, deviceScaleFactor: 1, mobile: false}), "producer viewport", remaining());
        const send = (method: string, params: Record<string, unknown>) => bounded(connection.send(method, params), method, remaining());
        const evaluate = async <T, >(expression: string): Promise<T> => {
            const response = await bounded(connection.send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true}), "rendered operation", remaining());
            if (response.exceptionDetails !== undefined) throw new Error(JSON.stringify(response.exceptionDetails));
            return (response.result as {value: T}).value;
        };
        const button = (label: string, scope = "document") => `Array.from(${scope}.querySelectorAll('button')).find(e => e.textContent.trim() === ${JSON.stringify(label)} && e.getClientRects().length && !e.disabled)`;
        const click = async (expression: string) => {
            await until(() => evaluate<boolean>(`Boolean(${expression})`), `available control: ${expression}`);
            const point = await evaluate<{x: number; y: number}>(`(() => {const e = ${expression}; e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
            await bounded(connection.send("Input.dispatchMouseEvent", {type: "mousePressed", ...point, button: "left", clickCount: 1}), "pointer press");
            await bounded(connection.send("Input.dispatchMouseEvent", {type: "mouseReleased", ...point, button: "left", clickCount: 1}), "pointer release");
        };
        const playRound = async (projectRoot: string) => {
            await click(button("Open Play"));
            await click(button("New Play session"));
            const cursor = connection.events.length;
            await click(button("Spin"));
            let played: {status: string; session: {studioRound: number; studioProjectRoot: string; screen: unknown[][]}} | undefined;
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
            }, "real settled spin response");
            expect(played?.status).toBe("ok");
            expect(played?.session.studioRound).toBe(1);
            expect(played?.session.studioProjectRoot).toBe(projectRoot);
            expect(played?.session.screen.length).toBeGreaterThan(0);
            await until(() => evaluate<boolean>("document.body.innerText.includes('Credits')"), "rendered settled round");
        };
        await until(() => evaluate<boolean>("document.body.innerText.includes('POKIE is a slot-game logic framework')"), "public Home explanation");
        await click("Array.from(document.querySelectorAll('[role=tab]')).find(e => e.textContent.startsWith('Paytable') && e.getClientRects().length)");
        const payoutSelector = await evaluate<string>("Array.from(document.querySelectorAll('input[aria-label]')).find(e => /x\\d+ payout$/.test(e.getAttribute('aria-label')) && e.getClientRects().length).getAttribute('aria-label')");
        await evaluate(`document.querySelector('input[aria-label=' + ${JSON.stringify(JSON.stringify(payoutSelector))} + ']').focus()`);
        await send("Input.dispatchKeyEvent", {type: "keyDown", key: "a", code: "KeyA", modifiers: 2});
        await send("Input.dispatchKeyEvent", {type: "keyUp", key: "a", code: "KeyA", modifiers: 2});
        await send("Input.insertText", {text: "7"});
        await send("Input.dispatchKeyEvent", {type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9});
        await send("Input.dispatchKeyEvent", {type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9});
        await click(button("Create game"));
        await until(() => evaluate<boolean>("location.hash.endsWith('/overview') && document.body.innerText.includes('Valid — no issues found.')"), "saved project validation");
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
        const packageScope = "Array.from(document.querySelectorAll('div')).find(e => e.style.marginBottom && Array.from(e.querySelectorAll('p')).some(p => p.textContent === 'TypeScript Game Package'))";
        await click(button("Build", packageScope));
        await click(button("Open as Project", packageScope));
        await until(() => evaluate<boolean>("location.hash.endsWith('/overview') && document.body.innerText.includes('Game Model is read-only for this package') && document.body.innerText.includes('Valid — no issues found.')"), "built package validation and truthful editability");
        const packagePath = await evaluate<string>("decodeURIComponent(location.hash.split('/')[2])");
        expect(packagePath).not.toBe(designPath);
        expect(packagePath.startsWith(root + path.sep)).toBe(true);
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
                    await fs.rm(root, {recursive: true, force: true});
                }
            }
        }
    }
}, 240_000);
