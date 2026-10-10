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

type RenderedStyles = {
    stylesheetsLoaded: boolean;
    mainMinWidth: string | null;
    pageMinWidth: string | null;
    actionDisplay: string | null;
    actionInnerDisplay: string | null;
    actionBorderRadius: string | null;
    primaryColorFilled: string;
};

function assertRenderedStyles(styles: RenderedStyles): void {
    // An inline-block Button computes to block when it is a flex/grid item (Home's
    // QuickActions and project action groups). Standalone buttons retain inline-block.
    // Compare named measurements together so terminal failures identify every bad clause.
    expect(styles).toEqual({
        stylesheetsLoaded: true,
        mainMinWidth: '0px',
        pageMinWidth: '0px',
        actionDisplay: expect.stringMatching(/^(?:inline-)?block$/),
        actionInnerDisplay: 'flex',
        actionBorderRadius: expect.stringMatching(/[1-9]/),
        primaryColorFilled: expect.stringMatching(/\S/),
    });
}

it("accepts computed blockification while keeping every rendered style clause diagnostic and required", () => {
    const styled: RenderedStyles = {
        stylesheetsLoaded: true,
        mainMinWidth: '0px',
        pageMinWidth: '0px',
        actionDisplay: 'block',
        actionInnerDisplay: 'flex',
        actionBorderRadius: '8px',
        primaryColorFilled: 'var(--mantine-color-indigo-filled)',
    };
    assertRenderedStyles(styled);
    assertRenderedStyles({...styled, actionDisplay: 'inline-block'});
    const invalid: RenderedStyles = {
        stylesheetsLoaded: false,
        mainMinWidth: 'auto',
        pageMinWidth: 'auto',
        actionDisplay: 'inline',
        actionInnerDisplay: 'block',
        actionBorderRadius: '0px',
        primaryColorFilled: '',
    };
    for (const clause of Object.keys(invalid) as Array<keyof RenderedStyles>) {
        expect(() => assertRenderedStyles({...styled, [clause]: invalid[clause]})).toThrow(clause);
    }
    for (const clause of ['mainMinWidth', 'pageMinWidth', 'actionDisplay', 'actionInnerDisplay', 'actionBorderRadius'] as const) {
        expect(() => assertRenderedStyles({...styled, [clause]: null})).toThrow(clause);
    }
});

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

// Source-aware scripted safeguards; these never constitute cold visual observations.
async function newestInput(directory: string): Promise<number> {
    const times = await Promise.all((await fs.readdir(directory, {withFileTypes: true})).map(async (entry) => {
        const filename = path.join(directory, entry.name);
        return entry.isDirectory() ? newestInput(filename) : (await fs.stat(filename)).mtimeMs;
    }));
    return Math.max(0, ...times);
}

async function assertFreshAssets(candidate: string): Promise<void> {
    const inputs = [
        await newestInput(path.join(candidate, 'cli/studio-client/src')),
        ...await Promise.all(['cli/studio-client/vite.config.ts', 'cli/studio-client/postcss.config.mjs', 'cli/studio-client/index.html', 'cli/studio-client/tsconfig.json',
            'package.json', 'package-lock.json', 'node_modules/@mantine/core/styles.css', 'node_modules/@mantine/notifications/styles.css']
            .map(async (name) => (await fs.stat(path.join(candidate, name))).mtimeMs)),
    ];
    const index = path.join(candidate, 'dist/cli/studio-client/index.html');
    expect((await fs.stat(index)).mtimeMs).toBeGreaterThanOrEqual(Math.max(...inputs));
    const html = await fs.readFile(index, 'utf8');
    const references = [...html.matchAll(/(?:src|href)="([^"?]+\.(?:js|css))"/g)].map((match) => match[1]);
    expect(references.some((reference) => reference.endsWith('.css'))).toBe(true);
    expect(references.some((reference) => reference.endsWith('.js'))).toBe(true);
    for (const reference of references) {
        expect((await fs.stat(path.join(candidate, 'dist/cli/studio-client', reference.replace(/^\//, '')))).mtimeMs).toBeGreaterThanOrEqual(Math.max(...inputs));
    }
    expect((await fs.stat(path.join(candidate, 'dist/cli/pokie.js'))).mtimeMs).toBeGreaterThanOrEqual(await newestInput(path.join(candidate, 'cli/studio')));
}

it("asset provenance rejects CSS-only, theme and build-input changes and missing styles", async () => {
    const root = await fs.mkdtemp(path.join(process.cwd(), '.p910-provenance-'));
    try {
        const files = [
            'cli/studio-client/src/global.css', 'cli/studio-client/src/theme.ts', 'cli/studio/runtime.ts',
            'cli/studio-client/vite.config.ts', 'cli/studio-client/postcss.config.mjs', 'cli/studio-client/index.html', 'cli/studio-client/tsconfig.json',
            'package.json', 'package-lock.json', 'node_modules/@mantine/core/styles.css', 'node_modules/@mantine/notifications/styles.css',
            'dist/cli/pokie.js', 'dist/cli/studio-client/index.html', 'dist/cli/studio-client/assets/current.js', 'dist/cli/studio-client/assets/current.css',
        ];
        const baseline = new Date('2026-01-01T00:00:00Z');
        const built = new Date('2026-01-02T00:00:00Z');
        const changed = new Date('2026-01-03T00:00:00Z');
        for (const file of files) {
            const filename = path.join(root, file);
            await fs.mkdir(path.dirname(filename), {recursive: true});
            await fs.writeFile(filename, file.endsWith('studio-client/index.html')
                ? '<script src="/assets/current.js"></script><link href="/assets/current.css" rel="stylesheet">' : 'fixture');
            await fs.utimes(filename, baseline, file.startsWith('dist/') ? built : baseline);
        }
        await assertFreshAssets(root);
        for (const input of ['cli/studio-client/src/global.css', 'cli/studio-client/src/theme.ts', 'cli/studio-client/vite.config.ts', 'node_modules/@mantine/core/styles.css']) {
            await fs.utimes(path.join(root, input), changed, changed);
            await expect(assertFreshAssets(root)).rejects.toThrow();
            await fs.utimes(path.join(root, input), baseline, baseline);
        }
        await fs.rm(path.join(root, 'dist/cli/studio-client/assets/current.css'));
        await expect(assertFreshAssets(root)).rejects.toThrow();
    } finally {
        await fs.rm(root, {recursive: true, force: true});
    }
});

it("loads the shared Studio test setup without supplying a simulated browser DOM", () => {
    expect(typeof Element).toBe("undefined");
    expect(typeof window).toBe("undefined");
});

// Pre-review changed tests run before the controller's cold collection. Only the rendered
// retest depends on that collection; never invent a record or start it before the freeze.
function renderedTestFor(frozen: string | undefined): typeof it {
    return frozen === undefined ? it.skip : it;
}

async function assertFrozenObservations(frozen: string | undefined): Promise<void> {
    if (frozen === undefined) throw new Error("Controller must freeze independent P9-10 observations first and provide P910_FROZEN_OBSERVATIONS.");
    if ((await fs.readFile(frozen, "utf8")).trim().length === 0) throw new Error("P910_FROZEN_OBSERVATIONS must point to a nonempty frozen record.");
}

it("defers only the rendered retest until the controller supplies a frozen record", () => {
    expect(renderedTestFor(undefined)).toBe(it.skip);
    // Invalid opt-ins must execute and fail validation, rather than silently skip.
    for (const frozen of ["", " ", "/missing-frozen-record", "frozen-record.md"]) {
        expect(renderedTestFor(frozen)).toBe(it);
    }
});

it("rejects missing, unreadable and empty frozen records before browser startup", async () => {
    const root = await fs.mkdtemp(path.join(process.cwd(), ".p910-freeze-contract-"));
    try {
        await expect(assertFrozenObservations(undefined)).rejects.toThrow("Controller must freeze independent P9-10 observations first");
        await expect(assertFrozenObservations(path.join(root, "missing.md"))).rejects.toThrow();
        const record = path.join(root, "fixture.md");
        for (const contents of ["", " \n\t"]) {
            await fs.writeFile(record, contents);
            await expect(assertFrozenObservations(record)).rejects.toThrow("nonempty frozen record");
        }
        // This filesystem fixture tests the prerequisite only; it is never used as visual evidence.
        await fs.writeFile(record, "Fixture record for validation only.");
        await expect(assertFrozenObservations(record)).resolves.toBeUndefined();
    } finally {
        await fs.rm(root, {recursive: true, force: true});
    }
});

renderedTestFor(process.env.P910_FROZEN_OBSERVATIONS)("measures styled Home including the 900px finding, Build/Export and real running/terminal cards", async () => {
    await assertFrozenObservations(process.env.P910_FROZEN_OBSERVATIONS);
    const candidate = process.cwd();
    const overallDeadline = Date.now() + 180_000;
    const until = (check: () => Promise<boolean>, label: string) => waitUntil(check, label, overallDeadline);
    const remaining = () => Math.max(1, Math.min(30_000, overallDeadline - Date.now()));
    // These exact assets are served by the production CLI. No fallback to mocked or source UI.
    await fs.access(path.join(candidate, "dist/cli/pokie.js"));
    await fs.access(path.join(candidate, "dist/cli/studio-client/index.html"));
    await assertFreshAssets(candidate);
    // Managed projects reject destinations beneath node_modules. Keep all owned fixture state
    // in this worktree, outside the npm wrapper's TMPDIR, and remove it in finally.
    const root = await fs.mkdtemp(path.join(candidate, ".p910-graphic-"));
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
        browser = spawn(process.env.P910_CHROMIUM_BINARY ?? "chromium-browser", [
            "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--no-first-run",
            `--user-data-dir=${profile}`, "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", "about:blank",
        ], {stdio: "ignore"});
        browser.on("error", (error) => {
            startupError = error;
        });
        const portFile = path.join(profile, "DevToolsActivePort");
        await until(() => {
            if (startupError !== undefined) throw startupError;
            if (browser !== undefined && (browser.exitCode !== null || browser.signalCode !== null)) throw new Error("Chromium exited before DevTools startup");
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
        const measure = async (label: string, scope = "document.querySelector('.studio-page')") => {
            const result = await evaluate<{overflow: boolean; count: number; failures: string[]}>(`(() => {
                const root = (${scope});
                if (!root) throw new Error('Missing measured surface');
                const elements = Array.from(root.querySelectorAll('input,button,select,textarea,label,[data-job-detail],.mantine-Fieldset-legend'))
                    .filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
                const failures = elements.filter(e => {
                    const r = e.getBoundingClientRect();
                    if (r.width <= 0 || r.left < -1 || r.right > innerWidth + 1) return true;
                    if (e.matches('button,label,[data-job-detail],.mantine-Fieldset-legend')) {
                        const range = document.createRange();
                        range.selectNodeContents(e);
                        const content = range.getBoundingClientRect();
                        if (content.left < r.left - 1 || content.right > r.right + 1 || content.bottom > r.bottom + 1) return true;
                    }
                    // Detect clipping by any local ancestor as well as document overflow.
                    for (let p = e.parentElement; p; p = p.parentElement) {
                        const s = getComputedStyle(p), pr = p.getBoundingClientRect();
                        if (['hidden','clip'].includes(s.overflowX) && (r.left < pr.left - 1 || r.right > pr.right + 1)) return true;
                        if (['hidden','clip'].includes(s.overflowY) && (r.top < pr.top - 1 || r.bottom > pr.bottom + 1)) return true;
                    }
                    return false;
                }).map(e => e.outerHTML.slice(0,250));
                return {overflow: document.documentElement.scrollWidth > innerWidth + 1, count: elements.length, failures};
            })()`);
            expect({label, overflow: result.overflow, failures: result.failures}).toEqual({label, overflow: false, failures: []});
            expect(result.count).toBeGreaterThan(0);
        };
        const styles = async () => {
            assertRenderedStyles(await evaluate<RenderedStyles>(`(() => {
                const main = document.querySelector('.studio-app-main');
                const page = document.querySelector('.studio-page');
                const action = Array.from(document.querySelectorAll('.mantine-Button-root')).find(e=>e.getClientRects().length);
                const inner = action?.querySelector('.mantine-Button-inner');
                return {
                    stylesheetsLoaded: document.styleSheets.length > 0,
                    mainMinWidth: main ? getComputedStyle(main).minWidth : null,
                    pageMinWidth: page ? getComputedStyle(page).minWidth : null,
                    actionDisplay: action ? getComputedStyle(action).display : null,
                    actionInnerDisplay: inner ? getComputedStyle(inner).display : null,
                    actionBorderRadius: action ? getComputedStyle(action).borderRadius : null,
                    primaryColorFilled: getComputedStyle(document.documentElement).getPropertyValue('--mantine-primary-color-filled').trim(),
                };
            })()`));
        };
        const viewport = async (width: number, height: number) => {
            await send("Emulation.setDeviceMetricsOverride", {width, height, deviceScaleFactor: 1, mobile: false});
            small = width < 768;
            await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
        };
        await until(() => evaluate<boolean>("document.body.innerText.includes('POKIE is a slot-game logic framework')"), "public Home");
        // Verify served bytes, not just the presence of a hashed filename in local dist.
        const html = await fs.readFile(path.join(candidate, "dist/cli/studio-client/index.html"), "utf8");
        const references = [...html.matchAll(/(?:src|href)="([^"?]+\.(?:js|css))"/g)].map((match) => match[1]);
        expect(references.some((reference) => reference.endsWith('.css'))).toBe(true);
        expect(references.some((reference) => reference.endsWith('.js'))).toBe(true);
        for (const reference of references) {
            const response = await fetch(new URL(reference, origin), {signal: AbortSignal.timeout(5_000)});
            expect(response.ok).toBe(true);
            const local = path.join(candidate, 'dist/cli/studio-client', reference.replace(/^\//, ''));
            expect(Buffer.from(await response.arrayBuffer())).toEqual(await fs.readFile(local));
        }
        // Include the frozen finding's exact desktop width: the 260px rail is still present.
        // This additional affected Home check creates no screenshots or full-gallery collection.
        for (const [width, height] of [[1100, 800], [900, 700], [390, 844]]) {
            await viewport(width, height);
            await styles();
            await measure(`Home ${width}x${height}`);
            const sections = await evaluate<{labels: string[]; wrap: string; contained: boolean; rows: number}>(`(() => {
                const list = document.querySelector('[role="tablist"][aria-label="Game design sections"]');
                if (!list) throw new Error('Missing game design sections');
                const bounds = list.getBoundingClientRect();
                const tabs = Array.from(list.querySelectorAll('[role="tab"]'));
                return {
                    labels: tabs.map(tab => tab.querySelector('.mantine-Tabs-tabLabel').textContent),
                    wrap: getComputedStyle(list).flexWrap,
                    contained: tabs.every(tab => {
                        const r = tab.getBoundingClientRect();
                        return r.width > 0 && r.left >= bounds.left - 1 && r.right <= bounds.right + 1
                            && r.top >= bounds.top - 1 && r.bottom <= bounds.bottom + 1;
                    }),
                    rows: new Set(tabs.map(tab => Math.round(tab.getBoundingClientRect().top))).size,
                };
            })()`);
            expect(sections.labels).toEqual(['Game basics', 'Layout', 'Symbols', 'Reels', 'Paytable', 'Bets']);
            expect(sections.wrap).toBe('wrap');
            expect(sections.contained).toBe(true);
            if (width === 900 || small) expect(sections.rows).toBeGreaterThan(1);
            if (width === 900) {
                const list = "document.querySelector('[role=tablist][aria-label=\"Game design sections\"]')";
                // StatusBadge contributes validation text to the tab's accessible name; match
                // its visible label within the section tablist instead of whole-button text.
                const tab = (label: string) => `Array.from((${list})?.querySelectorAll('[role="tab"]') ?? []).find(e => e.querySelector('.mantine-Tabs-tabLabel')?.textContent.trim() === ${JSON.stringify(label)} && e.getClientRects().length && !e.disabled)`;
                await focus(tab("Game basics"));
                for (let index = 0; index < 5; index++) await key("ArrowRight", "ArrowRight", 39);
                expect(await evaluate<boolean>(`document.activeElement === (${tab("Bets")})
                    && document.activeElement.getAttribute('aria-selected') === 'true'`)).toBe(true);
                await measure('Home Bets 900x700');
                await key("ArrowRight", "ArrowRight", 39);
                expect(await evaluate<boolean>(`document.activeElement === (${tab("Game basics")})
                    && document.activeElement.getAttribute('aria-selected') === 'true'`)).toBe(true);
            }
            await focus(button("Create game"));
            if (small) {
                await activate("document.getElementById('studio-navigation-toggle')");
                await key("Escape", "Escape", 27);
                expect(await evaluate<boolean>("document.activeElement?.id === 'studio-navigation-toggle' && document.getElementById('studio-navigation-panel').inert")).toBe(true);
            }
        }
        await viewport(1100, 800);
        await activate(button("Create game"));
        await until(() => evaluate<boolean>("location.hash.endsWith('/overview') && document.body.innerText.includes('Valid — no issues found.')"), "real saved starter project");
        const projectRoot = await evaluate<string>("decodeURIComponent(location.hash.split('/')[2])");
        expect(projectRoot.startsWith(documents + path.sep)).toBe(true);
        await fs.access(projectRoot);
        const occupied = path.join(workspace, 'occupied-' + 'long-destination-'.repeat(6));
        await fs.mkdir(occupied);
        await fs.writeFile(path.join(occupied, 'sentinel.txt'), 'preserve');
        for (const [width, height] of [[1100, 800], [390, 844]]) {
            await viewport(width, height);
            await navigate("Build/Export");
            const scope = "document.getElementById('artifact-build-tsPackage')?.closest('[data-pokie-lifecycle-form=artifact-build]')";
            await fill(inputFor("Output directory", scope), occupied);
            await until(() => evaluate<boolean>(`Boolean((${scope})?.innerText.includes('Choose a different destination'))`), "occupied destination validation");
            expect(await evaluate<boolean>(`(${inputFor("Output directory", scope)}).getAttribute('aria-invalid') === 'true'`)).toBe(true);
            expect(await evaluate<boolean>(`Array.from((${scope}).querySelectorAll('button')).find(e=>e.textContent.trim()==='Build').disabled`)).toBe(true);
            await measure(`Build conflict ${width}x${height}`, scope);
            await focus(button("Browse…", scope));
            await fill(inputFor("Output directory", scope), path.join(workspace, `new-package-${width}`));
            await until(() => evaluate<boolean>(`(${scope})?.innerText.includes('Ready to build') === true`), "ready destination");
            await focus(button("Build", scope));
            await measure(`Build ready ${width}x${height}`, scope);
            expect(await fs.readFile(path.join(occupied, 'sentinel.txt'), 'utf8')).toBe('preserve');
            await navigate("Simulation");
            // Returning after a completed run restores Review. Enter Configure through its
            // stable public control, whose whole text also includes a number and description.
            await activate("document.getElementById('simulation-configure')");
            await fill(inputFor("Rounds"), "500000");
            await activate(button("Run Simulation"));
            let id = "";
            await until(async () => {
                id = await evaluate<string>("document.querySelector('[data-pokie-lifecycle-result-job]')?.getAttribute('data-pokie-lifecycle-result-job') ?? ''");
                return id !== "" && (await job(id)).status === "running";
            }, "real running simulation");
            const region = `Array.from(document.querySelectorAll('[role=region]')).find(e=>e.getAttribute('aria-label') === ${JSON.stringify('simulation job ')} + ${JSON.stringify(id)})`;
            await until(() => evaluate<boolean>(`Boolean((${region})?.querySelector('.studio-job-card')) && (${region}).innerText.includes('Running')`), "common running card");
            await measure(`Running job ${width}x${height}`, region);
            await focus(button("Cancel", region));
            expect((await job(id)).status).toBe('running');
            // Let this bounded real operation finish. No artificial delays or fabricated states.
            await until(async () => (await job(id)).status === 'completed', 'real terminal simulation');
            await until(() => evaluate<boolean>(`Boolean((${region})?.querySelector('[data-pokie-lifecycle-terminal=completed]'))`), 'common terminal card');
            await measure(`Terminal job ${width}x${height}`, region);
            const download = `Array.from((${region}).querySelectorAll('a')).find(e=>e.textContent.includes('Download'))`;
            await focus(download);
            const output = await evaluate<string>(`(${download}).href`);
            const report = await fetch(output, {signal: AbortSignal.timeout(5_000)});
            expect(report.ok).toBe(true);
            expect((await report.arrayBuffer()).byteLength).toBeGreaterThan(0);
            await geometry();
            await styles();
        }
    } catch (error) {
        const rendered = devtools === undefined ? undefined : await bounded(devtools.send("Runtime.evaluate", {
            expression: "JSON.stringify({url:location.href,active:{tag:document.activeElement?.tagName,id:document.activeElement?.id,text:document.activeElement?.textContent.slice(0,200)},rect:document.activeElement?.getBoundingClientRect().toJSON(),width:innerWidth,height:innerHeight,text:document.body.innerText.slice(0,8000)})",
            returnByValue: true,
        }), "failure diagnostics", 2_000).catch(() => undefined);
        console.error("P9-10 browser regression failure", {rendered, stdout, stderr});
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
