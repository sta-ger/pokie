import type {ValidationIssue} from "../validation/ValidationIssue.js";

export interface GameBlueprintValidating {
    validate(blueprint: unknown): ValidationIssue[];
}
