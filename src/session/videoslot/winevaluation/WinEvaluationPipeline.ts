import {ValidationResult} from "../../../validation/ValidationResult.js";
import {ValidationRule} from "../../../validation/ValidationRule.js";
import {ClusterWinComponent} from "./ClusterWinComponent.js";
import {ClusterGridValidationRule} from "./ClusterGridValidationRule.js";
import {ErrorOnIncompatibleWinAggregationPolicy} from "./ErrorOnIncompatibleWinAggregationPolicy.js";
import {IncompatibleWinEvaluatorsValidationRule} from "./IncompatibleWinEvaluatorsValidationRule.js";
import {LineWinComponent} from "./LineWinComponent.js";
import {MixedEvaluatorsPolicyInfoValidationRule} from "./MixedEvaluatorsPolicyInfoValidationRule.js";
import {MultiplierResolver} from "./MultiplierResolver.js";
import {ScatterWinComponent} from "./ScatterWinComponent.js";
import {UnusedMultiplierResolverValidationRule} from "./UnusedMultiplierResolverValidationRule.js";
import {ValueWinComponent} from "./ValueWinComponent.js";
import {WaysWinComponent} from "./WaysWinComponent.js";
import {WaysEvaluatorValidationRule} from "./WaysEvaluatorValidationRule.js";
import {WinAggregationPolicy} from "./WinAggregationPolicy.js";
import {WinComponent} from "./WinComponent.js";
import {WinEvaluationContext} from "./WinEvaluationContext.js";
import {WinEvaluationResult} from "./WinEvaluationResult.js";
import {WinEvaluationValidationContext} from "./WinEvaluationValidationContext.js";
import {WinEvaluator} from "./WinEvaluator.js";

export class WinEvaluationPipeline<T extends string | number | symbol = string> {
    private readonly evaluators: WinEvaluator<T>[];
    private readonly aggregationPolicy: WinAggregationPolicy<T>;
    private readonly multiplierResolver?: MultiplierResolver<T>;
    private readonly validationRules: ValidationRule<WinEvaluationValidationContext<T>>[];

    constructor(
        evaluators: WinEvaluator<T>[],
        aggregationPolicy?: WinAggregationPolicy<T>,
        multiplierResolver?: MultiplierResolver<T>,
        validationRules?: ValidationRule<WinEvaluationValidationContext<T>>[],
    ) {
        this.evaluators = [...evaluators];
        this.aggregationPolicy = aggregationPolicy ?? new ErrorOnIncompatibleWinAggregationPolicy<T>();
        this.multiplierResolver = multiplierResolver;
        this.validationRules = validationRules ?? [
            new IncompatibleWinEvaluatorsValidationRule<T>(),
            new UnusedMultiplierResolverValidationRule<T>(),
            new ClusterGridValidationRule<T>(),
            new WaysEvaluatorValidationRule<T>(),
            new MixedEvaluatorsPolicyInfoValidationRule<T>(),
        ];
    }

    public evaluate(context: WinEvaluationContext<T>): WinEvaluationResult<T> {
        const validation = this.validate(context);
        if (validation.hasErrors()) {
            throw new Error(validation.getIssues().map((issue) => issue.message).join("; "));
        }

        const componentsByEvaluator = this.evaluators.map((evaluator) => ({
            evaluator,
            components: evaluator.evaluate(context).map((component) => this.applyMultiplier(component, context)),
        }));
        const selectedComponents = this.aggregationPolicy.aggregate(componentsByEvaluator, context);

        return new WinEvaluationResult<T>({
            lineWins: selectedComponents.filter((component): component is LineWinComponent<T> => component instanceof LineWinComponent),
            scatterWins: selectedComponents.filter(
                (component): component is ScatterWinComponent<T> => component instanceof ScatterWinComponent,
            ),
            clusterWins: selectedComponents.filter(
                (component): component is ClusterWinComponent<T> => component instanceof ClusterWinComponent,
            ),
            waysWins: selectedComponents.filter((component): component is WaysWinComponent<T> => component instanceof WaysWinComponent),
            valueWins: selectedComponents.filter((component): component is ValueWinComponent<T> => component instanceof ValueWinComponent),
            winComponents: selectedComponents,
            metadata: {
                aggregationPolicy: this.aggregationPolicy.getPolicyName(),
                evaluators: this.evaluators.map((evaluator) => evaluator.getEvaluatorId()),
            },
            auditTrail: componentsByEvaluator.map(({evaluator, components}) => ({
                evaluatorId: evaluator.getEvaluatorId(),
                evaluatorGroup: evaluator.getEvaluatorGroup(),
                componentCount: components.length,
                totalWin: components.reduce((sum, component) => sum + component.getWinAmount(), 0),
            })),
        });
    }

    public validate(context?: WinEvaluationContext<T>): ValidationResult {
        return new WinEvaluationValidationContext<T>({
            evaluators: this.evaluators,
            aggregationPolicy: this.aggregationPolicy,
            multiplierResolver: this.multiplierResolver,
            evaluationContext: context,
        }).applyRules(this.validationRules);
    }

    public getAggregationPolicy(): WinAggregationPolicy<T> {
        return this.aggregationPolicy;
    }

    public getEvaluators(): WinEvaluator<T>[] {
        return [...this.evaluators];
    }

    public getValidationRules(): ValidationRule<WinEvaluationValidationContext<T>>[] {
        return [...this.validationRules];
    }

    private applyMultiplier(component: WinComponent<T>, context: WinEvaluationContext<T>): WinComponent<T> {
        if (!this.multiplierResolver) {
            return component;
        }
        const {winAmount, breakdown} = this.multiplierResolver.resolve(component, context);
        if (component instanceof LineWinComponent) {
            return new LineWinComponent<T>(component.getWinningLine(), component.getWinningPositions(), winAmount, breakdown);
        }
        if (component instanceof ScatterWinComponent) {
            return new ScatterWinComponent<T>(component.getWinningScatter(), winAmount, breakdown);
        }
        if (component instanceof ClusterWinComponent) {
            return new ClusterWinComponent<T>(component.getId(), component.getWinningCluster(), winAmount, breakdown);
        }
        if (component instanceof WaysWinComponent) {
            return new WaysWinComponent<T>(component.getWinningWay(), winAmount, breakdown);
        }
        if (component instanceof ValueWinComponent) {
            return new ValueWinComponent<T>(component.getWinningValue(), winAmount, breakdown);
        }
        return component;
    }
}
