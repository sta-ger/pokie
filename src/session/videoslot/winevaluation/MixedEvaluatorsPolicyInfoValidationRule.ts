import {ValidationIssue} from "../../../validation/ValidationIssue.js";
import {ValidationRule} from "../../../validation/ValidationRule.js";
import {ErrorOnIncompatibleWinAggregationPolicy} from "./ErrorOnIncompatibleWinAggregationPolicy.js";
import {WinEvaluationValidationContext} from "./WinEvaluationValidationContext.js";

export class MixedEvaluatorsPolicyInfoValidationRule<T extends string | number | symbol = string>
implements ValidationRule<WinEvaluationValidationContext<T>> {
    public validate(target: WinEvaluationValidationContext<T>): ValidationIssue[] {
        const exclusiveGroups = target
            .getEvaluators()
            .map((evaluator) => evaluator.getEvaluatorGroup())
            .filter((group) => ["line", "cluster", "ways", "value"].includes(group));
        const uniqueExclusiveGroups = Array.from(new Set(exclusiveGroups));

        if (
            uniqueExclusiveGroups.length > 1 &&
            !(target.getAggregationPolicy() instanceof ErrorOnIncompatibleWinAggregationPolicy)
        ) {
            return [
                {
                    code: "mixed-evaluators-explicit-policy",
                    severity: "info",
                    message: `Mixed win evaluators enabled under explicit aggregation policy '${target.getAggregationPolicy().getPolicyName()}'.`,
                },
            ];
        }

        return [];
    }
}
