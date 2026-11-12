import {jest} from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {POKIE_VERSION, type GameBlueprint} from "@fromstan/pokie";
import {StudioBlueprintService} from "../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioHomeService} from "../../cli/studio/home/StudioHomeService.js";
import {InMemoryRecentProjectsRepository} from "../../cli/studio/InMemoryRecentProjectsRepository.js";
import {applyJsonText, loadBlueprintEditorState} from "../../cli/studio-client/src/domain/blueprintEditorState.js";
import {Paytable} from "../../src/session/videoslot/paytable/Paytable.js";
import {generateExactWeightedOutcomeLibrary} from "../../src/weightedoutcome/generate/generateExactWeightedOutcomeLibrary.js";
import {createTunableBlueprintGame} from "../../src/optimization/createTunableBlueprintGame.js";
import {SharedSlotMathPool} from "../../src/wasm/math/internal/SharedSlotMathPool.js";
import {resolveSharedSlotMathModel} from "../../src/generated/resolveSharedSlotMathModel.js";
import {createAuthoredSession} from "../../src/generated/createAuthoredSession.js";
import {SeededRandomNumberGenerator} from "../../src/session/videoslot/combinations/SeededRandomNumberGenerator.js";
import {VideoSlotWithFreeGamesSession} from "../../src/session/videoslot/VideoSlotWithFreeGamesSession.js";
import {VideoSlotSession} from "../../src/session/videoslot/VideoSlotSession.js";
import {SymbolsCombination} from "../../src/session/videoslot/combinations/SymbolsCombination.js";
import {ProjectTargetResolver} from "../../src/project/ProjectTargetResolver.js";
import {ProjectOptimizationService} from "../../src/optimization/ProjectOptimizationService.js";
import {OptimizeCommand} from "../../cli/commands/OptimizeCommand.js";
import {SharedSlotMath} from "../../src/wasm/math/SharedSlotMath.js";
import {ForcedSymbolsCombinationsGenerator} from "../../src/weightedoutcome/generate/internal/ForcedSymbolsCombinationsGenerator.js";
import {optimizationBlueprint, optimizationRequest} from "./fixtures/OptimizationFixture.js";
import {weightedBlueprint} from "./fixtures/WeightedWholeSequenceGame.js";

// Source-aware editor -> authoritative filesystem boundary checks. Real browser
// observations, observer independence and material finding closure are separate.
describe("V2C-35 draft correction and explicit persistence", () => {
    let directory: string;
    let service: StudioBlueprintService;
    let source: string;

    beforeEach(() => {
        directory = fs.mkdtempSync(path.resolve("node_modules/.cache/pokie-tmp/valera35-"));
        service = new StudioBlueprintService(POKIE_VERSION, path.join(directory, "studio-assets"),
            new StudioHomeService(POKIE_VERSION, new InMemoryRecentProjectsRepository()));
        source = path.join(directory, "weighted design.blueprint.json");
        expect(service.save(source, weightedBlueprint, false).status).toBe("ok");
    });

    afterEach(() => fs.rmSync(directory, {recursive: true, force: true}));

    it("retains rejected JSON and weighted drafts until correction, then persists only on explicit Save", () => {
        const original = fs.readFileSync(source);
        const loaded = service.load(source);
        if (loaded.status !== "ok") throw new Error(loaded.error);
        const state = loadBlueprintEditorState(loaded.blueprint);
        const syntaxError = applyJsonText(state, '{"reelSequences":');
        expect(syntaxError.jsonError).toEqual(expect.any(String));
        expect(syntaxError.jsonText).toBe('{"reelSequences":');
        expect(syntaxError.blueprint).toBe(state.blueprint);

        const model: GameBlueprint = JSON.parse(JSON.stringify(weightedBlueprint));
        // Form/JSON accepts an object draft; the save boundary rejects conflicting reel authorities.
        model.reelStrips = [["A"], ["A"]];
        const invalidText = JSON.stringify(model);
        const invalid = applyJsonText(syntaxError, invalidText);
        expect(invalid.jsonError).toBeUndefined();
        expect(service.validate(invalid.blueprint).status).toBe("invalid");
        expect(service.save(source, invalid.blueprint, true, loaded.blueprintHash).status).toBe("error");
        expect(invalid.jsonText).toBe(invalidText);
        expect(fs.readFileSync(source)).toEqual(original);

        Reflect.deleteProperty(model, "reelStrips");
        model.availableBets = [0.05, 7.5, 1e-7];
        const sequence = model.reelSequences![0];
        if (sequence.type !== "weighted") throw new Error("Expected weighted source fixture");
        model.reelSequences = [{...sequence, variants: sequence.variants.map((variant, index) =>
            index === 0 ? {...variant, id: "authored tiny weight", weight: 1e-7} : variant)}, ...model.reelSequences!.slice(1)];
        const corrected = applyJsonText(invalid, JSON.stringify(model));
        expect(service.validate(corrected.blueprint).status).toBe("ok");
        expect(corrected.revision).toBeGreaterThan(invalid.revision);
        expect(fs.readFileSync(source)).toEqual(original);
        expect(service.save(source, corrected.blueprint, true, loaded.blueprintHash).status).toBe("ok");
        expect(service.load(source)).toMatchObject({status: "ok", blueprint: model});
        expect(fs.readdirSync(directory)).toEqual([path.basename(source)]);
    });

    it("retains both external changes and the local draft after stale Save, then permits explicit Save As", () => {
        const loaded = service.load(source);
        if (loaded.status !== "ok") throw new Error(loaded.error);
        const model: GameBlueprint = JSON.parse(JSON.stringify(weightedBlueprint));
        model.manifest.name = "Local pending edits";
        const local = applyJsonText(loadBlueprintEditorState(loaded.blueprint), JSON.stringify(model));
        const localText = local.jsonText;
        const external = {...weightedBlueprint, manifest: {...weightedBlueprint.manifest, name: "Another tab saved"}};
        expect(service.save(source, external, true, loaded.blueprintHash).status).toBe("ok");
        const externalBytes = fs.readFileSync(source);
        expect(service.save(source, local.blueprint, true, loaded.blueprintHash)).toMatchObject({
            status: "conflict", reason: "stale", canSaveAs: true,
            editedBlueprint: model, currentBlueprint: external,
        });
        expect(local.jsonText).toBe(localText);
        expect(fs.readFileSync(source)).toEqual(externalBytes);
        const destination = path.join(directory, "retained local draft.json");
        expect(fs.existsSync(destination)).toBe(false);
        expect(service.save(destination, local.blueprint, false).status).toBe("ok");
        expect(service.load(destination)).toMatchObject({status: "ok", blueprint: model});
        expect(fs.readFileSync(source)).toEqual(externalBytes);
        expect(fs.readdirSync(directory).sort()).toEqual([path.basename(source), path.basename(destination)].sort());
    });
});


describe("V2C-35 exact optimizer Wasm ownership", () => {
    it("bounds executable allocations across detached exact sessions", async () => {
        const WasmInstance = WebAssembly.Instance;
        const instances = jest.spyOn(WebAssembly, "Instance").mockImplementation((module, imports) => new WasmInstance(module, imports));
        const game = createTunableBlueprintGame(optimizationBlueprint());
        try {
            for (let i = 0; i < 40; i++) {
                const session = game.createExactEnumerationSession!(new ForcedSymbolsCombinationsGenerator([["A"], ["A"]]));
                session.play();
                expect(session.getWinAmount()).toBe(2);
            }
            expect(instances.mock.calls.length).toBeLessThanOrEqual(8);
        } finally {
            await game.release!();
            instances.mockRestore();
        }
    });
});


describe("V2C-35 shared scratch authority and recovery", () => {
    it("rejects an injected math factory at the authored-session public boundary before executing it", () => {
        const create = jest.fn(() => {
            throw new Error("Injected factory executed");
        });
        expect(() => createAuthoredSession(optimizationBlueprint(), new SeededRandomNumberGenerator(1), undefined,
            {create} as unknown as SharedSlotMathPool)).toThrow(/sharedMathPool/);
        expect(create).not.toHaveBeenCalled();
    });

    it("keeps absent and authored zero paytable maps enumerable without inventing awards", () => {
        const table = new Paytable<string>([0.05]);
        expect(table.getAvailableSymbolsForBet(7.5)).toEqual([]);
        expect(table.getNumbersOfSymbolsForBet(7.5, "A")).toEqual([]);
        expect(table.getNumbersOfSymbolsForBet(0.05, "A")).toEqual([]);
        table.setPayoutForSymbol("A", 2, 0);
        expect(table.getAvailableSymbolsForBet(0.05)).toEqual(["A"]);
        expect(table.getNumbersOfSymbolsForBet(0.05, "A")).toEqual([2]);
        expect(table.getWinAmountForSymbol("A", 2, 0.05)).toBe(0);
        table.setPayoutForSymbol("A", 2, 2);
        expect(table.getWinAmountForSymbol("A", 2, 0.05)).toBe(0.1);
    });

    it("reuses the same public exact-generation game after preflight rejection and a no-op", async () => {
        const game = createTunableBlueprintGame(optimizationBlueprint());
        const options = {game, libraryId: "reuse", pokieVersion: POKIE_VERSION, exact: true, stake: 1, now: () => new Date(0)};
        try {
            game.createSession({seed: "unused"});
            await expect(generateExactWeightedOutcomeLibrary({...options, maxOutcomeSpaceSize: BigInt(2)})).rejects.toThrow(/exceeds/);
            for (let run = 0; run < 2; run++) {
                const result = await generateExactWeightedOutcomeLibrary({...options, maxOutcomeSpaceSize: BigInt(4)});
                expect(result.diagnostics).toMatchObject({strategy: "exact", totalOutcomeSpaceSize: 4});
                expect(result.library.outcomes.map(outcome => ({weight: outcome.weight, win: outcome.artifact.totalWin}))).toEqual([
                    {weight: 1, win: 2}, {weight: 3, win: 0},
                ]);
            }
        } finally {
            await game.release!();
        }
    });

    it("validates full models, detaches keys, bounds churn and reacquires evicted facades", () => {
        const pool = new SharedSlotMathPool();
        const model = {...resolveSharedSlotMathModel(optimizationBlueprint()), paytable: {A: {2: 2}, B: {2: 0}}};
        const WasmInstance = WebAssembly.Instance;
        const instances = jest.spyOn(WebAssembly, "Instance").mockImplementation((module, imports) => new WasmInstance(module, imports));
        const disposed = jest.spyOn(SharedSlotMath.prototype, "dispose");
        try {
            const first = pool.create(model);
            const sibling = pool.create(model);
            expect(instances.mock.calls.length).toBe(0);
            model.paytable.A = {2: 999};
            const screen = [["A"], ["A"]];
            expect(first.evaluate(screen, 1).payout).toBe(2);
            const allocated = instances.mock.calls.length;
            for (const changed of [
                {...first.model, rows: 0},
                {...first.model, paytable: {A: {2: "2"}}},
                {...first.model, reels: 3, rows: 2, reelStrips: [["A"], ["A"], ["X"]], paylines: [[0, 0, 0]]},
            ]) {
                expect(() => pool.create(changed as unknown as typeof model)).toThrow(/Unsupported shared WASM math model/);
            }
            expect(instances.mock.calls.length).toBe(allocated);
            expect(() => first.evaluate([["X"], ["A"]], 1)).toThrow(/Shared math requires/);
            expect(() => first.evaluate(screen, 3)).toThrow(/Shared math requires/);
            expect(first.evaluate(screen, 1).payout).toBe(2);
            for (let payout = 3; payout < 15; payout++) {
                const other = pool.create({...first.model, paytable: {A: {2: payout}}});
                expect(other.evaluate(screen, 1).payout).toBe(payout);
                other.dispose();
                expect(instances.mock.calls.length - disposed.mock.calls.length).toBeLessThanOrEqual(8);
            }
            expect(first.evaluate(screen, 1).payout).toBe(2);
            first.dispose();
            expect(() => first.evaluate(screen, 1)).toThrow(/disposed/);
            expect(sibling.evaluate(screen, 1).payout).toBe(2);
            pool.dispose();
            expect(instances.mock.calls.length).toBe(disposed.mock.calls.length);
            expect(() => sibling.evaluate(screen, 1)).toThrow(/disposed/);
            expect(() => pool.create(model)).toThrow(/disposed/);
        } finally {
            pool.dispose();
            disposed.mockRestore();
            instances.mockRestore();
        }
    });

    it("keeps siblings' results and paytables separate through rejection and subsequent reuse", async () => {
        const blueprint = optimizationBlueprint();
        const game = createTunableBlueprintGame(blueprint);
        let grid = [["A"], ["A"]];
        const first = game.createExactEnumerationSession!({generateSymbolsCombination: () => new SymbolsCombination().fromMatrix(grid)});
        const sibling = game.createExactEnumerationSession!(new ForcedSymbolsCombinationsGenerator([["A"], ["A"]]));
        try {
            first.play();
            const result = first.getWinEvaluationResult();
            expect(first.getWinAmount()).toBe(2);
            sibling.getPaytable().setPayoutForSymbol("A", 2, 7);
            sibling.play();
            expect(sibling.getWinAmount()).toBe(7);
            expect(first.getWinAmount()).toBe(2);
            expect(first.getWinEvaluationResult()).toBe(result);
            const credits = first.getCreditsAmount();
            grid = [["unknown"], ["A"]];
            expect(() => first.play()).toThrow();
            expect(first.getCreditsAmount()).toBe(credits);
            expect(sibling.getWinAmount()).toBe(7);
            grid = [["A"], ["A"]];
            first.play();
            expect(first.getWinAmount()).toBe(2);
            first.play();
            expect(first.getWinAmount()).toBe(2);
            expect(first.getCreditsAmount()).toBe(credits + 2);
            await game.release!();
            await game.release!();
            expect(() => first.play()).toThrow(/disposed/);
            expect(() => game.createSession({seed: 1})).toThrow(/disposed/);
        } finally {
            await game.release!();
        }
    });

    it("restores successful snapshots into used and fresh sessions after an executed rejection", async () => {
        const blueprint = optimizationBlueprint();
        const game = createTunableBlueprintGame(blueprint);
        const independent = createAuthoredSession(blueprint, new SeededRandomNumberGenerator("restore-pool"));
        try {
            const used = game.createSession({seed: "restore-pool"});
            const fresh = game.createSession({seed: "restore-pool"});
            if (!(used instanceof VideoSlotSession) || !(fresh instanceof VideoSlotSession)) throw new Error("Expected restorable base sessions");
            if (!(independent.session instanceof VideoSlotSession)) throw new Error("Expected independent base session");
            used.play();
            independent.session.play();
            const snapshot = used.toSessionState();
            const credits = used.getCreditsAmount();
            const available = used.getBet();
            // A selected-bet model that overflows must fail before charging and must
            // neither poison sibling models nor require restoration to reuse scratch.
            used.getPaytable().setPayoutForSymbol("A", 2, Infinity);
            expect(() => used.play()).toThrow(/overflow|finite/i);
            expect(used.getCreditsAmount()).toBe(credits);
            used.getPaytable().setPayoutForSymbol("A", 2, 2);
            used.play();
            used.play();
            for (const session of [used, fresh]) {
                session.fromSessionState(snapshot);
                session.setCreditsAmount(credits);
                session.setBet(available);
                session.play();
            }
            independent.session.play();
            expect(used.toSessionState()).toEqual(fresh.toSessionState());
            expect(used.toSessionState()).toEqual(independent.session.toSessionState());
            expect(used.getWinAmount()).toBe(independent.session.getWinAmount());
            expect(used.getCreditsAmount()).toBe(independent.session.getCreditsAmount());
        } finally {
            independent.dispose();
            await game.release!();
        }
    });

    it("preserves weighted whole-sequence and authored free-game paid-entry sessions", async () => {
        const blueprint: GameBlueprint = {...weightedBlueprint, scatters: ["S"],
            mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {2: 3}}}};
        const game = createTunableBlueprintGame(blueprint);
        try {
            const awarded = game.createExactEnumerationSession!(new ForcedSymbolsCombinationsGenerator([["S"], ["S"]]));
            const other = game.createExactEnumerationSession!(new ForcedSymbolsCombinationsGenerator([["A"], ["A"]]));
            awarded.play();
            const snapshot = awarded.getWinEvaluationResult();
            other.play();
            expect(other.getWinAmount()).toBe(4);
            expect(awarded.getWinAmount()).toBe(0);
            expect(awarded.getWinEvaluationResult()).toBe(snapshot);
            if (!(awarded instanceof VideoSlotWithFreeGamesSession)) throw new Error("Expected free-game session");
            expect(awarded.getStakeAmount()).toBe(0);
            expect(awarded.getFreeGamesSum()).toBe(3);
            const ordinary = game.createSession({seed: 123});
            ordinary.play();
            expect(Number.isFinite(ordinary.getWinAmount())).toBe(true);
        } finally {
            await game.release!();
        }
    });
});

describe("V2C-35 retained exact-finite request through public consumers", () => {
    let directory: string;
    let preserveDirectory = false;
    beforeEach(() => {
        preserveDirectory = false;
        directory = fs.mkdtempSync(path.resolve("node_modules/.cache/pokie-tmp/valera35-optimizer-"));
    });
    afterEach(() => {
        if (!preserveDirectory) fs.rmSync(directory, {recursive: true, force: true});
    });

    it("measures the retained public fixture, explicitly retries a reachable target and durably applies only the reviewed result", () => {
        // Fresh native source execution avoids Jest's cross-context hot-loop cost.
        // No checkout dist, package preparation, npm lifecycle or ambient temp path.
        const entry = path.resolve("tests/v2/fixtures/RetainedOptimizationProbe.ts");
        const script = (phase: "search" | "apply") => `
            const fs = require("node:fs"), Module = require("node:module"), ts = require("typescript");
            const original = Module._resolveFilename;
            Module._resolveFilename = function(request, ...rest) {
                if (request === "@fromstan/pokie") return ${JSON.stringify(path.resolve("src/index.ts"))};
                try { return original.call(this, request, ...rest); }
                catch (error) {
                    if (request.endsWith(".js")) return original.call(this, request.slice(0, -3) + ".ts", ...rest);
                    throw error;
                }
            };
            Module._extensions[".ts"] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), {
                compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true}
            }).outputText, file);
            require(${JSON.stringify(entry)}).runRetainedOptimization(${JSON.stringify(directory)}, ${JSON.stringify(phase)}).catch(error => {
                console.error(error); process.exitCode = 1;
            });
        `;
        preserveDirectory = true;
        // The retained log completed search (432.8s) and retry (146.2s), then
        // hit a shared 600s deadline before Apply could remeasure. Keep the same
        // per-child bound, with separate drained search and retry/Apply hosts.
        for (const phase of ["search", "apply"] as const) {
            const result = spawnSync(process.execPath, ["--max-old-space-size=768", "-e", script(phase)], {
                cwd: process.cwd(), encoding: "utf8", timeout: 600000, killSignal: "SIGKILL", maxBuffer: 2 * 1024 * 1024,
                env: {...process.env, TMPDIR: directory},
            });
            fs.writeFileSync(path.join(directory, `native.${phase}.stdout.log`), result.stdout ?? "");
            fs.writeFileSync(path.join(directory, `native.${phase}.stderr.log`), result.stderr ?? "");
            console.info(result.stdout);
            if (result.error || result.status !== 0) console.error(`Retained native ${phase} diagnostics: ${directory}`, result.stderr);
            expect(result.error).toBeUndefined();
            expect(result.signal).toBeNull();
            expect(result.status).toBe(0);
            expect(result.stdout).toContain(`V2C-35 native ${phase} phase:`);
            expect(result.stdout).toContain("V2C-35 shutdown released the retained candidate workspace.");
            expect(fs.readdirSync(path.join(directory, "scratch"))).toEqual([]);
        }
        preserveDirectory = false;
    }, 1260000);

    it("authenticates the complete saved gate delta without exempting product, build or receipt pins", () => {
        const repository = path.join(directory, "handoff-repository");
        const script = `
            import assert from "node:assert/strict";
            import fs from "node:fs";
            import path from "node:path";
            import {execFileSync} from "node:child_process";
            import {authenticateP805ProductTree} from "./scripts/p8-05-release-handoff.mjs";
            import {authenticateP911Tree, authenticateP911Driver, readP911Candidate,
                readP911CandidateFromEnvironment, readP911SmokeCandidateFromEnvironment} from "./scripts/p9-11-candidate.mjs";
            import {candidateFixture, V2C37_SAVED_GATE_CORRECTION_PATHS, P911_TOOLING_DESCENDANT_PATHS} from "./tests/testUtils/createP911CandidateFixture.mjs";
            const delta = [...new Set(execFileSync("git", ["diff", "--name-only", "b30ed0d66717342782714230f8b97f21c2feddd3"],
                {encoding: "utf8"}).trim().split("\\n").filter(Boolean).concat([
                    "tests/v2/Valera35Regression.test.ts", "tests/v2/fixtures/RetainedOptimizationProbe.ts"
                ]))].sort();
            for (const file of delta) {
                assert.ok(V2C37_SAVED_GATE_CORRECTION_PATHS.includes(file), "saved delta omitted " + file);
                assert.ok(P911_TOOLING_DESCENDANT_PATHS.includes(file), "descendant fixture omitted " + file);
            }
            const fixtureRoot = ${JSON.stringify(repository)};
            fs.mkdirSync(fixtureRoot);
            const fixture = await candidateFixture(fixtureRoot);
            const repository = fixture.repository, options = {repository};
            const environment = {POKIE_P911_CANDIDATE_HANDOFF: fixture.reference.path,
                POKIE_P911_CANDIDATE_HANDOFF_SHA256: fixture.reference.sha256, POKIE_P805_RELEASE_HANDOFF: ""};
            const original = await readP911Candidate(fixture.reference, options);
            const readers = [() => readP911Candidate(fixture.reference, options),
                () => readP911CandidateFromEnvironment(environment, options),
                () => readP911SmokeCandidateFromEnvironment(environment, options)];
            const git = (...args) => execFileSync("git", args, {cwd: repository, encoding: "utf8"}).trim();
            const write = (file, bytes) => {
                fs.mkdirSync(path.dirname(path.join(repository, file)), {recursive: true});
                fs.writeFileSync(path.join(repository, file), bytes);
            };
            const commit = () => {
                git("add", ".");
                git("-c", "user.name=sta-ger", "-c", "user.email=pascaldelger@gmail.com", "commit", "--quiet", "-m", "synthetic handoff contract");
                return git("rev-parse", "HEAD");
            };
            const base = fixture.handoff.candidateId, tree = fixture.handoff.candidateTreeId;
            for (const file of delta) write(file, "synthetic regression delta");
            const reviewed = commit();
            assert.deepEqual(authenticateP805ProductTree(base, reviewed, repository).changedToolingAndEvidencePaths, delta);
            assert.deepEqual(authenticateP911Tree(base, tree, repository).changedEvidenceAndTooling, delta);
            Object.assign(environment, {POKIE_PACK_SMOKE_CANDIDATE_ID: reviewed,
                POKIE_PACK_SMOKE_CANDIDATE_PACKAGE_SHA256: original.archiveSha256});
            for (const read of readers) {
                const selected = await read();
                assert.deepEqual(selected.equivalence.changedEvidenceAndTooling, delta);
                assert.deepEqual({...selected, equivalence: original.equivalence}, original);
            }
            for (const reference of [fixture.reference, fixture.handoff.browserDriver,
                fixture.handoff.buildReceipt, fixture.handoff.installReceipt, {path: fixture.handoff.archivePath},
                {path: path.join(original.packageRoot, "dist/cli/pokie.js")}]) {
                const bytes = fs.readFileSync(reference.path);
                try {
                    fs.writeFileSync(reference.path, "substituted pinned input");
                    for (const read of readers) await assert.rejects(read(),
                        /receipt digest mismatch|authenticated controller browser driver|archive digest mismatch|stale installed asset/);
                } finally { fs.writeFileSync(reference.path, bytes); }
            }
            for (const file of ["src/retained.ts", "cli/retained.ts", "package.json", "package-lock.json",
                "tsconfig.prod.json", "generate-barrels.js", "tests/v2/unlisted.test.ts"]) {
                write(file, "protected drift");
                const changed = commit();
                assert.throws(() => authenticateP805ProductTree(base, changed, repository), /product or build inputs/);
                assert.throws(() => authenticateP911Tree(base, tree, repository), /affected proofs must be rerun/);
                for (const read of readers) await assert.rejects(read(), /affected proofs must be rerun/);
                git("reset", "--hard", reviewed);
            }
            for (const file of delta) {
                fs.unlinkSync(path.join(repository, file));
                fs.symlinkSync("package.json", path.join(repository, file));
                const changed = commit();
                assert.throws(() => authenticateP805ProductTree(base, changed, repository), /nonregular/);
                assert.throws(() => authenticateP911Tree(base, tree, repository), /nonregular/);
                git("reset", "--hard", reviewed);
            }
            const driver = path.join(repository, "driver.mjs");
            fs.writeFileSync(driver, "substituted driver");
            await assert.rejects(authenticateP911Driver({path: driver, sha256: "0".repeat(64)}), /authenticated controller browser driver/);
            console.log("Complete saved delta admitted by both readers; protected inputs and driver pin rejected.");
        `;
        const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
            cwd: process.cwd(), encoding: "utf8", timeout: 30000,
        });
        if (result.status !== 0) console.error(result.stdout, result.stderr);
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(0);
        expect(result.stdout).toContain("Complete saved delta admitted by both readers");
    });

    it("keeps CLI exact results, cancellation and a corrected explicit retry reusable", async () => {
        const source = path.join(directory, "source.blueprint.json");
        const policy = path.join(directory, "policy.json");
        const model = optimizationBlueprint();
        fs.writeFileSync(source, JSON.stringify(model));
        const optimizer = new ProjectOptimizationService(path.join(directory, "scratch"));
        const controller = new AbortController();
        controller.abort();
        const project = await new ProjectTargetResolver().resolve(source, {readConfigurationProvenance: false});
        if (!project) throw new Error("Expected resolved Blueprint");
        expect((await optimizer.optimize(project, optimizationRequest(), {signal: controller.signal})).status).toBe("cancelled");
        const invalid = optimizationRequest();
        invalid.policy.tunables[0].path = "/unknown";
        expect((await optimizer.optimize(project, invalid)).status).toBe("invalid");
        fs.writeFileSync(policy, JSON.stringify(optimizationRequest()));
        const output = jest.spyOn(console, "log").mockImplementation(() => undefined);
        try {
            expect(await new OptimizeCommand(optimizer).run([source, "--policy", policy])).toBe(0);
            const result = JSON.parse(output.mock.calls[output.mock.calls.length - 1][0] as string);
            expect(result).toMatchObject({status: "success", evidence: {measured: [0.75]}});
            expect(JSON.parse(fs.readFileSync(source, "utf8"))).toEqual(model);
            expect(fs.readdirSync(path.join(directory, "scratch"))).toEqual([]);
        } finally {
            output.mockRestore();
        }
    });
});
