import type {ValidationIssue} from "./ValidationIssue.js";

export interface ValidationRule<T> {
    validate(target: T): ValidationIssue[];
}
