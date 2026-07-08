import {ValidationIssue} from "../../../validation/ValidationIssue.js";
import {ValidationRule} from "../../../validation/ValidationRule.js";
import {WinEvaluationValidationContext} from "./WinEvaluationValidationContext.js";

export class WaysEvaluatorValidationRule<T extends string | number | symbol = string>
implements ValidationRule<WinEvaluationValidationContext<T>> {
    public validate(target: WinEvaluationValidationContext<T>): ValidationIssue[] {
        const evaluationContext = target.getEvaluationContext();
        if (!evaluationContext) {
            return [];
        }

        const waysEvaluator = target.getEvaluators().find((evaluator) => evaluator.getEvaluatorGroup() === "ways");
        if (!waysEvaluator) {
            return [];
        }

        const config = evaluationContext.getConfig();
        const issues: ValidationIssue[] = [];
        if (config.getReelsNumber() < 2) {
            issues.push({
                code: "ways-grid-too-small",
                severity: "warning",
                message: "Ways evaluation is enabled on a grid with fewer than 2 reels.",
                suggestion: "Use at least 2 reels or switch to a line/scatter evaluator.",
            });
        }

        if (config.getReelsSymbolsNumber() < 1) {
            issues.push({
                code: "ways-grid-has-no-visible-rows",
                severity: "error",
                message: "Ways evaluation is enabled on a grid with no visible rows.",
            });
        }

        const payableSymbols = config
            .getAvailableSymbols()
            .filter((symbolId) => !config.isSymbolWild(symbolId) && !config.isSymbolScatter(symbolId));
        if (payableSymbols.length === 0) {
            issues.push({
                code: "ways-no-payable-symbols",
                severity: "error",
                message: "Ways evaluation is enabled, but the config has no payable non-wild non-scatter symbols.",
            });
        }

        return issues;
    }
}
