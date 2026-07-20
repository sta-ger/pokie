import fs from "fs";
import os from "os";
import path from "path";
import {
    ExternalDeploymentCompatibilityValidator,
    RoundArtifact,
    RoundArtifactProvenance,
    StakeEngineExportModeInput,
    StakeEngineExportValidator,
    ValueWinComponent,
    WeightedOutcomeLibrary,
    WinEvaluationResult,
    WinningValue,
    atomicallyWriteExternalDeploymentArtifactsToDirectory,
    buildRoundArtifact,
    buildWeightedOutcomeLibrary,
    createLocalJsonExternalDeploymentTarget,
} from "pokie";
import {publishDirectoryAtomically} from "../../src/stakeengine/internal/publishDirectoryAtomically.js";

// This file exists specifically because Stake Engine Export (src/stakeengine/) and the External Adapter SDK
// (src/externaladapter/) are *deliberately* kept as separate, sibling pipelines rather than one being built on
// top of the other — see docs/external-adapter-sdk.md#why-stake-engine-export-isnt-an-externaldeploymenttarget.
// Since there's no shared code enforcing that they keep agreeing on what they *do* have in common, these tests
// pin down two contracts both sides independently promise to honor identically, so a future change to either
// side that silently drifts from the other gets caught here rather than by a confused caller.

function provenanceFor(gameId: string): RoundArtifactProvenance {
    return {game: {id: gameId, name: gameId, version: "0.1.0"}, pokieVersion: "1.3.0"};
}

function singleOutcomeLibrary(libraryId: string, gameId: string): WeightedOutcomeLibrary<string> {
    const artifact: RoundArtifact<string> = buildRoundArtifact({
        roundId: `${libraryId}-0`,
        provenance: provenanceFor(gameId),
        betMode: "base",
        stake: 1,
        steps: [{screen: [["A"]], winEvaluationResult: new WinEvaluationResult<string>()}],
    });
    return buildWeightedOutcomeLibrary({libraryId, outcomes: [{id: "0", weight: 1, artifact}]});
}

function winningSingleOutcomeLibrary(libraryId: string, gameId: string): WeightedOutcomeLibrary<string> {
    const artifact: RoundArtifact<string> = buildRoundArtifact({
        roundId: `${libraryId}-0`,
        provenance: provenanceFor(gameId),
        betMode: "base",
        stake: 1,
        steps: [
            {
                screen: [["A"]],
                winEvaluationResult: new WinEvaluationResult<string>({
                    valueWins: [new ValueWinComponent<string>(new WinningValue<string>("A", [[0, 0]], 1))],
                }),
            },
        ],
    });
    return buildWeightedOutcomeLibrary({libraryId, outcomes: [{id: "0", weight: 1, artifact}]});
}

describe("StakeEngine <-> External Adapter SDK: provenance-homogeneity contract", () => {
    it("both validators accept the same homogeneous-provenance multi-mode input", () => {
        const base = singleOutcomeLibrary("base-lib", "crazy-fruits");
        const bonus = winningSingleOutcomeLibrary("bonus-lib", "crazy-fruits");

        const stakeIssues = new StakeEngineExportValidator<string>().validate([
            {modeName: "base", cost: 1, library: base},
            {modeName: "bonus", cost: 100, library: bonus},
        ] satisfies StakeEngineExportModeInput<string>[]);
        expect(stakeIssues.some((issue) => issue.severity === "error")).toBe(false);

        const target = createLocalJsonExternalDeploymentTarget<string>({outDir: "unused-for-validation-only"});
        const compatibilityIssues = new ExternalDeploymentCompatibilityValidator<string>().validate({
            target,
            modes: [
                {modeName: "base", library: base},
                {modeName: "bonus", library: bonus},
            ],
        });
        expect(compatibilityIssues.some((issue) => issue.severity === "error")).toBe(false);
    });

    it("both validators reject the same cross-mode provenance mismatch", () => {
        const base = singleOutcomeLibrary("base-lib", "crazy-fruits");
        const bonusFromAnotherGame = winningSingleOutcomeLibrary("bonus-lib", "a-different-game");

        const stakeIssues = new StakeEngineExportValidator<string>().validate([
            {modeName: "base", cost: 1, library: base},
            {modeName: "bonus", cost: 100, library: bonusFromAnotherGame},
        ] satisfies StakeEngineExportModeInput<string>[]);
        expect(stakeIssues.some((issue) => issue.code === "stakeengine-cross-mode-provenance-mismatch" && issue.severity === "error")).toBe(true);

        const target = createLocalJsonExternalDeploymentTarget<string>({outDir: "unused-for-validation-only"});
        const compatibilityIssues = new ExternalDeploymentCompatibilityValidator<string>().validate({
            target,
            modes: [
                {modeName: "base", library: base},
                {modeName: "bonus", library: bonusFromAnotherGame},
            ],
        });
        expect(compatibilityIssues.some((issue) => issue.code === "external-deployment-provenance-mismatch" && issue.severity === "error")).toBe(true);
    });
});

// The two subsystems each hand-implement the same "build into a fresh temp sibling directory, then rename-swap
// into place, with a stale-backup rollback on a failed publish" algorithm independently
// (publishDirectoryAtomically for Stake Engine, atomicallyWriteExternalDeploymentArtifactsToDirectory for the
// External Adapter SDK) rather than sharing one implementation — see the reconciliation plan's own reasoning
// for why that's an accepted, tested-for-equivalence duplication rather than a forced merge across the two
// packages. This block is what "tested for equivalence" actually means in practice.
type PublishOutcome = {
    readonly threw: boolean;
    readonly errorMessage?: string;
    readonly cleanupWarning: boolean;
};

type PublishDependencies = {
    readonly writeFile?: (filePath: string, data: string | Buffer) => void;
    readonly renameDirectory?: (from: string, to: string) => void;
    readonly removeDirectory?: (dirPath: string) => void;
};

function runViaPublishDirectoryAtomically(outDir: string, deps: PublishDependencies): PublishOutcome {
    try {
        const {cleanupWarning} = publishDirectoryAtomically({
            outDir,
            renameDirectory: deps.renameDirectory,
            removeDirectory: deps.removeDirectory,
            writeFilesIntoTempDir: (tempDir) => {
                (deps.writeFile ?? ((filePath, data) => fs.writeFileSync(filePath, data)))(path.join(tempDir, "index.json"), `{"v":1}`);
            },
        });
        return {threw: false, cleanupWarning: cleanupWarning !== undefined};
    } catch (error) {
        return {threw: true, errorMessage: error instanceof Error ? error.message : String(error), cleanupWarning: false};
    }
}

function runViaAtomicallyWriteExternalDeploymentArtifacts(outDir: string, deps: PublishDependencies): PublishOutcome {
    try {
        const {issues} = atomicallyWriteExternalDeploymentArtifactsToDirectory([{relativePath: "index.json", content: `{"v":1}`}], outDir, deps);
        return {threw: false, cleanupWarning: issues.some((issue) => issue.severity === "warning")};
    } catch (error) {
        return {threw: true, errorMessage: error instanceof Error ? error.message : String(error), cleanupWarning: false};
    }
}

const publishSubjects = [
    {name: "publishDirectoryAtomically (stakeengine)", run: runViaPublishDirectoryAtomically},
    {name: "atomicallyWriteExternalDeploymentArtifactsToDirectory (externaladapter)", run: runViaAtomicallyWriteExternalDeploymentArtifacts},
];

describe("StakeEngine <-> External Adapter SDK: atomic-publish behavioral equivalence", () => {
    let outDir: string;

    beforeEach(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-reconciliation-atomic-test-"));
        fs.rmSync(outDir, {recursive: true, force: true});
    });

    afterEach(() => {
        const parentDir = path.dirname(outDir);
        const base = path.basename(outDir);
        for (const name of fs.readdirSync(parentDir)) {
            if (name === base || name.startsWith(`${base}.`)) {
                fs.rmSync(path.join(parentDir, name), {recursive: true, force: true});
            }
        }
    });

    describe.each(publishSubjects)("$name", ({run}) => {
        it("throws and leaves outDir untouched when the temp-directory write fails", () => {
            run(outDir, {}); // seed a first publish
            const before = fs.readFileSync(path.join(outDir, "index.json"));

            const failingWriteFile = (): void => {
                throw new Error("simulated disk failure");
            };

            const outcome = run(outDir, {writeFile: failingWriteFile});

            expect(outcome.threw).toBe(true);
            expect(outcome.errorMessage).toBe("simulated disk failure");
            expect(fs.readFileSync(path.join(outDir, "index.json"))).toEqual(before);
        });

        it("throws with the injected error's own message, and restores outDir, when the publish rename fails", () => {
            run(outDir, {}); // seed a first publish
            const before = fs.readFileSync(path.join(outDir, "index.json"));

            let renameCallCount = 0;
            const failingRenameDirectory = (from: string, to: string): void => {
                renameCallCount++;
                if (renameCallCount === 2) {
                    throw new Error("simulated publish rename failure");
                }
                fs.renameSync(from, to);
            };

            const outcome = run(outDir, {renameDirectory: failingRenameDirectory});

            expect(outcome.threw).toBe(true);
            expect(outcome.errorMessage).toBe("simulated publish rename failure");
            expect(fs.readFileSync(path.join(outDir, "index.json"))).toEqual(before);
        });

        it("reports a non-throwing warning, never a failure, when only the stale-backup cleanup fails after a successful publish", () => {
            run(outDir, {}); // seed a first publish

            const failingRemoveDirectory = (): void => {
                throw new Error("simulated stale-backup cleanup failure");
            };

            const outcome = run(outDir, {removeDirectory: failingRemoveDirectory});

            expect(outcome.threw).toBe(false);
            expect(outcome.cleanupWarning).toBe(true);
            expect(fs.readFileSync(path.join(outDir, "index.json"), "utf-8")).toBe(`{"v":1}`); // the new publish is live
        });
    });
});
