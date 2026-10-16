import type {AdvancedModelValidationReport} from "../validation/AdvancedModelValidation.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";

export type PokieGamePackageValidationReport = {
    packageRoot: string;
    /** Optional explicit advanced analysis; valid refers to structural/package contracts only. */
    advanced?: AdvancedModelValidationReport;
    valid: boolean;
    game: {id: string; name: string; version: string} | null;
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
    /** Non-blocking integrity and contract observations, retained separately from warnings. */
    information?: ValidationIssue[];
    suggestions: string[];
};
