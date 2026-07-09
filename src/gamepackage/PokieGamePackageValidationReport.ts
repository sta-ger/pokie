import type {ValidationIssue} from "../validation/ValidationIssue.js";

export type PokieGamePackageValidationReport = {
    packageRoot: string;
    valid: boolean;
    game: {id: string; name: string; version: string} | null;
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
    suggestions: string[];
};
