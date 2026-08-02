import fs from "fs";
import path from "path";
import {PokieGamePackageValidating, PokieGamePackageValidator} from "pokie";
import {GamePackageCreateOverrides, GamePackageCreating} from "../scaffold/GamePackageCreating.js";
import {GamePackageCreator} from "../scaffold/GamePackageCreator.js";
import {renderPackageReadme} from "../scaffold/renderPackageReadme.js";
import {ScaffoldResult} from "../scaffold/ScaffoldResult.js";
import {GamePackagePreparationError, GamePackagePreparationPhase} from "./GamePackagePreparationError.js";
import {GamePackagePreparing} from "./GamePackagePreparing.js";
import {PackageCommandRunning, runPackageCommand} from "./PackageCommandRunner.js";
import {PreparationResult} from "./PreparationResult.js";

// The full create -> install dependencies -> build -> verify lifecycle, in that order, stopping and
// throwing GamePackagePreparationError (with an actionable recovery step in its message) the moment
// any phase fails -- never a partially-completed silent result. Reuses GamePackageCreating for the
// "create" phase (rather than re-deriving name validation/manifest defaults independently) and adds
// only what that contract doesn't already write: README.md. "verify" reuses
// PokieGamePackageValidating rather than throwing loadPokieGame's own contract-validation error
// directly, so a failed verification can be reported as a structured, multi-issue message the same
// way `pokie validate` already does.
export class GamePackagePreparer implements GamePackagePreparing {
    private readonly creator: GamePackageCreating;
    private readonly runCommand: PackageCommandRunning;
    private readonly validator: PokieGamePackageValidating;

    constructor(
        pokieVersion: string,
        creator: GamePackageCreating = new GamePackageCreator(pokieVersion),
        runCommand: PackageCommandRunning = runPackageCommand,
        validator: PokieGamePackageValidating = new PokieGamePackageValidator(),
    ) {
        this.creator = creator;
        this.runCommand = runCommand;
        this.validator = validator;
    }

    public async prepare(parentDir: string, name: string, overrides?: GamePackageCreateOverrides): Promise<PreparationResult> {
        const phasesCompleted: GamePackagePreparationPhase[] = [];

        const scaffold = this.runCreatePhase(parentDir, name, overrides);
        phasesCompleted.push("create");

        await this.runManagedCommand("dependencies", scaffold.projectRoot, ["install"]);
        phasesCompleted.push("dependencies");

        await this.runManagedCommand("build", scaffold.projectRoot, ["run", "build"]);
        phasesCompleted.push("build");

        await this.runVerifyPhase(scaffold.projectRoot);
        phasesCompleted.push("verify");

        return {
            projectRoot: scaffold.projectRoot,
            manifest: scaffold.manifest,
            createdFiles: scaffold.createdFiles,
            phasesCompleted,
        };
    }

    private runCreatePhase(parentDir: string, name: string, overrides?: GamePackageCreateOverrides): ScaffoldResult {
        let result: ScaffoldResult;
        try {
            result = this.creator.create(parentDir, name, overrides);
        } catch (error) {
            throw new GamePackagePreparationError("create", error instanceof Error ? error.message : String(error));
        }

        fs.writeFileSync(path.join(result.projectRoot, "README.md"), renderPackageReadme(result.manifest));

        return {...result, createdFiles: [...result.createdFiles, "README.md"]};
    }

    private async runManagedCommand(phase: GamePackagePreparationPhase, projectRoot: string, npmArgs: string[]): Promise<void> {
        const npmCommand = `npm ${npmArgs.join(" ")}`;
        try {
            await this.runCommand("npm", npmArgs, projectRoot);
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            throw new GamePackagePreparationError(
                phase,
                `"${npmCommand}" failed in "${projectRoot}": ${detail}\n` +
                    `Run "${npmCommand}" manually in "${projectRoot}" to see the full output, fix the underlying ` +
                    `issue, then re-run preparation.`,
            );
        }
    }

    private async runVerifyPhase(projectRoot: string): Promise<void> {
        const report = await this.validator.validate(projectRoot);
        if (report.valid) {
            return;
        }

        const details = report.errors.map((issue) => `  - ${issue.code}: ${issue.message}`).join("\n");
        throw new GamePackagePreparationError(
            "verify",
            `Prepared package "${projectRoot}" is not a valid POKIE game:\n${details}\n` +
                `If this is a missing/stale build, run "npm run build" in "${projectRoot}" so "dist/index.js" ` +
                `matches the current source, then re-run preparation.`,
        );
    }
}
