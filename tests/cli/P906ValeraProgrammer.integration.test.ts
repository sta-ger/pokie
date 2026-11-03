import {spawn, spawnSync} from "child_process";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import type {SimulationReport} from "@fromstan/pokie";
import {compileP906Candidate, prepareP906Candidate} from "../testUtils/prepareP906Candidate.js";

const repositoryRoot = path.resolve(__dirname, "../..");
const seed = "p906-valera";
const rounds = 6;

// Each supervised Studio child owns a short-lived listener. Do not retain an
// idle pooled socket across its runtime snapshots or reuse it for the next child.
function fetchStudio(url: string | URL, options: RequestInit = {}): Promise<Response> {
    const headers = new Headers(options.headers);
    headers.set("Connection", "close");
    return fetch(url, {...options, headers});
}

describe("P9-06 bounded public developer scenario", () => {
    beforeAll(() => compileP906Candidate(repositoryRoot), 250_000);

    it("starts real Home/projects, converts and reads back, compares seeded WASM sim/replay, and recovers with truthful statuses", async () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-p906-"));
        const observations: unknown[] = [];
        try {
            const candidate = prepareP906Candidate(repositoryRoot, directory);
            for (const format of ["esm", "cjs", "src"]) {
                expect(fs.readFileSync(path.join(candidate.packageRoot, "dist", format, "simulation", "parallel", "internal", "resolveDefaultWorkerEntryUrl.mjs"))).toEqual(
                    fs.readFileSync(path.join(repositoryRoot, "src", "simulation", "parallel", "internal", "resolveDefaultWorkerEntryUrl.mjs")),
                );
            }
            observations.push({candidate: candidate.identity, isolation: "fresh workspace; owned child HOME/XDG_CONFIG_HOME/XDG_CACHE_HOME/TMPDIR; no user state removed"});
            const blueprint = path.join(candidate.workspace, "Tiny Game.json");
            const workbook = path.join(candidate.workspace, "Tiny Game.xlsx");
            const imported = path.join(candidate.workspace, "Imported Game.json");
            const wasm = path.join(candidate.workspace, "Tiny Game.wasm");
            const run = (args: string[], status = 0, cwd = candidate.workspace) => {
                const started = Date.now();
                const result = spawnSync(process.execPath, [candidate.launcher, ...args], {
                    cwd, env: candidate.env, encoding: "utf8", timeout: 15_000, killSignal: "SIGKILL",
                });
                observations.push({command: ["pokie", ...args], cwd, stdout: result.stdout, stderr: result.stderr, exit: result.status, signal: result.signal, elapsedMs: Date.now() - started});
                if (result.error !== undefined) throw result.error;
                expect(result.signal).toBeNull();
                expect(result.status).toBe(status);
                if (status === 0 || status === 2) expect(result.stderr).toBe("");
                else {
                    expect(result.stderr.trim()).not.toBe("");
                    expect(result.stdout).toBe("");
                }
                return result;
            };
            // Seed 906 exceeds the bounded declared-model outcome analysis.
            // Structural validity is preserved through conversion, but it must
            // not turn that inconclusive analysis into a successful proof.
            const validate = (file: string, kind: "blueprint" | "wasm") => {
                const result = JSON.parse(run(["validate", file, "--format", "json"], 2).stdout);
                expect(result).toMatchObject({
                    project: {path: file, kind}, valid: true, errors: [],
                    advanced: {
                        scope: "declared-model", status: "budget-exhausted", verdict: "inconclusive", structuralValid: true,
                        executableFidelity: kind === "blueprint" ? "declarative-runtime-contract" : "unverified",
                        checks: expect.arrayContaining([
                            expect.objectContaining({id: "analysis.completion", status: "unknown", message: "Analysis outcomes limit exhausted."}),
                        ]),
                    },
                });
                if (kind === "wasm") expect(result.wasm).toMatchObject({compatibility: "compatible"});
            };
            const request = async (url: string, route: string, body?: unknown) => {
                const response = await fetchStudio(`${url}${route}`, {
                    ...(body === undefined ? {} : {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)}),
                    signal: AbortSignal.timeout(30_000),
                });
                const text = await response.text();
                observations.push({request: route, body, status: response.status, response: text});
                expect(response.status).toBe(200);
                return JSON.parse(text) as Record<string, unknown>;
            };
            const studio = async (args: string[], cwd: string, exercise: (url: string) => Promise<void>) => {
                const started = Date.now();
                const child = spawn(process.execPath, [candidate.launcher, ...args], {cwd, env: candidate.env, stdio: ["ignore", "pipe", "pipe"]});
                let stdout = "";
                let stderr = "";
                child.stdout.on("data", (chunk: Buffer) => {
                    stdout += chunk.toString();
                });
                child.stderr.on("data", (chunk: Buffer) => {
                    stderr += chunk.toString();
                });
                const closed = new Promise<{code: number | null; signal: NodeJS.Signals | null}>((resolve, reject) => {
                    child.once("error", reject);
                    child.once("close", (code, signal) => resolve({code, signal}));
                });
                let expired = false;
                // This is a supervised test child, never detached/unrefed. An expired session
                // is killed and awaited, then fails; it cannot silently rebuild or retry.
                const deadline = setTimeout(() => {
                    expired = true;
                    child.kill("SIGKILL");
                }, 60_000);
                try {
                    const url = await new Promise<string>((resolve, reject) => {
                        child.stdout.on("data", () => {
                            const match = stdout.match(/POKIE Studio listening on (http:\/\/[^\s]+)/);
                            if (match !== null) resolve(match[1]);
                        });
                        closed.then(() => reject(new Error(`Studio exited before startup: ${stderr}`)), reject);
                    });
                    const response = await fetchStudio(url, {signal: AbortSignal.timeout(5000)});
                    expect(response.status).toBe(200);
                    const html = await response.text();
                    expect(html).toContain('<div id="root">');
                    const asset = html.match(/src="([^"]+\.js)"/);
                    expect(asset).not.toBeNull();
                    const script = await fetchStudio(new URL(asset![1], url), {signal: AbortSignal.timeout(5000)});
                    expect(script.status).toBe(200);
                    expect((await script.text()).length).toBeGreaterThan(1000);
                    await exercise(url);
                } finally {
                    child.kill("SIGINT");
                    const result = await closed;
                    clearTimeout(deadline);
                    observations.push({command: ["pokie", ...args], cwd, stdout, stderr, exit: result.code, signal: result.signal, expired, elapsedMs: Date.now() - started});
                    expect(expired).toBe(false);
                    expect(result).toEqual({code: 0, signal: null});
                    expect(stderr).toBe("");
                }
            };

            const help = run(["--help"]).stdout;
            expect(help).toContain("Open Studio Home:");
            expect(help).toContain("pokie . / pokie <project-path>");
            expect(help).toMatch(/sim\s+.*canonical WASM artifact/);
            expect(help).toMatch(/replay\s+.*deterministic canonical WASM replay/);
            expect(help).not.toMatch(/^ {2}(?:export|studio|__studio)\s+/m);
            // A truly bare invocation from inside an ordinary project must still select Home.
            await studio([], candidate.existingProject, async (url) => {
                expect(await request(url, "/api/context")).toEqual({mode: "home"});
                expect(await request(url, "/api/project/context")).toEqual({status: "empty"});
                expect(await request(url, "/api/home/projects/registry")).toEqual([]);
                expect(await request(url, "/api/home/recent-projects")).toEqual([]);
                const opened = await request(url, "/api/home/projects/open", {projectRoot: candidate.existingProject});
                expect(opened.context).toEqual({mode: "project", projectRoot: candidate.existingProject});
                expect(await request(url, "/api/project/context")).toMatchObject({status: "loaded", projectRoot: candidate.existingProject, game: {id: "playable-game"}});
                expect(await request(url, "/api/project/inspect")).toMatchObject({valid: true, packageRoot: candidate.existingProject});
                expect(await request(url, "/api/project/validate")).toMatchObject({valid: true, game: {id: "playable-game"}});
                expect(await request(url, "/api/home/recent-projects")).toEqual(expect.arrayContaining([expect.objectContaining({projectRoot: candidate.existingProject, missing: false})]));
                expect(await request(url, "/api/home/projects/registry")).toEqual(expect.arrayContaining([expect.objectContaining({location: candidate.existingProject})]));
            });
            for (const [args, cwd] of [
                [[".", "--no-open", "--port", "0"], candidate.existingProject],
                [[candidate.existingProject, "--no-open", "--port", "0"], candidate.workspace],
                [["--no-open", "--port", "0"], candidate.existingProject],
            ] as const) {
                await studio([...args], cwd, async (url) => {
                    expect(await request(url, "/api/context")).toEqual({mode: "project", projectRoot: candidate.existingProject});
                    // Startup serves HTTP before the invocation-owned runtime
                    // dependency snapshot is ready. Give that asynchronous load
                    // the same bounded budget as Home's materializing request.
                    const deadline = Date.now() + 30_000;
                    let context;
                    do {
                        context = await request(url, "/api/project/context");
                        if (context.status !== "loading") break;
                        await new Promise((resolve) => {
                            setTimeout(resolve, 25);
                        });
                    } while (Date.now() < deadline);
                    expect(context).toMatchObject({status: "loaded", projectRoot: candidate.existingProject, game: {id: "playable-game"}});
                    expect(await request(url, "/api/home/projects/registry")).toEqual(expect.arrayContaining([expect.objectContaining({location: candidate.existingProject})]));
                });
            }

            expect(run(["create", "--help"]).stdout).toContain("--seed");
            expect(run(["build", "--help"]).stdout).toContain("--dry-run");
            expect(run(["create", "Tiny Game", "--random", "--seed", "906", "--out", blueprint]).stdout).toContain("created");
            validate(blueprint, "blueprint");
            const preview = run(["build", blueprint, "--target", "parWorkbook", "--out", workbook, "--dry-run"]).stdout;
            expect(preview).toContain(workbook);
            expect(fs.existsSync(workbook)).toBe(false);
            expect(run(["build", blueprint, "--target", "parWorkbook", "--out", workbook]).stdout).toContain('Artifact "parWorkbook" built');
            expect(run(["inspect", workbook]).stdout).toContain("PAR");
            expect(run(["build", workbook, "--target", "blueprint", "--out", imported]).stdout).toContain('Artifact "blueprint" built');
            validate(imported, "blueprint");
            const source = JSON.parse(fs.readFileSync(blueprint, "utf8")) as Record<string, unknown>;
            const readback = JSON.parse(fs.readFileSync(imported, "utf8")) as Record<string, unknown>;
            expect(readback.reels).toEqual(source.reels);
            expect(source.reels).toBeGreaterThan(0);
            expect(Object.keys(source.paytable as Record<string, unknown>).length).toBeGreaterThan(0);
            expect(readback.paytable).toEqual(source.paytable);
            for (const field of ["rows", "symbols", "wilds", "scatters", "paylines", "availableBets"]) expect(readback[field]).toEqual(source[field]);
            expect(run(["par", "export", "--help"]).stdout).toContain("Usage:");

            expect(run(["build", blueprint, "--target", "wasm", "--out", wasm]).stdout).toContain('Artifact "wasm" built');
            expect(fs.existsSync(`${wasm}.pokie-wasm.json`)).toBe(true);
            const inspection = run([wasm]).stdout;
            expect(inspection).toContain("POKIE WASM component");
            expect(inspection).toContain("pokie run");
            expect(inspection).toContain("pokie sim");
            expect(inspection).toContain("pokie replay");
            validate(wasm, "wasm");
            expect(run(["run", "--help"]).stdout).toContain("--seed");
            const draw = run(["run", wasm, "--seed", seed]).stdout;
            expect(draw).toContain("POKIE WASM round");
            expect(run(["run", wasm, "--seed", seed]).stdout).toBe(draw);
            // Capture the original public help before asserting discoverability, so a missing
            // WASM description remains an observable CLI failure rather than a source-only concern.
            const simHelp = run(["sim", "--help"]).stdout;
            const replayHelp = run(["replay", "--help"]).stdout;
            const report = JSON.parse(run(["sim", wasm, "--rounds", String(rounds), "--workers", "1", "--seed", seed, "--format", "json"]).stdout) as SimulationReport;
            const replayArgs = ["replay", wasm, "--round", String(rounds), "--seed", seed];
            const replay = JSON.parse(run(replayArgs).stdout) as Record<string, unknown>;
            const repeated = JSON.parse(run(replayArgs).stdout) as Record<string, unknown>;
            const deterministic = ({timestamp: _timestamp, durationMs: _durationMs, ...fields}: Record<string, unknown>) => fields;
            expect(deterministic(repeated)).toEqual(deterministic(replay));
            expect(report).toMatchObject({rounds, seed, workers: 1, totalBet: replay.totalBet, totalWin: replay.totalWin});
            expect(replay).toMatchObject({round: rounds, seed, stateAfter: {sequence: rounds, seed}});

            const failedOutput = path.join(candidate.workspace, "Failed Game.wasm");
            const failed = run(["build", blueprint, "--targte", "wasm", "--out", failedOutput], 1);
            expect(failed.stderr).toMatch(/Unknown option|unknown option/);
            expect(failed.stderr).toContain("--targte");
            expect(fs.existsSync(failedOutput)).toBe(false);
            expect(fs.existsSync(`${failedOutput}.pokie-wasm.json`)).toBe(false);
            expect(run(["build", blueprint, "--target", "wasm", "--out", failedOutput]).stdout).toContain('Artifact "wasm" built');
            validate(failedOutput, "wasm");
            const bytes = fs.readFileSync(wasm);
            const sidecar = fs.readFileSync(`${wasm}.pokie-wasm.json`);
            run(["build", blueprint, "--target", "wasm", "--out", wasm], 1);
            expect(fs.readFileSync(wasm)).toEqual(bytes);
            expect(fs.readFileSync(`${wasm}.pokie-wasm.json`)).toEqual(sidecar);
            const disabledOutput = path.join(candidate.workspace, "disabled-report.json");
            expect(run(["sim", wasm, "--rounds", "2", "--workers", "2", "--out", disabledOutput], 1).stderr).toContain("--workers 1");
            expect(fs.existsSync(disabledOutput)).toBe(false);
            expect(fs.readdirSync(candidate.workspace).some((name) => (/staging|\.tmp/).test(name))).toBe(false);
            expect(simHelp).toContain("WASM");
            expect(simHelp).toContain("--workers 1");
            expect(simHelp).toContain("pokie-wasm-simulation");
            expect(simHelp).toContain("same explicit --seed");
            expect(replayHelp).toContain("WASM");
            expect(replayHelp).toContain("cumulative totalBet/totalWin");
            expect(replayHelp).toContain("pokie-wasm-replay");
        } finally {
            // This is supplementary implementer test output, never an independent collector receipt.
            fs.mkdirSync(path.join(repositoryRoot, "node_modules", ".cache"), {recursive: true});
            fs.writeFileSync(path.join(repositoryRoot, "node_modules", ".cache", "p906-scenario.json"), JSON.stringify(observations, null, 2));
            fs.rmSync(directory, {recursive: true, force: true});
        }
    }, 180_000);
});

describe("P9-06 Studio HTTP transport", () => {
    it("uses fresh sockets for Home reads and project-open without changing request or response semantics", async () => {
        const requests: {method: string | undefined; route: string | undefined; connection: string | undefined; contentType: string | undefined; body: string}[] = [];
        const sockets: http.IncomingMessage["socket"][] = [];
        const server = http.createServer((request, response) => {
            sockets.push(request.socket);
            let body = "";
            request.setEncoding("utf8");
            request.on("data", (chunk: string) => {
                body += chunk;
            });
            request.on("end", () => {
                requests.push({method: request.method, route: request.url, connection: request.headers.connection, contentType: request.headers["content-type"], body});
                response.writeHead(request.method === "POST" ? 409 : 200, {"Content-Type": "application/json"});
                response.end(JSON.stringify(request.method === "POST" ? {error: "Project opening is already in progress."} : {mode: "home"}));
            });
        });
        await new Promise<void>(resolve => {
            server.listen(0, "127.0.0.1", resolve);
        });
        try {
            const address = server.address();
            if (address === null || typeof address === "string") throw new Error("Expected a bound Studio test port.");
            const url = `http://127.0.0.1:${address.port}`;
            const context = await fetchStudio(`${url}/api/context`, {signal: AbortSignal.timeout(5000)});
            expect(context.status).toBe(200);
            expect(await context.json()).toEqual({mode: "home"});
            const projectRoot = "/workspace/Existing Project";
            const opened = await fetchStudio(new URL("/api/home/projects/open", url), {
                method: "POST", headers: new Headers({"Content-Type": "application/json", Connection: "keep-alive"}),
                body: JSON.stringify({projectRoot}), signal: AbortSignal.timeout(5000),
            });
            expect(opened.status).toBe(409);
            expect(await opened.json()).toEqual({error: "Project opening is already in progress."});
            expect(requests).toEqual([
                {method: "GET", route: "/api/context", connection: "close", contentType: undefined, body: ""},
                {method: "POST", route: "/api/home/projects/open", connection: "close", contentType: "application/json", body: JSON.stringify({projectRoot})},
            ]);
            expect(sockets[0]).not.toBe(sockets[1]);
        } finally {
            await new Promise<void>((resolve, reject) => {
                server.close(error => error ? reject(error) : resolve());
            });
        }
    });
});
