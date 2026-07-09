import {
    ErrorOnIncompatibleWinAggregationPolicy,
    LineWinCalculator,
    MultiplierResolver,
    ScatterWinCalculator,
    SelectedEvaluatorGroupWinAggregationPolicy,
    SumAllEnabledWinAggregationPolicy,
    SymbolsCombination,
    UnusedMultiplierResolverValidationRule,
    ValidationResult,
    VideoSlotConfig,
    VideoSlotWinCalculator,
    WaysWinCalculator,
    WinEvaluationValidationContext,
} from "pokie";

describe("ValidationResult", () => {
    test("hasErrors/hasWarnings/hasSeverity report on the issue severities actually present", () => {
        const result = new ValidationResult([
            {code: "a", severity: "info", message: "info issue"},
            {code: "b", severity: "warning", message: "warning issue"},
        ]);

        expect(result.hasErrors()).toBe(false);
        expect(result.hasWarnings()).toBe(true);
        expect(result.hasSeverity("info")).toBe(true);
        expect(result.hasSeverity("suggestion")).toBe(false);
    });

    test("an empty ValidationResult reports no errors/warnings of any severity", () => {
        const result = new ValidationResult();
        expect(result.hasErrors()).toBe(false);
        expect(result.hasWarnings()).toBe(false);
        expect(result.getIssues()).toEqual([]);
    });

    test("getIssues() defensively copies, so mutating the returned array/objects cannot corrupt internal state", () => {
        const result = new ValidationResult([{code: "a", severity: "error", message: "m", details: {x: 1}}]);

        const firstRead = result.getIssues();
        firstRead.push({code: "injected", severity: "error", message: "should not stick"});
        firstRead[0].details!.x = 999;

        const secondRead = result.getIssues();
        expect(secondRead).toHaveLength(1);
        expect(secondRead[0].details).toEqual({x: 1});
    });
});

describe("WaysEvaluatorValidationRule (via VideoSlotWinCalculator)", () => {
    test("warns when ways evaluation is enabled on a grid with fewer than 2 reels", () => {
        const config = new VideoSlotConfig();
        config.setReelsNumber(1);
        const calculator = new VideoSlotWinCalculator(
            config,
            new LineWinCalculator(config),
            new ScatterWinCalculator(config),
            undefined,
            undefined,
            new WaysWinCalculator(config),
            {aggregationPolicy: new SelectedEvaluatorGroupWinAggregationPolicy("ways")},
        );

        const validation = calculator.validateWinEvaluation(
            config.getAvailableBets()[0],
            new SymbolsCombination().fromMatrix([["A", "A", "A"]]),
        );

        expect(validation.getIssues().some((issue) => issue.code === "ways-grid-too-small" && issue.severity === "warning")).toBe(true);
        expect(validation.hasErrors()).toBe(false);
    });

    test("errors when ways evaluation is enabled on a grid with no visible rows", () => {
        const config = new VideoSlotConfig();
        config.setReelsSymbolsNumber(0);
        const calculator = new VideoSlotWinCalculator(
            config,
            new LineWinCalculator(config),
            new ScatterWinCalculator(config),
            undefined,
            undefined,
            new WaysWinCalculator(config),
            {aggregationPolicy: new SelectedEvaluatorGroupWinAggregationPolicy("ways")},
        );

        const validation = calculator.validateWinEvaluation(
            config.getAvailableBets()[0],
            new SymbolsCombination().fromMatrix([[], [], [], [], []]),
        );

        expect(validation.getIssues().some((issue) => issue.code === "ways-grid-has-no-visible-rows" && issue.severity === "error")).toBe(
            true,
        );
    });

    test("errors when ways evaluation is enabled but no non-wild non-scatter symbol can ever pay", () => {
        const config = new VideoSlotConfig();
        config.setAvailableSymbols(["W", "S"]);
        config.setWildSymbols(["W"]);
        config.setScatterSymbols(["S"]);
        const calculator = new VideoSlotWinCalculator(
            config,
            new LineWinCalculator(config),
            new ScatterWinCalculator(config),
            undefined,
            undefined,
            new WaysWinCalculator(config),
            {aggregationPolicy: new SelectedEvaluatorGroupWinAggregationPolicy("ways")},
        );

        const validation = calculator.validateWinEvaluation(
            config.getAvailableBets()[0],
            new SymbolsCombination().fromMatrix([
                ["W", "S", "W"],
                ["S", "W", "S"],
                ["W", "S", "W"],
                ["S", "W", "S"],
                ["W", "S", "W"],
            ]),
        );

        expect(validation.getIssues().some((issue) => issue.code === "ways-no-payable-symbols" && issue.severity === "error")).toBe(true);
    });
});

describe("MixedEvaluatorsPolicyInfoValidationRule (via VideoSlotWinCalculator)", () => {
    test("reports an info-level (not error/warning) issue naming the explicit policy when mixed evaluators are allowed", () => {
        const config = new VideoSlotConfig();
        config.setReelsNumber(3);
        const calculator = new VideoSlotWinCalculator(
            config,
            new LineWinCalculator(config),
            new ScatterWinCalculator(config),
            undefined,
            undefined,
            new WaysWinCalculator(config),
            {aggregationPolicy: new SumAllEnabledWinAggregationPolicy()},
        );

        const validation = calculator.validateWinEvaluation(
            config.getAvailableBets()[0],
            new SymbolsCombination().fromMatrix([
                ["A", "A", "K"],
                ["A", "A", "Q"],
                ["A", "K", "Q"],
            ]),
        );

        const issue = validation.getIssues().find((candidate) => candidate.code === "mixed-evaluators-explicit-policy");
        expect(issue?.severity).toBe("info");
        expect(issue?.message).toContain("sum-all-enabled");
        expect(validation.hasErrors()).toBe(false);
        expect(validation.hasWarnings()).toBe(false);
    });

    test("stays silent (no info issue) when only a single win-style group is enabled", () => {
        const config = new VideoSlotConfig();
        const calculator = new VideoSlotWinCalculator(config);

        const validation = calculator.validateWinEvaluation(
            config.getAvailableBets()[0],
            new SymbolsCombination().fromMatrix([
                ["A", "A", "A"],
                ["A", "K", "Q"],
                ["A", "K", "Q"],
                ["K", "Q", "J"],
                ["Q", "J", "10"],
            ]),
        );

        expect(validation.getIssues().some((issue) => issue.code === "mixed-evaluators-explicit-policy")).toBe(false);
    });
});

describe("UnusedMultiplierResolverValidationRule (unit-tested directly, since VideoSlotWinCalculator always enables line+scatter)", () => {
    test("warns when a multiplier resolver is configured but there are no win evaluators at all", () => {
        const context = new WinEvaluationValidationContext({
            evaluators: [],
            aggregationPolicy: new ErrorOnIncompatibleWinAggregationPolicy(),
            multiplierResolver: new MultiplierResolver({X2: 2}),
        });

        const issues = new UnusedMultiplierResolverValidationRule().validate(context);
        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatchObject({code: "unused-multiplier-resolver", severity: "warning"});
    });

    test("is silent when there is no multiplier resolver configured at all", () => {
        const context = new WinEvaluationValidationContext({
            evaluators: [],
            aggregationPolicy: new ErrorOnIncompatibleWinAggregationPolicy(),
        });

        expect(new UnusedMultiplierResolverValidationRule().validate(context)).toEqual([]);
    });
});
