import {ChildProcessWithoutNullStreams, execFileSync, spawn} from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const REPO_ROOT = path.join(__dirname, "..", "..");

// Only place in the suite where a CLI command is legitimately spawned as a real subprocess (see the
// project's own "never spawn a CLI command as a subprocess" convention for Studio's in-process
// features) — this test isn't exercising Studio internals, it's exercising *packaging*: whether the
// tarball `npm publish` would actually ship contains everything the installed `pokie` binary needs to
// run standalone, outside this repo's own dev tree (studioRoot resolution via import.meta.url, the
// dual CJS/ESM dist layout, etc.).
function waitForListeningPort(child: ChildProcessWithoutNullStreams, timeoutMs = 60000): Promise<number> {
    return new Promise((resolve, reject) => {
        let output = "";
        const timer = setTimeout(() => {
            reject(new Error(`Timed out waiting for "pokie" to report its listening port. Output so far:\n${output}`));
        }, timeoutMs);
        const onData = (chunk: Buffer): void => {
            output += chunk.toString();
            const match = (/listening on http:\/\/[^:]+:(\d+)/).exec(output);
            if (match) {
                clearTimeout(timer);
                child.stdout.off("data", onData);
                resolve(Number(match[1]));
            }
        };
        child.stdout.on("data", onData);
        child.stderr.on("data", (chunk: Buffer) => {
            output += chunk.toString();
        });
        child.once("exit", (code) => {
            clearTimeout(timer);
            reject(new Error(`"pokie" exited early (code ${code}). Output so far:\n${output}`));
        });
    });
}

async function stopChild(child: ChildProcessWithoutNullStreams): Promise<void> {
    if (child.exitCode !== null) {
        return;
    }
    child.kill();
    await new Promise<void>((resolve) => {
        child.once("exit", () => resolve());
    });
}

describe("npm pack smoke test (real tarball, real npm install, real spawned pokie binary)", () => {
    // Real `npm pack` (which runs the full `prepack` -> `npm run build` lifecycle) plus a real
    // `npm install` are both genuinely slow — far outside the rest of the suite's normal budget.
    jest.setTimeout(300000);

    let tarballPath: string | undefined;
    let installDir: string | undefined;
    let pokieBinPath: string;

    beforeAll(() => {
        const packOutput = execFileSync("npm", ["pack", "--json"], {cwd: REPO_ROOT, encoding: "utf-8"});
        const [{filename}] = JSON.parse(packOutput) as Array<{filename: string}>;
        tarballPath = path.join(REPO_ROOT, filename);
        expect(fs.existsSync(tarballPath)).toBe(true);

        installDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-npm-pack-smoke-"));
        fs.writeFileSync(
            path.join(installDir, "package.json"),
            JSON.stringify({name: "pokie-smoke-test", version: "0.0.0", private: true}),
        );
        execFileSync("npm", ["install", tarballPath, "--no-audit", "--no-fund"], {cwd: installDir, encoding: "utf-8"});

        pokieBinPath = path.join(installDir, "node_modules", ".bin", "pokie");
        expect(fs.existsSync(pokieBinPath)).toBe(true);
    });

    afterAll(() => {
        if (installDir !== undefined) {
            fs.rmSync(installDir, {recursive: true, force: true});
        }
        if (tarballPath !== undefined && fs.existsSync(tarballPath)) {
            fs.rmSync(tarballPath);
        }
    });

    it("runs `pokie --no-open` (Home mode): serves the app shell/assets and a healthy API", async () => {
        const child = spawn(pokieBinPath, ["--no-open", "--port", "0"], {cwd: installDir}) as ChildProcessWithoutNullStreams;
        try {
            const port = await waitForListeningPort(child);
            const baseUrl = `http://127.0.0.1:${port}`;

            const health = await fetch(`${baseUrl}/api/health`);
            expect(health.status).toBe(200);
            expect(await health.json()).toEqual({status: "ok"});

            const context = await fetch(`${baseUrl}/api/context`);
            expect(await context.json()).toEqual({mode: "home"});

            const diagnostics = await fetch(`${baseUrl}/api/studio/diagnostics`);
            expect(diagnostics.status).toBe(200);
            expect((await diagnostics.json()) as {mode: string}).toMatchObject({mode: "home"});

            // Proves the tarball's compiled/copied studio-client assets are actually served from the
            // installed location, not just present on disk in this dev repo.
            const index = await fetch(`${baseUrl}/`);
            expect(index.status).toBe(200);
            expect(index.headers.get("content-type")).toContain("text/html");

            const mainJs = await fetch(`${baseUrl}/main.js`);
            expect(mainJs.status).toBe(200);
            expect(mainJs.headers.get("content-type")).toContain("javascript");

            const styleCss = await fetch(`${baseUrl}/style.css`);
            expect(styleCss.status).toBe(200);
            expect(styleCss.headers.get("content-type")).toContain("css");
        } finally {
            await stopChild(child);
        }
    });

    it("runs `pokie . --no-open` (Project mode) against a non-package directory: starts cleanly, reports an error dashboard, never crashes", async () => {
        const child = spawn(pokieBinPath, [".", "--no-open", "--port", "0"], {cwd: installDir}) as ChildProcessWithoutNullStreams;
        try {
            const port = await waitForListeningPort(child);
            const baseUrl = `http://127.0.0.1:${port}`;

            const context = await fetch(`${baseUrl}/api/context`);
            expect(await context.json()).toEqual({mode: "project", projectRoot: installDir});

            let dashboard: {status: string} = {status: "loading"};
            for (let i = 0; i < 200 && dashboard.status === "loading"; i++) {
                const response = await fetch(`${baseUrl}/api/project/context`);
                dashboard = (await response.json()) as {status: string};
                if (dashboard.status === "loading") {
                    await new Promise((resolve) => {
                        setTimeout(resolve, 50);
                    });
                }
            }
            expect(dashboard.status).toBe("error");

            // Still running — a failed project load reports an error dashboard, it never crashes Studio.
            expect(child.exitCode).toBeNull();
        } finally {
            await stopChild(child);
        }
    });

    it("imports ParallelSimulationRunner from the installed \"pokie\" package and runs a workers=2 simulation, exiting cleanly with no lingering worker threads", () => {
        const fixtureRoot = path.join(REPO_ROOT, "tests", "cli", "fixtures", "playable-game");
        const scriptPath = path.join(installDir!, "run-parallel-simulation.mjs");
        // Deliberately not importing anything from this repo's own src/cli — this script only ever
        // sees what npm actually installed from the tarball, exactly as a real third-party consumer
        // embedding parallel simulation programmatically would write it.
        fs.writeFileSync(
            scriptPath,
            `
            import {ParallelSimulationRunner} from "pokie";

            const runner = new ParallelSimulationRunner(${JSON.stringify(fixtureRoot)}, 20000, {seed: "demo", workers: 2});
            const result = await runner.run();

            if (result.workers !== 2) {
                throw new Error("expected workers to be 2, got " + result.workers);
            }
            if (result.statistics.rounds !== 20000) {
                throw new Error("expected 20000 rounds, got " + result.statistics.rounds);
            }
            if (!Number.isFinite(result.statistics.rtp)) {
                throw new Error("expected a finite rtp");
            }
            if (result.manifest.id !== "playable-game") {
                throw new Error("expected the fixture game's manifest, got " + JSON.stringify(result.manifest));
            }
            if (!result.workerSeedStrategy || typeof result.workerSeedStrategy !== "string") {
                throw new Error("expected a workerSeedStrategy description");
            }

            console.log("PARALLEL_SIMULATION_SMOKE_OK " + JSON.stringify({workers: result.workers, rounds: result.statistics.rounds}));
            `,
        );

        // execFileSync only returns once the child process has actually exited on its own — if a
        // worker thread were left running (not terminated after run() resolves), Node's event loop
        // would never drain and this would hang until Jest's own timeout killed it, failing the test.
        const output = execFileSync("node", [scriptPath], {cwd: installDir, encoding: "utf-8", timeout: 60000});

        expect(output).toContain('PARALLEL_SIMULATION_SMOKE_OK {"workers":2,"rounds":20000}');
    });
});
