import {ValidationIssue} from "../../../validation/ValidationIssue.js";
import {ValidationRule} from "../../../validation/ValidationRule.js";
import {WinEvaluationValidationContext} from "./WinEvaluationValidationContext.js";

export class UnusedMultiplierResolverValidationRule<T extends string | number | symbol = string>
implements ValidationRule<WinEvaluationValidationContext<T>> {
    public validate(target: WinEvaluationValidationContext<T>): ValidationIssue[] {
        const multiplierResolver = target.getMultiplierResolver();
        if (!multiplierResolver) {
            return [];
        }

        if (target.getEvaluators().length === 0) {
            return [
                {
                    code: "unused-multiplier-resolver",
                    severity: "warning",
                    message: "A multiplier resolver is configured, but no win evaluators are enabled.",
                },
            ];
        }

        const enabledTypes = new Set(target.getEvaluators().map((evaluator) => evaluator.getComponentType()));
        const supportedTypes = multiplierResolver.getSupportedComponentTypes();
        if (supportedTypes === undefined || supportedTypes.length === 0) {
            return [];
        }

        if (supportedTypes.every((type) => !enabledTypes.has(type))) {
            return [
                {
                    code: "multiplier-resolver-has-no-supported-evaluators",
                    severity: "warning",
                    message:
                        "A multiplier resolver is configured, but none of the enabled evaluators produce supported win component types.",
                    details: {
                        supportedComponentTypes: supportedTypes,
                        enabledComponentTypes: Array.from(enabledTypes),
                    },
                },
            ];
        }

        return [];
    }
}
