import fs from "node:fs";
import path from "node:path";
import {execFileSync, spawn, type ChildProcess} from "node:child_process";
import {webcrypto} from "node:crypto";
import {extensionRound} from "../../site/examples/extension.js";
import {ReportCommand} from "../../cli/commands/ReportCommand.js";
import {PublicDocsBrowser} from "./helpers/PublicDocsBrowser.js";
import {galleryModels, galleryPolicy} from "../../site/playground/models.js";
import {PlaygroundController, PLAYGROUND_LIMITS, validatePlaygroundDraft, type PlaygroundDraft} from "../../site/playground/controller.js";
import {
    createBlueprintWasmArtifact,
    instantiatePokieWasm,
    SeededPokieWasmHost,
    collectPokieWasmSimulation,
    type PokieWasmWorkerPort,
} from "../../src/wasm/browser.js";
import {PokieWasmWorkerProtocol} from "../../src/wasm/worker.js";
import {browserModelHash, optimizeBrowserBlueprint} from "../../src/optimization/BrowserBlueprintOptimization.js";
import {validateSimulationReportExtensions} from "../../src/reporting/validateSimulationReportExtensions.js";

Reflect.defineProperty(globalThis, "crypto", {value: webcrypto, configurable: true});
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const root = process.cwd();
const scratch = fs.mkdtempSync(path.join(root, "node_modules/.cache/pokie-tmp/gallery-"));
const output = path.join(scratch, "built");
const draft = (): PlaygroundDraft => ({
    blueprint: clone(galleryModels[0].blueprint),
    settings: {seed: "gallery-29", bet: 0.05, rounds: 128},
});
const yieldToHost = () =>
    new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
    });

/** Protocol-backed transport for deterministic lifecycle faults; rendered tests below use real Workers. */
class TestPort implements PokieWasmWorkerPort {
    public terminated = false;
    public onProgress?: () => void;
    public beforeResponse?: (type: string) => void;
    public readonly listeners = new Map<string, Set<(event: MessageEvent & ErrorEvent) => void>>();
    private progressTimer?: ReturnType<typeof setInterval>;
    private readonly protocol = new PokieWasmWorkerProtocol(() => this.onProgress?.());
    private readonly behavior: string;
    public constructor(behavior = "normal") {
        this.behavior = behavior;
    }
    public addEventListener(type: string, listener: (event: MessageEvent & ErrorEvent) => void): void {
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type)!.add(listener);
    }
    public removeEventListener(type: string, listener: (event: MessageEvent & ErrorEvent) => void): void {
        this.listeners.get(type)?.delete(listener);
    }
    public terminate(): void {
        if (this.progressTimer) clearInterval(this.progressTimer);
        this.terminated = true;
        this.protocol.handle({id: "dispose", type: "dispose"});
    }
    public postMessage(value: unknown): void {
        const data = value as {scope: unknown; request: {id: string; type: string}};
        if (this.behavior === "progress" && data.request.type === "simulate") {
            let completed = 0;
            this.progressTimer = setInterval(
                () =>
                    this.deliver("message", {
                        data: {scope: data.scope, id: data.request.id, type: "progress", progress: {completed: ++completed, total: 8192}},
                    }),
                5,
            );
            return;
        }
        if (this.behavior === "silent" || (this.behavior === "initializing" && data.request.type === "instantiate")) return;
        if (this.behavior === "error" || this.behavior === "messageerror") {
            this.deliver(this.behavior, {message: "load failed"});
            return;
        }
        this.protocol.handle(data.request).then((response) => {
            this.beforeResponse?.(data.request.type);
            this.deliver("message", {data: this.behavior === "malformed" ? {} : {...response, scope: data.scope, type: "response"}});
        });
    }
    public deliver(type: string, event: object): void {
        this.listeners.get(type)?.forEach((listener) => listener(event as MessageEvent & ErrorEvent));
    }
}

it("executes known answers, seeded replay, tiny/fractional/zero fidelity and byte-bound artifacts", async () => {
    for (const bet of [0.05, 7.5, 1e-7]) {
        const observed = extensionRound("gallery-29", bet);
        expect(observed).toEqual(extensionRound("gallery-29", bet));
        expect(observed.generatedScreens).toBeGreaterThan(1);
    }
    for (const bet of [0.05, 7.5, 1e-7]) for (const symbol of ["A", "B", "Z"]) {
        const b = draft().blueprint;
        b.reelStrips = [[symbol], [symbol]];
        const artifact = await createBlueprintWasmArtifact(b);
        const runtime = await instantiatePokieWasm(artifact.bytes, artifact.manifest, new SeededPokieWasmHost("same"));
        try {
            const session = runtime.createSession("same", {credits: 1000});
            const state = session.serialize();
            const command = {kind: "spin", bet};
            const result = await session.play(command);
            expect(result.payout).toBe(symbol === "A" ? bet * 4 : 0);
            expect((await runtime.replay(state, [command])).rounds).toEqual([result]);
            expect(b.paytable.B[2]).toBe(0);
            expect(b.paytable.Z).toBeUndefined();
            const tampered = artifact.bytes.slice();
            tampered[tampered.length - 1] ^= 1;
            await expect(instantiatePokieWasm(tampered, artifact.manifest, new SeededPokieWasmHost("same"))).rejects.toThrow();
        } finally {
            runtime.dispose();
        }
    }
});

it("owns cancellation during initialization/execution, deadline, Worker faults, replacement and successful reuse", async () => {
    for (const behavior of ["silent", "progress", "initializing", "error", "messageerror", "malformed"]) {
        const ports: TestPort[] = [];
        const statuses: string[] = [];
        const controller = new PlaygroundController(
            () => {
                const port = new TestPort(behavior);
                ports.push(port);
                return port;
            },
            (event) => statuses.push(event.status),
            {...PLAYGROUND_LIMITS, idleMs: 100, deadlineMs: 40},
        );
        const pending = controller.run(draft(), "sim");
        const rejection = expect(pending).rejects.toThrow(behavior === "silent" || behavior === "progress" ? /Deadline/ : undefined);
        if (behavior === "initializing") {
            await yieldToHost();
            controller.cancel();
        }
        await rejection;
        expect(ports.every((p) => p.terminated)).toBe(true);
        expect(controller.diagnostics()).toEqual({workers: 0, timers: 0, pending: 0});
        expect(statuses).toContain(behavior === "initializing" ? "cancelled" : "failed");
        ports.forEach((p) => expect([...p.listeners.values()].every((set) => set.size === 0)).toBe(true));
        controller.dispose();
    }
    const ports: TestPort[] = [];
    let workerProgress!: () => void;
    const created = new Promise<void>((resolve) => {
        workerProgress = resolve;
    });
    const controller = new PlaygroundController(
        () => {
            const p = new TestPort();
            ports.push(p);
            p.onProgress = workerProgress;
            return p;
        },
        () => undefined,
    );
    const long = draft();
    long.settings.rounds = 8192;
    const pending = controller.run(long, "sim");
    const rejection = expect(pending).rejects.toThrow();
    await created;
    await yieldToHost();
    controller.cancel();
    await rejection;
    const successful = await controller.run(draft(), "play");
    expect(successful.action).toBe("play");
    ports[0]?.deliver("message", {data: {ok: true, result: "late"}});
    expect(controller.diagnostics()).toEqual({workers: 0, timers: 0, pending: 0});
    controller.dispose();
});

it("rejects numeric/mode/work input before Worker creation and recovers construction failure", async () => {
    let constructions = 0;
    const controller = new PlaygroundController(
        () => {
            constructions++;
            if (constructions === 1) throw new Error("Worker construction unavailable");
            return new TestPort();
        },
        () => undefined,
    );
    for (const settings of [
        {...draft().settings, bet: NaN},
        {...draft().settings, mode: "missing"},
        {...draft().settings, rounds: 8193},
    ]) {
        await expect(controller.run({...draft(), settings}, "sim")).rejects.toThrow();
    }
    expect(constructions).toBe(0);
    await expect(controller.run(draft(), "inspect")).rejects.toThrow(/construction/);
    await expect(controller.run(draft(), "play")).resolves.toHaveProperty("action", "play");
    expect(controller.diagnostics()).toEqual({workers: 0, timers: 0, pending: 0});
    controller.dispose();
});

it("bounds generated/evaluated preparation before default-line allocation or compilation and retains projection reuse", async () => {
    const projection = (): PlaygroundDraft => ({...draft(), blueprint: clone(galleryModels.find((m) => m.id === "projection")!.blueprint)});
    const inputs = [
        {...projection().blueprint, screenGeometry: {...projection().blueprint.screenGeometry!, generated: {reels: 2, rows: 1000000001}, evaluated: {rowOffset: 0, rows: 1000000000}}, paylines: undefined},
        {...projection().blueprint, screenGeometry: {...projection().blueprint.screenGeometry!, generated: {reels: 2, rows: 1000000001}}},
        {...projection().blueprint, screenGeometry: {...projection().blueprint.screenGeometry!, generated: {reels: 1000000000, rows: 3}}},
        {...draft().blueprint, rows: 1000000000, paylines: undefined},
        {...draft().blueprint, paylines: Array.from({length: 100}, () => [0, 0])},
        {...draft().blueprint, rows: 8, symbols: Array.from({length: 100}, (_, i) => `S${i}`)},
    ];
    let constructions = 0;
    const controller = new PlaygroundController(() => {
        constructions++;
        return new TestPort();
    }, () => undefined);
    const digest = jest.spyOn(globalThis.crypto.subtle, "digest");
    try {
        for (const blueprint of inputs) {
            const input = {...draft(), blueprint};
            // Admission is tested first: never execute a dangerous compile if this guard regresses.
            expect(() => validatePlaygroundDraft(input)).toThrow(/preparation limit/);
            await expect(controller.run(input, "play")).rejects.toThrow(/preparation limit/);
            expect(constructions).toBe(0);
            expect(digest).not.toHaveBeenCalled();
            expect(controller.diagnostics()).toEqual({workers: 0, timers: 0, pending: 0});
        }
        const valid = projection();
        valid.blueprint.paylines = undefined;
        valid.blueprint.reelStrips = [["A"], ["A"]];
        const run = await controller.run(valid, "play");
        expect(run.result).toMatchObject({payout: 0.2});
        expect(constructions).toBe(1);
        expect(controller.diagnostics()).toEqual({workers: 0, timers: 0, pending: 0});
    } finally {
        digest.mockRestore();
        controller.dispose();
    }
});

it("generates real held-out candidates, canonical diff and same-type explicit apply with stale/policy/budget rejection", async () => {
    const b = draft();
    const result = await optimizeBrowserBlueprint(b.blueprint, galleryPolicy, {yieldToHost});
    expect(result.candidate).toBeDefined();
    expect(result.type).toBe("blueprint");
    expect(result.searchSamples).toBe(768);
    expect(result.assessmentSamples).toBe(2048);
    expect(result.assessment?.authority).toBe("sampled-bounded");
    expect(result.confidenceLevel).toBe(0.95);
    expect(result.assessment?.seed).not.toBe((result.evaluations[0] as {seed: string}).seed);
    expect(result.definitionDiff?.comparisonKind).toBe("math-definition");
    expect(result.candidateRevision).toBe(await browserModelHash(result.candidate));
    const controller = new PlaygroundController(
        () => new TestPort(),
        () => undefined,
    );
    const preview = await controller.run(b, "optimize", galleryPolicy);
    const candidate = (preview.result as typeof result).candidate!;
    expect((await controller.applyCandidate(b, galleryPolicy, candidate)).manifest).toEqual(b.blueprint.manifest);
    await expect(controller.applyCandidate(b, galleryPolicy, candidate)).rejects.toThrow(/Stale/);
    await controller.run(b, "optimize", galleryPolicy);
    await expect(controller.applyCandidate({...b, settings: {...b.settings, seed: "changed"}}, galleryPolicy, candidate)).rejects.toThrow(
        /Stale/,
    );
    const exhausted = clone(galleryPolicy);
    exhausted.policy.budget = 1;
    expect((await optimizeBrowserBlueprint(b.blueprint, exhausted, {yieldToHost})).status).toBe("exhausted");
    await expect(optimizeBrowserBlueprint(b.blueprint, {}, {yieldToHost})).rejects.toThrow();
    await expect(optimizeBrowserBlueprint({...b.blueprint, winModel: {type: "ways"}}, galleryPolicy, {yieldToHost})).rejects.toThrow(
        /unsupported/,
    );
    await controller.run(b, "optimize", galleryPolicy);
    const edited = clone(candidate);
    edited.paytable.A[2] += 1;
    await expect(controller.applyCandidate(b, galleryPolicy, edited)).rejects.toThrow(/Stale/);
    const changedPolicy = clone(galleryPolicy);
    changedPolicy.policy.seed = "changed-policy";
    await expect(controller.applyCandidate(b, changedPolicy, candidate)).rejects.toThrow(/Stale/);
    await expect(
        optimizeBrowserBlueprint({...b.blueprint, manifest: {id: "", name: "Invalid", version: "1"}}, galleryPolicy, {yieldToHost}),
    ).rejects.toThrow();
    const excluded = clone(galleryPolicy) as unknown as {policy: Record<string, unknown>};
    excluded.policy.constraints = {sums: [{paths: ["/paytable/A/2", "/paytable/B/2"], value: 3}]};
    expect((await optimizeBrowserBlueprint(b.blueprint, excluded, {yieldToHost})).status).toBe("infeasible");
    const abort = new AbortController();
    abort.abort();
    await expect(optimizeBrowserBlueprint(b.blueprint, galleryPolicy, {yieldToHost, signal: abort.signal})).rejects.toThrow(/cancelled/);
    controller.dispose();
});

it("rejects input replacement during asynchronous candidate identity verification", async () => {
    let armed = false;
    const statuses: string[] = [];
    const controller = new PlaygroundController(
        () => {
            const port = new TestPort();
            port.beforeResponse = (type) => {
                if (type === "optimize") armed = true;
            };
            return port;
        },
        (event) => statuses.push(event.status),
    );
    const digest = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);
    const observer = jest.spyOn(globalThis.crypto.subtle, "digest").mockImplementation((algorithm, data) =>
        digest(algorithm, data).then((bytes) => {
            if (armed) {
                armed = false;
                controller.invalidate("Interrupted/reset: replaced during candidate verification.");
            }
            return bytes;
        }),
    );
    try {
        await expect(controller.run(draft(), "optimize", galleryPolicy)).rejects.toThrow(/Interrupted|stale/);
        expect(statuses).not.toContain("completed");
        expect(controller.diagnostics()).toEqual({workers: 0, timers: 0, pending: 0});
    } finally {
        observer.mockRestore();
        controller.dispose();
    }
});

let browser: PublicDocsBrowser | undefined,
    preview: ChildProcess | undefined,
    origin = "";
async function stop(): Promise<void> {
    await browser?.close();
    if (preview && preview.exitCode === null && preview.signalCode === null) {
        const owned = preview;
        await new Promise<void>((resolve) => {
            const timer = setTimeout(() => owned.kill("SIGKILL"), 3000);
            owned.once("exit", () => {
                clearTimeout(timer);
                resolve();
            });
            owned.kill("SIGTERM");
        });
    }
    fs.rmSync(scratch, {recursive: true, force: true});
}
afterAll(stop);

describe("locally built public gallery rendered actions", () => {
    beforeAll(async () => {
        execFileSync(process.execPath, ["site/build.mjs", "--out", output], {cwd: root, timeout: 150000, stdio: "pipe"});
        preview = spawn(process.execPath, ["site/preview.mjs", "--dir", output, "--port", "0"], {
            cwd: root,
            stdio: ["ignore", "pipe", "pipe"],
        });
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("preview startup timed out")), 10000);
            preview!.once("error", reject);
            preview!.stderr!.on("data", (chunk) => {
                clearTimeout(timer);
                reject(new Error(String(chunk)));
            });
            preview!.stdout!.on("data", (chunk) => {
                const match = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/);
                if (match) {
                    origin = match[0];
                    clearTimeout(timer);
                    resolve();
                }
            });
        });
        browser = new PublicDocsBrowser(path.join(scratch, "profile"), true);
        await browser.start();
        await browser.send("Page.addScriptToEvaluateOnNewDocument", {
            source: `window.ownedWorkers = new Set(); const NativeWorker = window.Worker; window.Worker = class extends NativeWorker { constructor(...args) { super(...args); window.ownedWorkers.add(this); } terminate() { window.ownedWorkers.delete(this); super.terminate(); } }; window.downloads = {}; const nativeURL = URL.createObjectURL; URL.createObjectURL = blob => { window.lastBlob = blob; return nativeURL(blob); }; document.addEventListener('click', event => { if (event.target.download) { event.preventDefault(); window.downloads[event.target.download] = window.lastBlob; } }, true);`,
        });
    }, 180000);
    const ev = <T>(s: string) => browser!.evaluate<T>(s);
    async function set(id: string, value: string): Promise<void> {
        await ev(
            `(() => { const e = document.querySelector('#pg-${id}'); e.value = ${JSON.stringify(
                value,
            )}; e.dispatchEvent(new Event('input')); })()`,
        );
    }
    async function click(action: string): Promise<void> {
        await ev(`document.querySelector('[data-action="${action}"]').click()`);
        await browser!.until("['completed','failed'].includes(document.querySelector('#pg-status').dataset.status)");
        expect(await ev("document.querySelector('#pg-status').textContent")).not.toMatch(/failed|invalid|unsupported/i);
    }
    async function example(id: string): Promise<void> {
        await browser!.navigate(`${origin}/playground/?example=${id}`);
        await browser!.until("!!document.querySelector('#pg-example')");
    }
    async function download(name: string): Promise<unknown> {
        await ev(
            `Array.from(document.querySelectorAll('#pg-download-buttons button')).find(b => b.textContent === 'Download ${name}').click()`,
        );
        return ev(`window.downloads[${JSON.stringify(name)}].text().then(JSON.parse)`);
    }

    it("discovers gallery deep links and runs every model in real Workers with no nonlocal runtime", async () => {
        await browser!.navigate(`${origin}/gallery/`);
        await browser!.until("document.querySelectorAll('#gallery a').length === 7");
        expect(await ev("document.querySelector('#gallery a').getAttribute('href')")).toBe("/playground/?example=lines");
        for (const item of galleryModels) {
            await example(item.id);
            await click("inspect");
            await click("validate");
            await click("play");
            const first = await ev("JSON.parse(document.querySelector('#pg-output').textContent)");
            await ev("document.querySelector('#pg-replay-play').click()");
            await browser!.until("document.querySelector('#pg-status').dataset.status === 'completed'");
            expect(await ev("JSON.parse(document.querySelector('#pg-output').textContent).rounds[0]")).toEqual(first);
            await set("rounds", "128");
            await click("sim");
            const reports = (await download("reports.json")) as {schemaVersion: number; seed: string}[];
            expect(reports[0].schemaVersion).toBe(1);
            expect(reports[0].seed).toBe("gallery-29");
            expect(() => validateSimulationReportExtensions(reports[0])).not.toThrow();
            if (item.id === "weighted") expect(JSON.stringify(reports)).toContain("reelSequences");
            if (item.id === "free-games") expect(JSON.stringify(reports)).toContain("analytics");
            const bundle = (await download("run.json")) as {
                wasm: number[];
                manifest: Parameters<typeof instantiatePokieWasm>[1];
                blueprint: unknown;
                settings: {artifact: {sha256: string}};
                reports: unknown[];
            };
            expect(bundle.blueprint).toEqual(item.blueprint);
            expect(bundle.settings.artifact.sha256).toBe(bundle.manifest.artifact!.sha256);
            const runtime = await instantiatePokieWasm(new Uint8Array(bundle.wasm), bundle.manifest, new SeededPokieWasmHost("gallery-29"));
            try {
                const [sample] = await collectPokieWasmSimulation(runtime, "gallery-29", 128, {bet: 0.05});
                expect((bundle.reports[0] as {totalWin: number}).totalWin).toBe(sample.statistics.totalPayout);
            } finally {
                runtime.dispose();
            }
            if (item.id === "lines") {
                const reproduction = path.join(scratch, "reproduction");
                fs.mkdirSync(reproduction);
                fs.writeFileSync(path.join(reproduction, "model.blueprint.json"), JSON.stringify(bundle.blueprint));
                fs.writeFileSync(path.join(reproduction, "model.wasm"), new Uint8Array(bundle.wasm));
                fs.writeFileSync(path.join(reproduction, "model.wasm.pokie-wasm.json"), JSON.stringify(bundle.manifest));
                fs.writeFileSync(path.join(reproduction, "settings.json"), JSON.stringify(bundle.settings));
                const runReproduction = () =>
                    execFileSync(
                        process.execPath,
                        [
                            "--no-warnings",
                            "--loader",
                            path.join(root, "site/source-loader.mjs"),
                            path.join(root, "site/examples/reproduce.mjs"),
                        ],
                        {cwd: reproduction, encoding: "utf8", timeout: 10000, stdio: "pipe"},
                    );
                const canonicalReport = await download("report.json");
                const reportFile = path.join(reproduction, "report.json");
                fs.writeFileSync(reportFile, JSON.stringify(canonicalReport));
                const markdownFile = path.join(reproduction, "report.md");
                await new ReportCommand().run([reportFile, "--format", "markdown", "--out", markdownFile]);
                expect(fs.readFileSync(markdownFile, "utf8")).toContain("gallery-lines");
                const rerun = JSON.parse(runReproduction());
                expect(rerun.simulation[0].statistics.totalPayout).toBe((bundle.reports[0] as {totalWin: number}).totalWin);
                fs.writeFileSync(path.join(reproduction, "settings.json"), JSON.stringify({...bundle.settings, runtimeVersion: "bad"}));
                expect(runReproduction).toThrow();
                fs.writeFileSync(path.join(reproduction, "settings.json"), JSON.stringify(bundle.settings));
                fs.writeFileSync(
                    path.join(reproduction, "model.blueprint.json"),
                    JSON.stringify({...(bundle.blueprint as object), manifest: {id: "tampered", name: "Tampered", version: "1"}}),
                );
                expect(runReproduction).toThrow();
            }
            if (item.id === "free-games") {
                expect((bundle.blueprint as ReturnType<typeof draft>["blueprint"]).mechanics?.freeGames?.awardsByCount[1]).toBe(0);
                await set("mode", "all");
                await click("sim");
                expect(((await download("reports.json")) as {betMode: string}[]).map((r) => r.betMode)).toEqual(["base", "ante"]);
                expect(Object.keys(((await download("report.json")) as {modes: object}).modes)).toEqual(["base", "ante"]);
                await set("mode", "");
            }
            await click("report");
            await click("replay");
            expect(await ev("window.ownedWorkers.size")).toBe(0);
        }
        const requests = await ev<string[]>("performance.getEntriesByType('resource').map(e => e.name)");
        expect(requests.every((url) => url.startsWith(origin))).toBe(true);
        const targets = await browser!.send<{targetInfos: {type: string}[]}>("Target.getTargets", {}, false);
        expect(targets.targetInfos.some((t) => t.type === "worker")).toBe(false);
        expect((await fetch(`${origin}/assets/playground/models/lines.wasm`)).headers.get("content-type")).toBe("application/wasm");
    }, 120000);

    it("renders known payouts, projection highlights, optimization evidence, explicit apply and revision downloads", async () => {
        await example("lines");
        for (const bet of ["0.05", "7.5", "1e-7"]) {
            const b = draft().blueprint;
            b.reelStrips = [["A"], ["A"]];
            await set("model", JSON.stringify(b));
            await set("bet", bet);
            await click("play");
            expect(await ev("JSON.parse(document.querySelector('#pg-output').textContent).payout")).toBe(Number(bet) * 4);
            expect(((await download("model.blueprint.json")) as typeof b).paytable.B[2]).toBe(0);
        }
        await example("projection");
        const b = clone(galleryModels.find((m) => m.id === "projection")!.blueprint);
        b.reelStrips = [["A"], ["A"]];
        await set("model", JSON.stringify(b));
        await click("play");
        expect(await ev("document.querySelectorAll('#pg-screen .pg-win').length")).toBe(2);
        await example("optimize");
        await set("seed", "changed-seed");
        expect(await ev("JSON.parse(document.querySelector('#pg-policy').value).policy.seed")).toBe("changed-seed");
        await set("seed", "gallery-29");
        await click("optimize");
        const evidence = (await download("optimization.json")) as {
            candidate: unknown;
            confidenceLevel: number;
            assessment: unknown;
            definitionDiff: {comparisonKind: string};
        };
        expect(evidence.confidenceLevel).toBe(0.95);
        expect(evidence.assessment).toBeDefined();
        expect(evidence.definitionDiff.comparisonKind).toBe("math-definition");
        const applyPosition = await ev<{x: number; y: number}>(
            "(() => { const button = document.querySelector('#pg-apply'); button.scrollIntoView({block: 'center'}); const r = button.getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2}; })()",
        );
        await browser!.send("Input.dispatchMouseEvent", {type: "mousePressed", ...applyPosition, button: "left", clickCount: 1});
        await browser!.send("Input.dispatchMouseEvent", {type: "mouseReleased", ...applyPosition, button: "left", clickCount: 1});
        await browser!.until("document.querySelector('#pg-status').textContent.startsWith('Applied')");
        expect(await ev("document.activeElement.dataset.action")).toBe("inspect");
        expect(
            await ev(
                "(() => { const r = document.activeElement.getBoundingClientRect(); return r.top >= -1 && r.bottom <= innerHeight + 1; })()",
            ),
        ).toBe(true);
        expect(await ev("JSON.parse(document.querySelector('#pg-model').value)")).toEqual(evidence.candidate);
        expect(await ev("document.querySelector('#pg-apply').disabled")).toBe(true);
        await click("inspect");
        expect(await download("model.blueprint.json")).toEqual(evidence.candidate);
        await ev(
            "URL.createObjectURL = () => { throw new Error('download unavailable'); }; document.querySelector('#pg-download-buttons button').click()",
        );
        expect(await ev("document.querySelector('#pg-download-status').textContent")).toContain("Download failed");
    }, 45000);

    it("rejects a small excessive projection draft before creating a real Worker and reuses the valid example", async () => {
        await example("projection");
        const invalid = clone(galleryModels.find((m) => m.id === "projection")!.blueprint);
        invalid.screenGeometry = {...invalid.screenGeometry!, generated: {reels: 2, rows: 1000000001}, evaluated: {rowOffset: 0, rows: 1000000000}};
        invalid.paylines = undefined;
        expect(JSON.stringify(invalid).length).toBeLessThan(1024);
        expect(() => validatePlaygroundDraft({...draft(), blueprint: invalid})).toThrow(/preparation limit/);
        await set("model", JSON.stringify(invalid));
        await ev("document.querySelector('[data-action=play]').click()");
        await browser!.until("document.querySelector('#pg-status').dataset.status === 'failed'");
        expect(await ev("document.querySelector('#pg-status').textContent")).toContain("preparation limit");
        expect(await ev("window.ownedWorkers.size")).toBe(0);
        await ev("document.querySelector('#pg-reset').click()");
        await click("play");
        expect(await ev("window.ownedWorkers.size")).toBe(0);
    }, 10000);

    async function expectCleared(): Promise<void> {
        expect(await ev("document.querySelector('#pg-summary').textContent")).toBe("No current result. Run again with the current inputs.");
        expect(await ev("document.querySelector('#pg-download-status').textContent")).toBe("");
        expect(await ev("document.querySelectorAll('#pg-download-buttons button, #pg-screen .pg-win').length")).toBe(0);
        expect(await ev("document.querySelector('#pg-apply').disabled && document.querySelector('#pg-replay-play').disabled")).toBe(true);
    }

    it("clears rendered payout/RTP/optimization and download conclusions at every invalidation boundary", async () => {
        await example("lines");
        await click("play");
        expect(await ev("document.querySelector('#pg-summary').textContent")).toContain("payout");
        await download("model.blueprint.json");
        expect(await ev("document.querySelector('#pg-download-status').textContent")).toContain("Downloaded");
        await set("seed", "edited");
        await expectCleared();

        await click("report");
        expect(await ev("document.querySelector('#pg-summary').textContent")).toContain("RTP");
        await download("reports.json");
        expect(await ev("(() => { document.querySelector('[data-action=sim]').click(); const cleared = {summary: document.querySelector('#pg-summary').textContent, download: document.querySelector('#pg-download-status').textContent}; document.querySelector('#pg-cancel').click(); return cleared; })()"))
            .toEqual({summary: "No current result. Run again with the current inputs.", download: ""});
        await expectCleared();
        expect(await ev("window.ownedWorkers.size")).toBe(0);

        await example("optimize");
        await click("optimize");
        expect(await ev("document.querySelector('#pg-summary').textContent")).toContain("Optimization");
        await download("optimization.json");
        await ev("document.querySelector('#pg-discard').click()");
        await expectCleared();
        await click("optimize");
        await download("optimization.json");
        await ev("document.querySelector('#pg-apply').click()");
        await browser!.until("document.querySelector('#pg-status').textContent.startsWith('Applied')");
        await expectCleared();

        await click("play");
        await download("model.blueprint.json");
        await ev("(() => { const e = document.querySelector('#pg-example'); e.value = 'projection'; e.dispatchEvent(new Event('change')); })()");
        expect(await ev("document.querySelector('#pg-summary').textContent")).toBe(galleryModels.find((m) => m.id === "projection")!.description);
        expect(await ev("document.querySelector('#pg-download-status').textContent")).toBe("");
        await click("play");
    }, 30000);

    it("recovers invalid input, cancels real work, resets on reload and renders mobile keyboard controls", async () => {
        await example("lines");
        await click("inspect");
        const original = await ev("document.querySelector('#pg-model').value");
        await set("model", "{");
        await ev("document.querySelector('[data-action=play]').click()");
        await browser!.until("document.querySelector('#pg-status').dataset.status === 'failed'");
        await ev("document.querySelector('#pg-restore').click()");
        expect(await ev("document.querySelector('#pg-model').value")).toBe(original);
        const unsupported = draft().blueprint as unknown as Record<string, unknown>;
        unsupported.customMechanic = {};
        await set("model", JSON.stringify(unsupported));
        await ev("document.querySelector('[data-action=play]').click()");
        await browser!.until("document.querySelector('#pg-status').dataset.status === 'failed'");
        await example("optimize");
        await ev("document.querySelector('[data-action=optimize]').click()");
        await browser!.until("window.ownedWorkers.size === 1");
        await ev("document.querySelector('#pg-cancel').click()");
        expect(await ev("document.querySelector('#pg-apply').disabled")).toBe(true);
        await example("lines");
        await set("rounds", "8192");
        await ev("document.querySelector('[data-action=sim]').click()");
        await browser!.until("window.ownedWorkers.size === 1 && document.querySelector('#pg-progress').value > 0");
        await ev("document.querySelector('#pg-cancel').click()");
        expect(await ev("document.querySelector('#pg-status').dataset.status")).toBe("cancelled");
        expect(await ev("window.ownedWorkers.size")).toBe(0);
        await click("inspect");
        await set("rounds", "8192");
        await ev("document.querySelector('[data-action=sim]').click()");
        await browser!.until("window.ownedWorkers.size === 1");
        await example("lines");
        expect(await ev("document.querySelector('#pg-status').dataset.status")).toBe("idle");
        expect(await ev("window.ownedWorkers.size")).toBe(0);
        await browser!.send("Emulation.setDeviceMetricsOverride", {width: 390, height: 844, deviceScaleFactor: 1, mobile: true});
        expect(await ev("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);
        await ev("document.querySelector('[data-action=play]').focus()");
        await browser!.key(" ", "Space", 32);
        await browser!.until("['completed','failed'].includes(document.querySelector('#pg-status').dataset.status)");
        expect(await ev("document.querySelector('#pg-status').textContent")).toContain("completed");
        expect(await ev("getComputedStyle(document.activeElement).outlineStyle")).not.toBe("none");
    }, 30000);
});
