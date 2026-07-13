import {PseudorandomNumberGenerator} from "../session/videoslot/combinations/PseudorandomNumberGenerator.js";
import type {RandomNumberGenerating} from "../session/videoslot/combinations/RandomNumberGenerating.js";
import {SeededRandomNumberGenerator} from "../session/videoslot/combinations/SeededRandomNumberGenerator.js";
import {CompositeReelStripConstraintValidator} from "./CompositeReelStripConstraintValidator.js";
import type {ReelStripConstraintValidator} from "./ReelStripConstraintValidator.js";
import type {ReelStripConstraintViolation} from "./ReelStripConstraintViolation.js";
import type {ReelStripDefinition} from "./ReelStripDefinition.js";
import type {ReelStripGenerationDiagnostic} from "./ReelStripGenerationDiagnostic.js";
import type {ReelStripGenerationRequest} from "./ReelStripGenerationRequest.js";
import type {ReelStripGenerationResult} from "./ReelStripGenerationResult.js";
import type {ReelStripGenerationStrategy} from "./ReelStripGenerationStrategy.js";
import type {ReelStripScorer} from "./ReelStripScorer.js";
import {ShuffleReelStripGenerationStrategy} from "./ShuffleReelStripGenerationStrategy.js";
import {ViolationCountReelStripScorer} from "./ViolationCountReelStripScorer.js";

const DEFAULT_MAX_ATTEMPTS = 200;

// Public entry point for generating a canonical reel strip under a set of constraints. This is a
// design-time tool for producing (or validating) the fixed symbol sequence a physical reel strip
// will ship with — deliberately decoupled from the runtime spin path (see
// SymbolsCombinationsGenerator in session/videoslot/combinations, which reads windows off an
// already-built SymbolsSequence at spin time).
//
// Tries up to `request.maxAttempts` candidates (from `strategy`), scores each with `scorer` after
// validating it against `request.constraints` (via `validator`), and keeps the best-scoring one —
// stopping early the first time a candidate satisfies every constraint.
export class ReelStripGenerator {
    private readonly strategy: ReelStripGenerationStrategy;
    private readonly validator: ReelStripConstraintValidator;
    private readonly scorer: ReelStripScorer;

    constructor(
        strategy: ReelStripGenerationStrategy = new ShuffleReelStripGenerationStrategy(),
        validator: ReelStripConstraintValidator = new CompositeReelStripConstraintValidator(),
        scorer: ReelStripScorer = new ViolationCountReelStripScorer(),
    ) {
        this.strategy = strategy;
        this.validator = validator;
        this.scorer = scorer;
    }

    public generate(request: ReelStripGenerationRequest): ReelStripGenerationResult {
        const requestViolations = this.validateRequestShape(request);
        if (requestViolations.length > 0) {
            return {
                success: false,
                attemptsUsed: 0,
                diagnostics: [{attempt: 0, accepted: false, violations: requestViolations}],
            };
        }

        const rng = this.createRng(request.seed);
        const scorer = request.scorer ?? this.scorer;
        const constraints = request.constraints ?? [];
        const maxAttempts = request.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

        const diagnostics: ReelStripGenerationDiagnostic[] = [];
        let best: {strip: ReelStripDefinition; violations: ReelStripConstraintViolation[]; score: number} | undefined;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const candidate = this.strategy.generateCandidate(request, rng);
            const violations = this.validator.validate(candidate, constraints);
            const score = scorer.score(candidate, violations);
            diagnostics.push({attempt, accepted: violations.length === 0, violations, score});

            if (!best || score > best.score) {
                best = {strip: candidate, violations, score};
            }
            if (violations.length === 0) {
                break;
            }
        }

        return {
            success: best !== undefined && best.violations.length === 0,
            strip: best?.strip,
            attemptsUsed: diagnostics.length,
            diagnostics,
        };
    }

    private createRng(seed: number | undefined): RandomNumberGenerating {
        return seed === undefined ? new PseudorandomNumberGenerator() : new SeededRandomNumberGenerator(seed);
    }

    private validateRequestShape(request: ReelStripGenerationRequest): ReelStripConstraintViolation[] {
        const violations: ReelStripConstraintViolation[] = [];

        if (!Number.isInteger(request.length) || request.length <= 0) {
            violations.push({
                constraintId: "request.length",
                message: `length must be a positive integer, got ${request.length}.`,
            });
            return violations;
        }

        const symbolCounts = request.symbolCounts ?? {};
        let totalSymbols = 0;
        let hasInvalidCount = false;
        for (const [symbolId, count] of Object.entries(symbolCounts)) {
            if (!Number.isInteger(count) || count < 0) {
                hasInvalidCount = true;
                violations.push({
                    constraintId: "request.symbolCounts",
                    message: `Symbol "${symbolId}" has an invalid count (${count}); counts must be non-negative integers.`,
                    details: {symbolId, count},
                });
                continue;
            }
            totalSymbols += count;
        }
        if (!hasInvalidCount && totalSymbols !== request.length) {
            violations.push({
                constraintId: "request.symbolCounts",
                message: `symbolCounts sum to ${totalSymbols}, but length is ${request.length} — they must be equal.`,
                details: {totalSymbols, length: request.length},
            });
        }

        const lockedPositions = request.lockedPositions ?? {};
        const lockedSymbolUsage: Record<string, number> = {};
        for (const [positionKey, symbolId] of Object.entries(lockedPositions)) {
            const position = Number(positionKey);
            if (!Number.isInteger(position) || position < 0 || position >= request.length) {
                violations.push({
                    constraintId: "request.lockedPositions",
                    message: `Locked position ${positionKey} is out of range for a strip of length ${request.length}.`,
                    details: {position: positionKey},
                });
                continue;
            }
            lockedSymbolUsage[symbolId] = (lockedSymbolUsage[symbolId] ?? 0) + 1;
        }
        for (const [symbolId, lockedCount] of Object.entries(lockedSymbolUsage)) {
            const availableCount = symbolCounts[symbolId] ?? 0;
            if (lockedCount > availableCount) {
                violations.push({
                    constraintId: "request.lockedPositions",
                    message: `${lockedCount} position(s) are locked to symbol "${symbolId}", but symbolCounts only provides ${availableCount}.`,
                    details: {symbolId, lockedCount, availableCount},
                });
            }
        }

        if (request.maxAttempts !== undefined && (!Number.isInteger(request.maxAttempts) || request.maxAttempts <= 0)) {
            violations.push({
                constraintId: "request.maxAttempts",
                message: `maxAttempts must be a positive integer, got ${request.maxAttempts}.`,
            });
        }

        return violations;
    }
}
