import {ValidationIssue} from "pokie";

export interface ValidationRule<T> {
    validate(target: T): ValidationIssue[];
}
