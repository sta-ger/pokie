import {execFileSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../..");

function run(file: string, args: string[], cwd: string, timeout = 600_000): string {
    return execFileSync(file, args, {
        cwd,
        encoding: "utf8",
        timeout,
        maxBuffer: 32 * 1024 * 1024,
        env: {...process.env, NODE_OPTIONS: ""},
    });
}

describe("packed package", () => {
    jest.setTimeout(900_000);

    it("packs, installs and runs from the produced archive", () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-pack-smoke-"));
        const packDir = path.join(root, "pack");
        const installDir = path.join(root, "install");
        fs.mkdirSync(packDir);
        fs.mkdirSync(installDir);

        try {
            run("npm", ["pack", "--silent", "--pack-destination", packDir], REPO_ROOT);
            const archives = fs.readdirSync(packDir).filter((name) => name.endsWith(".tgz"));
            expect(archives).toHaveLength(1);
            const archive = path.join(packDir, archives[0]);
            expect(fs.statSync(archive).size).toBeGreaterThan(0);

            run(
                "npm",
                ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--prefix", installDir, archive],
                root,
            );

            // Root-level overrides never reach consumers. Audit the tree exactly as the tarball
            // installed it so a vulnerable production transitive cannot hide behind package.json.
            const audit = JSON.parse(run("npm", ["audit", "--omit=dev", "--json"], installDir));
            expect(audit.metadata.vulnerabilities).toMatchObject({
                info: 0,
                low: 0,
                moderate: 0,
                high: 0,
                critical: 0,
                total: 0,
            });

            const packageRoot = path.join(installDir, "node_modules", "@fromstan", "pokie");
            expect(fs.existsSync(path.join(packageRoot, "dist", "esm", "index.js"))).toBe(true);
            expect(fs.existsSync(path.join(packageRoot, "dist", "cjs"))).toBe(false);
            expect(fs.existsSync(path.join(packageRoot, "dist", "cli", "pokie.js"))).toBe(true);

            const cli = path.join(packageRoot, "dist", "cli", "pokie.js");
            expect(run(process.execPath, [cli, "--version"], installDir)).toContain("2.0.0");

            const esmScript = path.join(installDir, "smoke.mjs");
            fs.writeFileSync(
                esmScript,
                [
                    'import {VideoSlotSession} from "@fromstan/pokie";',
                    "const session = new VideoSlotSession();",
                    "session.play();",
                    "console.log(JSON.stringify({win: session.getWinAmount(), credits: session.getCreditsAmount()}));",
                ].join("\n"),
            );
            const esm = JSON.parse(run(process.execPath, [esmScript], installDir));
            expect(esm).toEqual({win: expect.any(Number), credits: expect.any(Number)});

            const cjsScript = path.join(installDir, "smoke.cjs");
            fs.writeFileSync(
                cjsScript,
                [
                    'const {VideoSlotSession} = require("@fromstan/pokie");',
                    "const session = new VideoSlotSession();",
                    "session.play();",
                    "console.log(typeof session.getWinAmount());",
                ].join("\n"),
            );
            expect(run(process.execPath, [cjsScript], installDir).trim()).toBe("number");
        } finally {
            fs.rmSync(root, {recursive: true, force: true});
        }
    });
});
