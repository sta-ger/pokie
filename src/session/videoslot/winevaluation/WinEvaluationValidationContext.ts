import {ValidationIssue} from "../../../validation/ValidationIssue.js";
import {ValidationResult} from "../../../validation/ValidationResult.js";
import {ValidationRule} from "../../../validation/ValidationRule.js";
import {MultiplierResolver} from "./MultiplierResolver.js";
import {WinAggregationPolicy} from "./WinAggregationPolicy.js";
import {WinEvaluationContext} from "./WinEvaluationContext.js";
import {WinEvaluator} from "./WinEvaluator.js";

export class WinEvaluationValidationContext<T extends string | number | symbol = string> {
    private readonly evaluators: WinEvaluator<T>[];
    private readonly aggregationPolicy: WinAggregationPolicy<T>;
    private readonly multiplierResolver?: MultiplierResolver<T>;
    private readonly evaluationContext?: WinEvaluationContext<T>;

    constructor(args: {
        evaluators: WinEvaluator<T>[];
        aggregationPolicy: WinAggregationPolicy<T>;
        multiplierResolver?: MultiplierResolver<T>;
        evaluationContext?: WinEvaluationContext<T>;
    }) {
        this.evaluators = [...args.evaluators];
        this.aggregationPolicy = args.aggregationPolicy;
        this.multiplierResolver = args.multiplierResolver;
        this.evaluationContext = args.evaluationContext;
    }

    public getEvaluators(): WinEvaluator<T>[] {
        return [...this.evaluators];
    }

    public getAggregationPolicy(): WinAggregationPolicy<T> {
        return this.aggregationPolicy;
    }

    public getMultiplierResolver(): MultiplierResolver<T> | undefined {
        return this.multiplierResolver;
    }

    public getEvaluationContext(): WinEvaluationContext<T> | undefined {
        return this.evaluationContext;
    }

    public applyRules(rules: ValidationRule<WinEvaluationValidationContext<T>>[]): ValidationResult {
        const issues: ValidationIssue[] = rules.flatMap((rule) => rule.validate(this));
        return new ValidationResult(issues);
    }
}
