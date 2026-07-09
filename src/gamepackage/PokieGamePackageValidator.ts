import {isPokieGame} from "./isPokieGame.js";
import {PokieGameContractValidationRule} from "./PokieGameContractValidationRule.js";
import type {PokieGamePackageValidating} from "./PokieGamePackageValidating.js";
import type {PokieGamePackageValidationReport} from "./PokieGamePackageValidationReport.js";
import {resolvePokieGameEntryModule, ResolvedPokieGameEntryModule} from "./resolvePokieGameEntryModule.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {ValidationRule} from "../validation/ValidationRule.js";

export class PokieGamePackageValidator implements PokieGamePackageValidating {
    private readonly resolveEntryModule: (packageRoot: string) => Promise<ResolvedPokieGameEntryModule>;
    private readonly contractRule: ValidationRule<unknown>;

    constructor(
        resolveEntryModule: (
            packageRoot: string,
        ) => Promise<ResolvedPokieGameEntryModule> = resolvePokieGameEntryModule,
        contractRule: ValidationRule<unknown> = new PokieGameContractValidationRule(),
    ) {
        this.resolveEntryModule = resolveEntryModule;
        this.contractRule = contractRule;
    }

    public async validate(packageRoot: string): Promise<PokieGamePackageValidationReport> {
        let candidate: unknown;
        try {
            ({candidate} = await this.resolveEntryModule(packageRoot));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return this.buildReport(packageRoot, null, [
                {code: "pokie-package-load-failed", severity: "error", message},
            ]);
        }

        const issues = this.contractRule.validate(candidate);
        return this.buildReport(packageRoot, this.extractGame(candidate), issues);
    }

    private extractGame(candidate: unknown): PokieGamePackageValidationReport["game"] {
        if (!isPokieGame(candidate)) {
            return null;
        }

        try {
            const manifest = candidate.getManifest();
            if (typeof manifest !== "object" || manifest === null) {
                return null;
            }

            const asString = (value: unknown): string => (typeof value === "string" ? value : "");
            return {id: asString(manifest.id), name: asString(manifest.name), version: asString(manifest.version)};
        } catch {
            return null;
        }
    }

    private buildReport(
        packageRoot: string,
        game: PokieGamePackageValidationReport["game"],
        issues: ValidationIssue[],
    ): PokieGamePackageValidationReport {
        const errors = issues.filter((issue) => issue.severity === "error");
        const warnings = issues.filter((issue) => issue.severity === "warning" || issue.severity === "info");
        const suggestions = [
            ...new Set(
                issues
                    .map((issue) => issue.suggestion)
                    .filter((suggestion): suggestion is string => Boolean(suggestion)),
            ),
        ];

        return {packageRoot, valid: errors.length === 0, game, errors, warnings, suggestions};
    }
}
