import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import ts from "typescript";
import {createHash} from "node:crypto";
import {POKIE_VERSION} from "../../src/PokieVersion.js";
import {POKIE_WASM_RUNTIME_VERSION, POKIE_WASM_RUNTIME_API_VERSION} from "../../src/wasm/PokieWasmRuntimeApi.js";
import {POKIE_WASM_ABI_VERSION, POKIE_WASM_CONTRACT_VERSION} from "../../src/project/wasm/PokieWasmComponentManifest.js";
import {GAME_BLUEPRINT_SCHEMA_VERSION} from "../../src/generated/GameBlueprint.js";
import {ROUND_ARTIFACT_SCHEMA_VERSION} from "../../src/artifact/RoundArtifact.js";
import {GamePackageGenerator} from "../../src/generated/GamePackageGenerator.js";
import {buildPackageJsonPatch} from "../../src/gamepackage/buildPackageJsonPatch.js";
import {createBlueprintWasmArtifact} from "../../src/wasm/createBlueprintWasmArtifact.js";
import {instantiatePokieWasm, SeededPokieWasmHost} from "../../src/wasm/PokieWasmRuntime.js";
import {createLocalRuntimeIdentity} from "../../cli/materialize/materializeRuntimePackage.js";
import {dispatch} from "../../cli/dispatch.js";
import {registerCliCommands} from "../../cli/registerCliCommands.js";
import {StudioServer} from "../../cli/studio/StudioServer.js";
import {StudioHomeService} from "../../cli/studio/home/StudioHomeService.js";
import {StudioJobService} from "../../cli/studio/jobs/StudioJobService.js";
import {FileStudioJobRepository} from "../../cli/studio/jobs/FileStudioJobRepository.js";

const root = process.cwd();
const read = (name: string): string => fs.readFileSync(path.join(root, name), "utf8");
const metadata = JSON.parse(read("package.json"));
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], {encoding: "utf8"}).trim();
const preparation = read("docs/v2-completion/release-preparation.md");
const plan = JSON.parse(preparation.match(/```json\n([\s\S]*?)\n```/)![1]);
const blueprint = JSON.parse(read("examples/blueprints/sample-slot.blueprint.json"));
const actions = ["npm-account", "npm-publish", "repository-transfer", "github-release", "dns", "hosting-account", "deployment", "linkedin", "medium"];

// These are assertions about the maintained plan, not a new release/evidence protocol.
function assertPlan(value: typeof plan): void {
    expect(value).toMatchObject({package: metadata.name, version: metadata.version, node: metadata.engines.node, lockfile: "package-lock.json"});
    expect(value.externalActions.map((action: {id: string}) => action.id).sort()).toEqual([...actions].sort());
    for (const action of value.externalActions) {
        for (const field of ["owner", "access", "target", "authorization"]) expect(action[field]?.trim().length).toBeGreaterThan(0);
    }
    expect(value.artifacts.map((artifact: {id: string}) => artifact.id)).toEqual(["runtime", "archive", "site"]);
    for (const artifact of value.artifacts) {
        expect(["planned", "built", "verified", "published"]).toContain(artifact.state);
        if (artifact.state === "planned") {
            expect([artifact.sourceSha, artifact.sha256, artifact.command, artifact.exitCode]).toEqual([null, null, null, null]);
        } else {
            expect(artifact.sourceSha).toMatch(/^[a-f0-9]{40}$/);
            expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
            expect(artifact.path?.length).toBeGreaterThan(0);
            expect(artifact.command?.length).toBeGreaterThan(0);
            expect(artifact.exitCode).toBe(0);
            expect(artifact.sourceSha).toBe(sourceSha);
            expect(fs.existsSync(artifact.path)).toBe(true);
            expect(createHash("sha256").update(fs.readFileSync(artifact.path)).digest("hex")).toBe(artifact.sha256);
            if (["verified", "published"].includes(artifact.state)) expect(artifact.independentAcceptance?.length).toBeGreaterThan(0);
            if (artifact.state === "published") expect([artifact.authorization, artifact.receipt].every(item => typeof item === "string" && item.length > 0)).toBe(true);
        }
    }
}

// Follow every npm pre/post edge plus invoked local scripts and their local imports.
// Inspect executable string arguments, not historical receipt prose or conditional guidance.
function inspectHooks(scripts: Record<string, string>, sources: (file: string) => string): Set<string> {
    const visited = new Set<string>();
    const forbidden = /\b(?:npm\s+publish|gh\s+(?:release|repo)|git\s+(?:push|remote\s+set-url)|(?:wrangler|vercel|netlify|firebase|gcloud|aws)\s+(?:deploy|publish|s3|dns)|curl\s+.*(?:POST|PUT|DELETE))\b/;
    const inspectCommand = (command: string): void => {
        expect(command).not.toMatch(forbidden);
        for (const match of command.matchAll(/npm\s+run\s+([\w:-]+)/g)) visitScript(match[1]);
        for (const match of command.matchAll(/\bnode\s+([\w./-]+\.(?:mjs|js))/g)) visitFile(match[1]);
    };
    const visitFile = (file: string): void => {
        if (visited.has(file)) return;
        visited.add(file);
        const source = ts.createSourceFile(file, sources(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
        const walk = (node: ts.Node): void => {
            if (ts.isStringLiteralLike(node)) {
                inspectCommand(node.text);
                if (node.text.startsWith(".") && (/\.(?:mjs|js)$/).test(node.text) &&
                    (ts.isImportDeclaration(node.parent) || ts.isCallExpression(node.parent) && node.parent.expression.kind === ts.SyntaxKind.ImportKeyword)) {
                    visitFile(path.posix.normalize(path.posix.join(path.posix.dirname(file), node.text)));
                }
            }
            if (ts.isCallExpression(node) && (/(?:execFile|spawn|exec)(?:Sync)?$/).test(node.expression.getText(source))) {
                const literals: string[] = [];
                const collect = (child: ts.Node): void => {
                    if (ts.isStringLiteralLike(child)) literals.push(child.text);
                    else ts.forEachChild(child, collect);
                };
                node.arguments.forEach(collect);
                expect(literals.join(" ")).not.toMatch(forbidden);
            }
            ts.forEachChild(node, walk);
        };
        walk(source);
    };
    const visitScript = (name: string): void => {
        if (visited.has(`npm:${name}`)) return;
        visited.add(`npm:${name}`);
        for (const hook of [`pre${name}`, name, `post${name}`]) if (scripts[hook]) inspectCommand(scripts[hook]);
    };
    Object.keys(scripts).forEach(visitScript);
    return visited;
}

describe("V2C-30 release preparation", () => {
    let directory: string;
    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(root, "node_modules/.cache/pokie-tmp/release-30-")); 
    });
    afterEach(() => {
        fs.rmSync(directory, {recursive: true, force: true}); 
    });

    it("agrees on package, lockfile, CLI dispatch and observable Studio versions", async () => {
        const lock = JSON.parse(read("package-lock.json"));
        expect([metadata.version, lock.version, lock.packages[""].version, POKIE_VERSION, POKIE_WASM_RUNTIME_VERSION]).toEqual(Array(5).fill("2.0.0"));
        const commands = registerCliCommands({version: metadata.version, pokiePackageRoot: root, clientRoot: directory, studioRoot: directory});
        expect(commands.map(command => command.getName())).not.toContain("export");
        const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        try {
            expect(await dispatch(commands, ["node", "pokie", "--version"], metadata.version)).toBe(0);
            expect(log).toHaveBeenCalledWith("2.0.0");
        } finally {
            log.mockRestore(); 
        }
        const server = new StudioServer({pokieVersion: metadata.version, port: 0, host: "127.0.0.1", studioRoot: directory,
            homeService: new StudioHomeService(metadata.version), jobService: new StudioJobService(new FileStudioJobRepository(path.join(directory, "jobs")))});
        try {
            const address = await server.start();
            const response = await fetch(`http://${address.host}:${address.port}/api/health`);
            expect(response.status).toBe(200);
            expect(response.headers.get("x-pokie-version")).toBe("2.0.0");
            expect(await response.json()).toEqual({status: "ok"});
        } finally {
            await server.stop(); 
        }
    });

    it("generates portable 2.0 package/lock metadata and retains authored dependency overrides", () => {
        const generated = new GamePackageGenerator(POKIE_VERSION).generate(blueprint, directory);
        for (const name of ["package.json", "package-lock.json"]) {
            const text = fs.readFileSync(path.join(generated.projectRoot, name), "utf8");
            const value = JSON.parse(text);
            expect(name === "package.json" ? value.dependencies : value.packages[""].dependencies).toMatchObject({"@fromstan/pokie": "^2.0.0"});
            expect(text).not.toMatch(/file:|node_modules\/@fromstan\/pokie.*resolved/);
        }
        expect(buildPackageJsonPatch({dependencies: {"@fromstan/pokie": "^1.2.1"}}, POKIE_VERSION).dependencies).toEqual({"@fromstan/pokie": "^1.2.1"});
        fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({version: "1.3.0"}));
        const old = createLocalRuntimeIdentity(directory);
        fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({version: POKIE_VERSION}));
        const current = createLocalRuntimeIdentity(directory);
        expect(current).not.toBe(old);
        fs.mkdirSync(path.join(directory, "dist"));
        fs.writeFileSync(path.join(directory, "dist/index.js"), "export const changed = true;");
        expect(createLocalRuntimeIdentity(directory)).not.toBe(current);
    });

    it("preserves independent schemas/exports and produces executable 2.0 WASM bytes", async () => {
        expect([GAME_BLUEPRINT_SCHEMA_VERSION, ROUND_ARTIFACT_SCHEMA_VERSION]).toEqual([1, 1]);
        expect([POKIE_WASM_CONTRACT_VERSION, POKIE_WASM_ABI_VERSION, POKIE_WASM_RUNTIME_API_VERSION]).toEqual(["1.0.0", "3.0.0", "2.1.0"]);
        expect(Object.keys(metadata.exports)).toEqual([".", "./client/player", "./browser", "./wasm"]);
        expect(Object.keys(metadata.exports["."])).toEqual(["import", "require"]);
        for (const subpath of ["./browser", "./wasm", "./client/player"]) expect(Object.keys(metadata.exports[subpath])).toEqual(["import"]);
        const artifact = await createBlueprintWasmArtifact(JSON.parse(read("site/examples/weighted.blueprint.json")));
        expect(new TextDecoder().decode(artifact.bytes)).toContain("2.0.0");
        const runtime = await instantiatePokieWasm(artifact.bytes, artifact.manifest, new SeededPokieWasmHost("release"));
        try {
            expect((await runtime.createSession("release").play({bet: 1})).sequence).toBe(1); 
        } finally {
            runtime.dispose(); 
        }
    });

    it("classifies maintained release notes/support separately from immutable historical receipts", () => {
        expect(metadata.files).toEqual(expect.arrayContaining(["CHANGELOG.md", "docs/v2-completion/release-preparation.md", "docs/v2-completion/launch-mechanics-support.md"]));
        expect(metadata.files.filter((name: string) => (/V2C-\d+|evidence|phase\d|linkedin-draft|medium-draft|^site\//).test(name))).toEqual(["docs/certification-evidence-bundle.md"]);
        for (const name of ["README.md", "docs/README.md", "docs/cli.md", "docs/getting-started.md", "docs/game-packages.md", "docs/round-artifacts.md", "site/content/home.md", "site/content/getting-started.md"]) {
            expect(read(name)).not.toMatch(/1\.3\.0|v1\.3|ABI [12]\.0/);
        }
        expect(read("CHANGELOG.md")).toContain("2.0.0 — unpublished candidate");
        expect(read("docs/v2-completion/V2C-29.md")).toContain("1.3.0");
    });

    it("inventories all outputs, state boundaries and existing local script commands without asserting missing artifacts", () => {
        assertPlan(plan);
        for (const script of ["build", "site:build", "site:preview"]) {
            expect(metadata.scripts[script]).toBeDefined();
            expect(preparation).toContain(`npm run ${script}`);
        }
        for (const term of ["tsconfig.prod.json", "tsconfig.cli.json", "tsconfig.client.json", "vite.config.ts", "generate-barrels.js", "write-cjs-package-json.js", "dist/cli/pokie.js", "dist/cli/studio-client/", "prepack", "filename", "sourceHashes", "artifactHashes", "directory-index", "trailing-slash", "404", "dirty", "SHA-256", "controller", "Independent"]) expect(preparation).toContain(term);
        const states = ["planned", "built", "verified", "published"];
        states.forEach(state => expect(preparation).toContain(state));
        expect(plan.artifacts.every((artifact: {state: string}) => artifact.state === "planned")).toBe(true);
        const broken = structuredClone(plan);
        broken.artifacts[0].state = "built";
        expect(() => assertPlan(broken)).toThrow();
        const file = path.join(directory, "fixture-artifact");
        fs.writeFileSync(file, "explicit synthetic artifact fixture");
        const built = {state: "built", path: file, sourceSha, sha256: createHash("sha256").update(fs.readFileSync(file)).digest("hex"), command: "fixture producer", exitCode: 0};
        for (const field of ["sourceSha", "sha256"]) {
            const fixture = structuredClone(plan);
            Object.assign(fixture.artifacts[0], built);
            assertPlan(fixture);
            fixture.artifacts[0][field] = "c".repeat(field === "sourceSha" ? 40 : 64);
            expect(() => assertPlan(fixture)).toThrow();
        }
        for (const state of ["verified", "published"]) {
            const fixture = structuredClone(plan);
            Object.assign(fixture.artifacts[0], built, {state});
            expect(() => assertPlan(fixture)).toThrow();
            fixture.artifacts[0].independentAcceptance = "fixture acceptance";
            if (state === "published") {
                expect(() => assertPlan(fixture)).toThrow();
                Object.assign(fixture.artifacts[0], {authorization: "fixture authorization", receipt: "fixture receipt"});
            }
            assertPlan(fixture);
        }
        const missing = structuredClone(plan);
        Object.assign(missing.artifacts[0], built, {path: path.join(directory, "absent.tgz")});
        expect(() => assertPlan(missing)).toThrow();
        const failed = structuredClone(plan);
        Object.assign(failed.artifacts[0], built, {exitCode: 1});
        expect(() => assertPlan(failed)).toThrow();
    });

    it.each(["linkedin", "medium"])("keeps the %s draft unpublished, supported and bounded", name => {
        const text = read(`docs/v2-completion/${name}-draft.md`);
        for (const term of ["UNPUBLISHED", "Separate explicit posting authorization", "ISC", "AS-IS", "game math", "headless JavaScript/TypeScript runtime", "CLI", "local Studio", "launch-mechanics-support.md", "AuthoredWorkflowSupportCatalog.ts", "GameMechanicCompatibilityCatalog.ts", "composition/target limits", "historical execution", "independent acceptance", "gallery/playground", "bounded", "supported inputs", "provenance", "future deployment target", "Accounts", "KYC", "regulatory compliance", "production RGS integration", "independent RNG certification", "distributed ACID", "durable wallet", "Process-only Studio Play", "production settlement guarantee", "Math.random", "seeded reproducibility", "crypto-backed primitives", "fairness proofs", "dossier", "structural validation", "technical SDK compatibility", "regulatory certification", "managed hosting", "commercial support", "service-level commitments"]) expect(text.toLowerCase()).toContain(term.toLowerCase());
    });

    it("requires a complete external-action register with owner, access, target and separate authorization", () => {
        for (const field of ["owner", "access", "target", "authorization"]) {
            const broken = structuredClone(plan);
            Reflect.deleteProperty(broken.externalActions[0], field);
            expect(() => assertPlan(broken)).toThrow();
        }
        const omitted = structuredClone(plan);
        omitted.externalActions.pop();
        expect(() => assertPlan(omitted)).toThrow();
        expect(plan.externalActions.every((action: {owner: string; authorization: string}) => action.owner === "unresolved" && action.authorization === "pending separate explicit authorization")).toBe(true);
    });

    it("traces all lifecycle/script dependencies, generated scripts and tracked workflows without external mutation", () => {
        const visited = inspectHooks(metadata.scripts, read);
        expect(visited.has("scripts/pc-20-release-completion.mjs")).toBe(true);
        expect(visited.has("scripts/p8-05-release-completion.mjs")).toBe(true);
        inspectHooks(buildPackageJsonPatch({}, POKIE_VERSION).scripts!, read);
        expect(() => inspectHooks({build: "npm run inner", postinner: "npm run hidden", hidden: "npm publish"}, read)).toThrow();
        expect(() => inspectHooks({prepack: "node scripts/indirect.mjs"}, file => file.endsWith("indirect.mjs") ? 'import "./publish.mjs";' : 'execFileSync("npm", ["publish"]);')).toThrow();
        expect(metadata.publishConfig.registry).toBe("https://publication-disabled.invalid");
        const workflows = execFileSync("git", ["ls-files", ".github/workflows"], {encoding: "utf8"}).trim().split("\n").filter(Boolean);
        for (const file of workflows) expect(read(file)).not.toMatch(/workflow_dispatch|secrets\.|npm\s+publish|gh\s+(?:release|repo)|git\s+push|(?:vercel|netlify|wrangler)\s+deploy/);
        expect(read(".github/workflows/publish.yml")).toMatch(/\$\{\{ false \}\}/);
        expect(execFileSync("git", ["config", "--local", "--list"], {encoding: "utf8"})).not.toMatch(/core\.hookspath=/i);
    });

    it("refuses public execution before consulting injected credentials/gates/services or writing evidence", () => {
        const runner = path.join(root, "scripts/pc-20-authorized-release-runner.mjs");
        const script = `import {runAuthorizedPc20Lifecycle} from ${JSON.stringify(`file://${runner}`)};
const forbidden = new Proxy({}, {get(){throw Error('service accessed before refusal');}});
try {await runAuthorizedPc20Lifecycle({credentials:'supplied', gate:'historically-passed'}, forbidden, forbidden); process.exitCode=2;}
catch (error) {if (!/Public publication is disabled/.test(error.message)) throw error; console.log(error.message);}`;
        expect(execFileSync(process.execPath, ["--input-type=module", "-e", script], {cwd: directory, encoding: "utf8"})).toContain("Public publication is disabled");
        expect(fs.readdirSync(directory)).toEqual([]);
    });
});
