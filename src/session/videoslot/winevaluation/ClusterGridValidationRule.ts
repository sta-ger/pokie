import {ValidationIssue} from "../../../validation/ValidationIssue.js";
import {ValidationRule} from "../../../validation/ValidationRule.js";
import {WinEvaluationValidationContext} from "./WinEvaluationValidationContext.js";

export class ClusterGridValidationRule<T extends string | number | symbol = string>
implements ValidationRule<WinEvaluationValidationContext<T>> {
    public validate(target: WinEvaluationValidationContext<T>): ValidationIssue[] {
        const evaluationContext = target.getEvaluationContext();
        if (!evaluationContext) {
            return [];
        }

        const clusterEvaluator = target.getEvaluators().find((evaluator) => evaluator.getEvaluatorGroup() === "cluster");
        if (!clusterEvaluator) {
            return [];
        }

        const config = evaluationContext.getConfig();
        const minimumClusterSize = Number(clusterEvaluator.getMetadata?.().minimumClusterSize ?? 5);
        if (config.getReelsNumber() * config.getReelsSymbolsNumber() < minimumClusterSize) {
            return [
                {
                    code: "cluster-grid-too-small",
                    severity: "error",
                    message: `Cluster evaluator requires at least ${minimumClusterSize} cells, but the grid has only ${
                        config.getReelsNumber() * config.getReelsSymbolsNumber()
                    }.`,
                },
            ];
        }

        return [];
    }
}
