import {definitionPreprocessingWork} from "./internal/definitionPreprocessingWork.js";
import {declaredAccountingOwnership, validateDeclaredContinuation} from "./internal/validateDeclaredContinuation.js";
import {canonicalDefinitionJson} from "../diff/MathDefinitionDiffer.js";
import {modelFieldPathSegments} from "../generated/internal/modelFieldPath.js";
import {resolveReelStripGeneration} from "../generated/resolveReelStripGeneration.js";
import {materializeReelStrips} from "../generated/materializeReelStrips.js";
import type {AdvancedBlueprintInput, AdvancedModelValidating, AdvancedModelValidationReport, AdvancedValidationCheck, AdvancedValidationOptions, DeclaredTransitionModel} from "./AdvancedModelValidation.js";
import {AnalysisBudget, AnalysisStopped} from "./internal/AnalysisBudget.js";
import {GameBlueprintValidator} from "../generated/GameBlueprintValidator.js";
import type {GameBlueprint} from "../generated/GameBlueprint.js";
import {SymbolsSequence} from "../session/videoslot/combinations/SymbolsSequence.js";
import {ScreenProjection} from "../session/videoslot/coordinates/ScreenProjection.js";
import {resolveBetModeCodegenWiring} from "../generated/resolveBetModeCodegenWiring.js";
import {validateExecutableState} from "../runtime/validateExecutableState.js";
import {validateMathDefinitionMaxWinPolicy} from "../diff/validateMathDefinitionMaxWinPolicy.js";
import {createAnalysisSession} from "./internal/createAnalysisSession.js";
import type {StakeAmountDetermining} from "../session/StakeAmountDetermining.js";
import type {LogicalRoundProgressProviding} from "../runtime/LogicalRound.js";
import type {SessionStateRestoring} from "../session/SessionStateRestoring.js";
import type {BetModeSelecting} from "../session/videoslot/betmode/BetModeSelecting.js";

class ChoiceRequired extends Error {
    constructor(public readonly size: number) {
        super("Enumerate entropy choice");
    }
}
const ASSUMPTIONS = [
    "Initial feature state is empty, collection starts at zero and is closed over reachable entry values; jackpot pools start at their declared seed; one paid-entry logical round is checked for every declared bet and executable mode.",
    "All positive-weight variants are possible. A variant is retained for the logical round; every circular stop window is possible on each draw. No probability is rounded to zero.",
    "Primitive RNG calls and support samplers are assumed to return; rejection-sampler divergence and arbitrary custom RNG code are outside the mechanic transition proof.",
    "Termination means normal feature settlement on all supported paths, not almost-sure termination or a particular finite PRNG seed. A runtime/numeric guard retaining an incomplete feature is not normal settlement.",
    "Money uses JavaScript binary64 and production handlers/evaluators. Accounting probes start at the charged stake; termination entry prefixes record sufficient funding explicitly. Lifetime counter overflow and arbitrary initial credits remain unsupported.",
];
/** Explicit asynchronous analysis; synchronous structural validation never calls this service. */
export class AdvancedModelValidator implements AdvancedModelValidating {
    public async validate(input: AdvancedBlueprintInput | DeclaredTransitionModel, options: AdvancedValidationOptions = {}): Promise<AdvancedModelValidationReport> {
        // Invalid options are caller errors, rather than a successful or partially analysed report.
        const budget = new AnalysisBudget(options);
        const report: AdvancedModelValidationReport = {
            schemaVersion: 1, scope: "declared-model", status: "complete", structuralValid: null,
            verdict: "inconclusive", executableFidelity: "unverified", adapter: "unavailable", declarationAuthority: "Caller-supplied declarative data", supportedChecks: [], termination: "all-path",
            assumptions: [], limitations: [], limits: budget.limits, work: budget.work, issues: [], checks: [],
        };
        try {
            budget.check();
            const data = await budget.detach(input) as AdvancedBlueprintInput | DeclaredTransitionModel;
            if (data.kind === "declared-transitions") await this.graph(data, report, budget);
            else if (data.kind === "blueprint") await this.blueprint(data, report, budget);
            else throw new Error("Unsupported analysis input kind.");
        } catch (error) {
            report.status = error instanceof AnalysisStopped ? error.reason : "failed";
            for (const family of ["reachability", "termination", "invariants"]) report.checks.push({id: `${family}.unresolved`, path: "$", status: "unknown", severity: "warning", message: "An unfinished analysis cannot prove this check.", assumptions: report.assumptions});
            report.limitations.push(error instanceof Error ? error.message : String(error));
            report.checks.push({id: "analysis.completion", path: "$", status: "unknown", severity: "warning", message: report.limitations[report.limitations.length - 1], assumptions: []});
        }
        report.supportedChecks = [...new Set(report.checks.filter(check => check.status !== "unknown").map(check => check.id))].sort();
        if (report.checks.some(check => check.status === "violation")) report.verdict = "violated";
        else if (report.status === "complete" && report.checks.length > 0 && report.checks.every(check => check.status === "pass")) report.verdict = "proved-within-assumptions";
        if (report.status === "complete" && report.verdict === "violated") report.status = "counterexample";
        if (report.status === "complete" && report.checks.some(check => check.status === "unknown")) report.status = "unsupported";
        return report;
    }

    private async add(report: AdvancedModelValidationReport, budget: AnalysisBudget, check: AdvancedValidationCheck): Promise<void> {
        // Never publish a partial witness as a complete one.
        try {
            const evidence = check.evidence === undefined ? undefined : await budget.detach(check.evidence, true);
            report.checks.push(evidence === undefined ? check : {...check, evidence});
        } catch (error) {
            if (error instanceof AnalysisStopped && check.status === "violation") report.checks.push({...check, evidence: {retained: false, reason: "Witness retention was interrupted; the diagnostic remains established."}});
            throw error;
        }
    }

    private async graph(model: DeclaredTransitionModel, report: AdvancedModelValidationReport, budget: AnalysisBudget): Promise<void> {
        report.adapter = "finite-transition-declaration-v1";
        report.declarationAuthority = "Caller-declared complete finite transition table; executable fidelity unverified";
        report.assumptions = ["The supplied transition table is the complete nondeterministic model; only positive-weight edges execute. Terminal states have no outgoing execution. This does not establish executable-code fidelity."];
        if (!Array.isArray(model.states) || !Array.isArray(model.transitions)) throw new Error("Finite declarations require states and transitions arrays.");
        const supportsSchema = (schema: DeclaredTransitionModel["schema"]): boolean => schema !== undefined && schema.kind !== "custom" && (!("base" in schema) || supportsSchema(schema.base));
        const stateSchemaSupported = supportsSchema(model.schema);
        const states = new Map(model.states.map(state => [state.id, state]));
        if (states.size !== model.states.length || !states.has(model.initial) || model.states.some(state => typeof state.id !== "string" || !state.id)) throw new Error("Finite declarations require unique state IDs and an existing initial state.");
        report.structuralValid = true;
        const stateIndices = new Map(model.states.map((state, index) => [state.id, index]));
        const adjacency = new Map<string, {edge: DeclaredTransitionModel["transitions"][number]; index: number}[]>();
        for (const [index, edge] of model.transitions.entries()) {
            budget.take("transitions");
            if (edge.weight !== undefined && (!Number.isFinite(edge.weight) || edge.weight < 0)) throw new Error(`Invalid transition weight at transitions.${index}.weight`);
            if (!states.has(edge.from)) throw new Error(`Unknown transition source at transitions.${index}.from`);
            if (edge.weight === 0) continue;
            const entries = adjacency.get(edge.from) ?? [];
            entries.push({edge, index});
            adjacency.set(edge.from, entries);
            await budget.yield();
        }
        const balances = new Map<string, number>();
        let snapshotsComplete = stateSchemaSupported;
        const visited = new Set<string>(),
            active = new Map<string, number>();
        const path: string[] = [];
        let cycleFound = false,
            illegal = false,
            invariant = false,
            accountingComplete = stateSchemaSupported;
        const visit = async (id: string): Promise<void> => {
            budget.depth(path.length);
            if (active.has(id)) {
                if (!cycleFound) {
                    cycleFound = true;
                    await this.add(report, budget, {id: "termination.all-path", path: `states.${stateIndices.get(id)}`, status: "violation", severity: "error", message: "Attainable repeatable cycle violates all-path termination; no probability claim is made.", assumptions: report.assumptions, evidence: {entryPrefix: path.slice(0, active.get(id)! + 1), cycle: [...path.slice(active.get(id)!), id]}});
                }
                return;
            }
            if (visited.has(id)) return;
            budget.take("states");
            visited.add(id);
            active.set(id, path.length);
            path.push(id);
            const state = states.get(id)!;
            if (!state.state) {
                snapshotsComplete = false;
                accountingComplete = false;
                report.checks.push({id: "invariants.executable-state", path: `states.${stateIndices.get(id)}.state`, status: "unknown", severity: "warning", message: "Reachable executable-state snapshot is missing.", assumptions: report.assumptions});
            }
            if (model.schema && stateSchemaSupported && state.state) {
                try {
                    validateExecutableState(state.state, model.schema);
                } catch (error) {
                    invariant = true;
                    await this.add(report, budget, {id: "invariants.executable-state", path: `states.${stateIndices.get(id)}.state`, status: "violation", severity: "error", message: error instanceof Error ? error.message : String(error), assumptions: report.assumptions, evidence: {path: [...path], actual: state.state, expected: "Production executable-state schema invariants"}});
                }
            }
            const pendingState = (value: unknown): boolean => {
                if (!value || typeof value !== "object") return false;
                const progress = value as Record<string, unknown>;
                return progress.active === true || Number(progress.remaining) > 0 || Number(progress.freeGamesSum) > Number(progress.freeGamesNum) || pendingState(progress.base);
            };
            if (state.terminal && stateSchemaSupported && pendingState(state.state)) {
                invariant = true;
                await this.add(report, budget, {id: "invariants.terminal-state", path: `states.${stateIndices.get(id)}.state`, status: "violation", severity: "error", message: "Declared terminal state still owns pending feature progress.", assumptions: report.assumptions, evidence: {path: [...path], before: state.state, after: state.state, expected: "No pending feature owner at completion", actual: state.state}});
            }
            if (!state.terminal && !(adjacency.get(id)?.length)) {
                illegal = true;
                await this.add(report, budget, {id: "transitions.deadlock", path: `states.${stateIndices.get(id)}`, status: "violation", severity: "error", message: "Reachable nonterminal state has no executable successor.", assumptions: report.assumptions, evidence: {path: [...path], before: state.state ?? {}, after: state.state ?? {}, expected: "An outgoing transition or explicit terminal state", actual: "Dead end"}});
            }
            for (const {edge, index} of adjacency.get(id) ?? []) {
                await budget.yield();
                budget.take("transitions");
                if (state.terminal || !states.has(edge.to)) {
                    illegal = true;
                    await this.add(report, budget, {id: "transitions.target", path: `transitions.${index}`, status: "violation", severity: "error", message: state.terminal ? "A terminal state declares an executable transition." : "Transition target does not exist.", assumptions: report.assumptions, evidence: {path: [...path], transition: edge, before: edge.before ?? state.state ?? {}, after: edge.after ?? states.get(edge.to)?.state ?? {}, expected: "Existing target from a nonterminal owner", actual: edge.to}});
                    continue;
                }
                try {
                    if (edge.before && canonicalDefinitionJson(edge.before) !== canonicalDefinitionJson(state.state ?? {})) throw new Error("Transition before-state differs from its source owner.");
                    if (edge.after && canonicalDefinitionJson(edge.after) !== canonicalDefinitionJson(states.get(edge.to)?.state ?? {})) throw new Error("Transition after-state differs from its target owner.");
                    if (model.schema && stateSchemaSupported) {
                        const beforeState = edge.before ?? state.state;
                        const afterState = edge.after ?? states.get(edge.to)?.state;
                        if (afterState) validateExecutableState(afterState, model.schema);
                        if (beforeState && afterState) validateDeclaredContinuation(beforeState, afterState, model.schema);
                    }
                } catch (error) {
                    invariant = true;
                    await this.add(report, budget, {id: "invariants.transition-state", path: `transitions.${index}`, status: "violation", severity: "error", message: error instanceof Error ? error.message : String(error), assumptions: report.assumptions, evidence: {path: [...path, edge.to], transition: edge, before: edge.before ?? state.state ?? {}, after: edge.after ?? states.get(edge.to)?.state ?? {}, expected: "Owned source/target snapshots and executable-state invariants", actual: edge}});
                }
                const money = edge.accounting;
                if (!money) accountingComplete = false;
                if (money) {
                    let ownership: ReturnType<typeof declaredAccountingOwnership>;
                    if (model.schema && stateSchemaSupported && state.state && states.get(edge.to)?.state) {
                        try {
                            ownership = declaredAccountingOwnership(state.state, states.get(edge.to)!.state!, model.schema);
                        } catch {
                            // Malformed snapshots already carry an executable-state witness.
                            ownership = undefined;
                        }
                    }
                    if (!ownership?.complete) accountingComplete = false;
                    const disconnected = edge.from === edge.to && money.creditsBefore !== money.creditsAfter || [
                        [edge.from, money.creditsBefore], [edge.to, money.creditsAfter],
                    ].find(([owner, balance]) => balances.has(owner as string) && balances.get(owner as string) !== balance);
                    const ownedBefore = balances.get(edge.from);
                    const ownedAfter = balances.get(edge.to);
                    if (!balances.has(edge.from)) balances.set(edge.from, money.creditsBefore);
                    if (!balances.has(edge.to)) balances.set(edge.to, money.creditsAfter);
                    const ownershipMismatch = ownership && (ownership.continuation !== (money.continuation ?? false) || ownership.bet !== undefined && ownership.bet !== money.bet || ownership.complete && (money.multiplier ?? 1) !== 1);
                    const expectedStake = money.continuation ? 0 : money.bet * (money.multiplier ?? 1);
                    const expectedCredits = money.creditsBefore - money.stake + money.payout;
                    if (![money.creditsBefore, money.creditsAfter, money.stake, money.payout, money.bet, money.multiplier ?? 1].every(value => Number.isFinite(value) && value >= 0) || money.bet <= 0 || money.stake !== expectedStake || money.creditsAfter !== expectedCredits || ownershipMismatch || disconnected) {
                        invariant = true;
                        let message = "Stake or wallet conservation violated.";
                        if (ownershipMismatch) message = "Accounting denomination or continuation ownership differs from the executable state.";
                        if (disconnected) message = "Connected transitions disagree on their shared wallet balance.";
                        await this.add(report, budget, {id: "invariants.money", path: `transitions.${index}.accounting`, status: "violation", severity: "error", message, assumptions: report.assumptions, evidence: {path: [...path, edge.to], transition: edge, before: edge.before ?? state.state ?? {}, after: edge.after ?? states.get(edge.to)?.state ?? {}, expected: {stake: expectedStake, creditsAfter: expectedCredits, ...(ownership ? {ownership} : {}), ...(ownedBefore !== undefined || ownedAfter !== undefined ? {connectedBalances: {before: ownedBefore, after: ownedAfter}} : {})}, actual: money}});
                    }
                }
                await visit(edge.to);
            }
            path.pop();
            active.delete(id);
        };
        await visit(model.initial);
        report.checks.push({id: "invariants.state-support", path: "schema", status: snapshotsComplete && !invariant ? "pass" : "unknown", severity: snapshotsComplete && !invariant ? "info" : "warning", message: "State invariants require a supported production executable-state schema and every reachable snapshot; table topology alone does not establish them.", assumptions: report.assumptions});
        for (const [index, target] of (model.targets ?? []).entries()) await this.add(report, budget, {id: "reachability.target", path: `targets.${index}`, status: visited.has(target) ? "pass" : "violation", severity: visited.has(target) ? "info" : "error", message: visited.has(target) ? "Target is attainable." : "No positive-weight transition from the complete reachable region enters the target.", assumptions: report.assumptions, evidence: {target, exploredRegion: [...visited], complete: true}});
        for (const [id, failed] of [["termination.all-path", cycleFound], ["transitions.target", illegal], ["invariants.money", invariant]] as const) if (!failed) report.checks.push({id, path: "$", status: id === "invariants.money" && !accountingComplete ? "unknown" : "pass", severity: id === "invariants.money" && !accountingComplete ? "warning" : "info", message: id === "invariants.money" && !accountingComplete ? "Reachable accounting requires connected balances and state evidence for denomination, continuation ownership and selected-mode cost; omitted relationships remain unsupported." : "Complete reachable transition table checked.", assumptions: report.assumptions});
    }

    private async blueprint(input: AdvancedBlueprintInput, report: AdvancedModelValidationReport, budget: AnalysisBudget): Promise<void> {
        report.adapter = "blueprint-runtime-v1";
        report.declarationAuthority = "Blueprint declaration interpreted by POKIE built-in runtime contracts";
        report.executableFidelity = "declarative-runtime-contract";
        report.assumptions = [...ASSUMPTIONS];
        let model = input.model as GameBlueprint;
        // Bound geometry before the structural validator can allocate paylines or other arrays.
        if (model && (model.reels > budget.limits.inputNodes || model.rows > budget.limits.inputNodes || model.reels * model.rows > budget.limits.inputNodes)) throw new AnalysisStopped("budget-exhausted", "Geometry exceeds preprocessing budget.");
        const symbolCount = Array.isArray(model?.symbols) ? model.symbols.length : 0;
        const betCount = Array.isArray(model?.availableBets) ? model.availableBets.length : 11;
        const generatedRows = model?.screenGeometry?.generated?.rows ?? model?.rows;
        const boardCells = Number.isSafeInteger(model?.reels) && Number.isSafeInteger(generatedRows) && model.reels > 0 && generatedRows > 0 ? model.reels * generatedRows : 0;
        const preparationWork = boardCells + symbolCount * Math.max(1, Number.isSafeInteger(model?.reels) && model.reels > 0 ? model.reels : 1) * betCount;
        budget.take("inputNodes", definitionPreprocessingWork(model ?? {}));
        await budget.yield();
        report.issues = new GameBlueprintValidator().validate(model);
        report.structuralValid = !report.issues.some(issue => issue.severity === "error");
        if (!report.structuralValid) {
            report.status = "invalid";
            for (const issue of report.issues.filter(issue => issue.severity === "error")) {
                let actual: unknown = model;
                for (const key of modelFieldPathSegments(issue.path ?? "") ?? []) actual = actual && typeof actual === "object" ? Reflect.get(actual, key) : undefined;
                await this.add(report, budget, {id: `structure.${issue.code}`, path: issue.path ?? "$", status: "violation", severity: "error", message: issue.message, assumptions: [], evidence: {phase: "declaration", expected: issue.message, actual: issue.path ? actual : issue.code}});
            }
            return;
        }
        if (input.maxWinPolicy) validateMathDefinitionMaxWinPolicy(input.maxWinPolicy);
        let definitions = model.reelSequences;
        if (!definitions && model.reelStrips) definitions = model.reelStrips.map(symbols => ({type: "exact", symbols}));
        if (!definitions && model.reelStripGeneration?.every(reel => reel.type === "literal")) definitions = model.reelStripGeneration.map(reel => ({type: "exact", symbols: reel.type === "literal" ? reel.strip : []}));
        if (!definitions) {
            await budget.yield();
            const resolved = resolveReelStripGeneration(model);
            if (!resolved.success) throw new Error("Declared reel generation constraints cannot be satisfied.");
            model = materializeReelStrips(model, resolved.reelStripGeneration);
            budget.check();
            definitions = model.reelSequences ?? model.reelStrips!.map(symbols => ({type: "exact", symbols}));
        }
        const alternatives = definitions.map(reel => reel.type === "exact" ? [{id: "exact", symbols: reel.symbols}] : reel.variants.filter(variant => variant.weight > 0));
        const targets = new Map<string, boolean>();
        for (const name of ["freeGames", "respins", "holdAndWin", "weightedBonus", "collection", "jackpot"] as const) if (model.mechanics?.[name]) targets.set(`mechanics.${name}`, name === "freeGames" && Object.values(model.mechanics.freeGames!.awardsByCount).every(grant => grant === 0) || name === "respins" && model.mechanics.respins!.grant === 0);
        const attainableCounts = new Map<string, Set<number>>();
        const recordCount = (target: string, count: number): void => {
            const counts = attainableCounts.get(target) ?? new Set<number>();
            counts.add(count);
            attainableCounts.set(target, counts);
        };
        let nonterminating = false,
            failed = false,
            unsupported = false;
        const wiring = resolveBetModeCodegenWiring(model);
        const modes = wiring ? model.betModes! : [undefined];
        const collectionValues = new Set<number>([0]);
        let initialCollection = 0;
        const expand = async (index: number, strips: string[][], variants: string[]): Promise<void> => {
            budget.depth(index);
            if (index < alternatives.length) {
                for (const variant of alternatives[index]) await expand(index + 1, [...strips, [...variant.symbols]], [...variants, variant.id]);
                return;
            }
            const screens: string[][][] = [],
                stops: number[][] = [];
            const windows = async (reel: number, screen: string[][], positions: number[]): Promise<void> => {
                if (reel === strips.length) {
                    budget.take("outcomes");
                    screens.push(screen);
                    stops.push(positions);
                    return;
                }
                budget.take("outcomeCells", strips[reel].length);
                const sequence = new SymbolsSequence<string>().fromArray(strips[reel]);
                for (let stop = 0; stop < strips[reel].length; stop++) {
                    budget.take("transitions");
                    await budget.yield();
                    budget.take("outcomeCells", model.screenGeometry?.generated.rows ?? model.rows);
                    await windows(reel + 1, [...screen, sequence.getSymbols(stop, model.screenGeometry?.generated.rows ?? model.rows)], [...positions, stop]);
                }
            };
            await windows(0, [], []);
            const free = model.mechanics?.freeGames;
            let repeating: {screen: string[][]; stops: number[]; grant: number} | undefined;
            for (const [screenIndex, screen] of screens.entries()) {
                const evaluated = model.screenGeometry ? new ScreenProjection(model.screenGeometry).project(screen, "evaluated") : screen;
                const count = (symbol: string) => evaluated.flat().filter(cell => cell === symbol).length;
                if (free) {
                    const grant = free.awardsByCount[String(count(free.scatterSymbol))] ?? 0;
                    if (grant > 0 && !model.mechanics?.modifiers) repeating ??= {screen, stops: stops[screenIndex], grant};
                }
                const mechanics = model.mechanics;
                if (free) recordCount("mechanics.freeGames", count(free.scatterSymbol));
                if (mechanics?.respins) recordCount("mechanics.respins", count(mechanics.respins.trigger.symbolId));
                if (mechanics?.weightedBonus) recordCount("mechanics.weightedBonus", count(mechanics.weightedBonus.trigger.symbolId));
                if (mechanics?.holdAndWin) recordCount("mechanics.holdAndWin", evaluated.flat().filter(symbol => Reflect.apply(Object.prototype.hasOwnProperty, mechanics.holdAndWin!.symbolEffects, [symbol])).length);
                if (mechanics?.jackpot) recordCount("mechanics.jackpot", count(mechanics.jackpot.trigger.symbolId));
                if (mechanics?.collection) recordCount("mechanics.collection", count(mechanics.collection.symbolId));
                if (!mechanics?.cascade && !mechanics?.modifiers) {
                    if (free && (free.awardsByCount[String(count(free.scatterSymbol))] ?? 0) > 0) targets.set("mechanics.freeGames", true);
                    if (mechanics?.respins && mechanics.respins.grant > 0 && count(mechanics.respins.trigger.symbolId) >= mechanics.respins.trigger.minimumCount) targets.set("mechanics.respins", true);
                    if (mechanics?.weightedBonus && count(mechanics.weightedBonus.trigger.symbolId) >= mechanics.weightedBonus.trigger.minimumCount) targets.set("mechanics.weightedBonus", true);
                    if (mechanics?.holdAndWin && evaluated.flat().filter(symbol => Reflect.apply(Object.prototype.hasOwnProperty, mechanics.holdAndWin!.symbolEffects, [symbol])).length >= mechanics.holdAndWin.minimumCount) targets.set("mechanics.holdAndWin", true);
                    if (mechanics?.jackpot && count(mechanics.jackpot.trigger.symbolId) >= mechanics.jackpot.trigger.minimumCount) targets.set("mechanics.jackpot", true);
                }
            }
            if (wiring?.buyFeatureModes.length) targets.set("mechanics.freeGames", true);
            if (repeating) {
                budget.take("states");
                budget.take("transitions", 2);
                // Invoke the actual handler twice to retain a before/after accounting witness.
                const selected = screens.findIndex(screen => screen === repeating!.screen);
                budget.take("transitions", preparationWork);
                const probe = createAnalysisSession(model, strips, screens, () => selected, () => budget.take("outcomeCells", boardCells));
                const bet = (model.availableBets ?? [1])[0];
                probe.session.setBet(bet);
                const chargedStake = (probe.session as Partial<StakeAmountDetermining>).getStakeAmount?.() ?? bet;
                const creditsBefore = Math.max(bet, chargedStake);
                probe.session.setCreditsAmount(creditsBefore);
                budget.take("outcomeCells", 3 * strips.reduce((sum, strip) => sum + strip.length, 0));
                const capture = () => (probe.session as unknown as {toSessionState(): unknown}).toSessionState();
                const entryBefore = capture();
                probe.start();
                try {
                    if (!probe.session.canPlayNextGame()) throw new Error("Declared repeating entry is blocked despite its explicit funding.");
                    probe.session.play();
                    const before = capture();
                    const creditsAfterEntry = probe.session.getCreditsAmount();
                    probe.session.play();
                    const after = capture();
                    validateExecutableState(after, (probe.session as unknown as SessionStateRestoring).getSessionStateSchema!());
                    nonterminating = true;
                    await this.add(report, budget, {id: "termination.free-games", path: "mechanics.freeGames.awardsByCount", status: "violation", severity: "error", message: "Attainable additive grants prevent guaranteed normal feature settlement under supported entropy.", assumptions: report.assumptions, evidence: {entryPrefix: [{variants, stops: repeating.stops, screen: repeating.screen, grant: repeating.grant, bet, chargedStake, creditsBefore, creditsAfterEntry, ...(wiring ? {mode: wiring.defaultModeId} : {})}], repeat: {stops: repeating.stops, before, after, remainingDelta: repeating.grant - 1}, proof: "remaining' = remaining - 1 + grant; grant >= 1 preserves a positive pending count in the declared counter recurrence. Cumulative counters are not claimed to repeat; numeric/execution guards would retain or reject incomplete progress, not establish settlement.", probability: "No almost-sure claim; a repeatable supported path with an exit still defeats all-path normal settlement."}});
                } catch (error) {
                    if (error instanceof AnalysisStopped) throw error;
                    failed = true;
                    await this.add(report, budget, {id: "invariants.runtime-transition", path: "mechanics.freeGames", status: "violation", severity: "error", message: error instanceof Error ? error.message : String(error), assumptions: report.assumptions, evidence: {phase: "entry/retrigger", bet, chargedStake, creditsBefore, variants, stops: repeating.stops, before: entryBefore, after: capture(), expected: "Finite accepted entry/retrigger with valid executable state", actual: "Runtime or state validator rejected the entry prefix"}});
                }
                // Unbounded bank/counter arithmetic cannot be certified by a finite prefix.
                unsupported = true;
                return;
            }
            for (const bet of model.availableBets ?? [1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 100]) for (const mode of modes) {
                const pending: number[][] = [[]];
                while (pending.length) {
                    budget.take("states");
                    await budget.yield();
                    const prefix = pending.pop()!;
                    let cursor = 0,
                        rounds = 0,
                        totalWin = 0,
                        totalStake = 0;
                    const path: unknown[] = [];
                    const draws: {phase: string; stops: number[]; screen: string[][]}[] = [];
                    let attemptedBefore: unknown;
                    budget.take("transitions", preparationWork);
                    const probe = createAnalysisSession(model, strips, screens, size => {
                        budget.take("transitions");
                        if (size === 1) return 0;
                        if (cursor >= prefix.length) throw new ChoiceRequired(size);
                        return prefix[cursor++];
                    }, (index, initialization) => {
                        budget.take("outcomeCells", boardCells);
                        draws.push({phase: initialization ? "initialization" : "execution", stops: stops[index], screen: screens[index]});
                    });
                    const session = probe.session as typeof probe.session & Partial<StakeAmountDetermining & LogicalRoundProgressProviding & BetModeSelecting> & {toSessionState(): unknown};
                    if (model.mechanics?.collection) {
                        const saved = session.toSessionState() as {value: number};
                        saved.value = initialCollection;
                        (session as unknown as {fromSessionState(value: unknown): void}).fromSessionState(saved);
                    }
                    session.setBet(bet);
                    if (mode) session.setBetMode!(mode.id);
                    const charged = bet * (mode?.costMultiplier ?? 1);
                    session.setCreditsAmount(charged);
                    probe.start();
                    try {
                        do {
                            budget.depth(++rounds);
                            budget.take("transitions");
                            budget.take("outcomeCells", 2 * strips.reduce((sum, strip) => sum + strip.length, 0));
                            const before = session.toSessionState();
                            attemptedBefore = before;
                            const credits = session.getCreditsAmount();
                            const stake = session.getStakeAmount?.() ?? bet;
                            const expectedStake = rounds === 1 ? charged : 0;
                            if (!session.canPlayNextGame()) throw new Error(`Entry/continuation is blocked with credits=${credits}, declared stake=${stake}, bet=${bet}.`);
                            session.play();
                            const win = session.getWinAmount();
                            totalWin += win;
                            totalStake += stake;
                            const after = session.toSessionState();
                            validateExecutableState(after, (session as unknown as SessionStateRestoring).getSessionStateSchema!());
                            path.push({choices: prefix.slice(0, cursor), before, after, stake, win, creditsBefore: credits, creditsAfter: session.getCreditsAmount()});
                            if (stake !== expectedStake || ![win, session.getCreditsAmount(), totalWin, totalStake].every(value => Number.isFinite(value) && value >= 0)) throw new Error("Finite nonnegative payout or entry/continuation stake invariant violated.");
                            const observe = (state: unknown): void => {
                                if (!state || typeof state !== "object") return;
                                const data = state as Record<string, unknown>;
                                if (Number(data.freeGamesSum) > 0) targets.set("mechanics.freeGames", true);
                                if (Array.isArray(data.lockedSymbols) && data.lockedSymbols.length > 0) targets.set("mechanics.holdAndWin", true);
                                if (data.bonus && (data.bonus as {selection?: unknown}).selection) targets.set("mechanics.weightedBonus", true);
                                if (data.poolStatistics && Object.values(data.poolStatistics).some(stats => (stats as {awardCount: number}).awardCount > 0)) targets.set("mechanics.jackpot", true);
                                if (data.base) observe(data.base);
                            };
                            observe(after);
                            for (const [target] of targets) {
                                const bounded = (session as unknown as {getBoundedMechanicObservation?: () => {collection?: {triggered: boolean}}}).getBoundedMechanicObservation?.();
                                if (target === "mechanics.respins" && (bounded as {respins?: {granted: number}})?.respins?.granted) targets.set(target, true);
                                if (target === "mechanics.collection" && bounded?.collection?.triggered) targets.set(target, true);
                            }
                        } while (session.hasPendingLogicalRound?.());
                        if (model.mechanics?.collection) {
                            const nextValue = (session.toSessionState() as {value: number}).value;
                            if (!collectionValues.has(nextValue)) {
                                budget.take("states");
                                collectionValues.add(nextValue);
                            }
                        }
                        const expected = charged - totalStake + totalWin;
                        if (Math.abs(session.getCreditsAmount() - expected) > 32 * Number.EPSILON * Math.max(Math.abs(expected), Math.abs(session.getCreditsAmount()), bet)) throw new Error(`Completion conservation violated: expected ${expected}, actual ${session.getCreditsAmount()}.`);
                        const policy = input.maxWinPolicy;
                        if (policy?.type === "declared") {
                            const payout = policy.scope === "paid-entry" ? Number((path[0] as {win: number}).win) : totalWin;
                            const limit = policy.value * (policy.unit === "currency" ? 1 : bet);
                            if (payout > limit) {
                                failed = true;
                                await this.add(report, budget, {id: "invariants.max-win", path: "maxWinPolicy", status: "violation", severity: "error", message: "Attainable payout exceeds the declaration; no runtime cap is installed.", assumptions: report.assumptions, evidence: {bet, mode: mode?.id, variants, path, expected: {maximum: limit, unit: policy.unit, scope: policy.scope}, actual: payout}});
                            }
                        }
                    } catch (error) {
                        if (error instanceof ChoiceRequired) {
                            // Bound frontier allocation before retaining choices.
                            budget.take("outcomes", error.size);
                            for (let choice = error.size - 1; choice >= 0; choice--) pending.push([...prefix, choice]);
                            continue;
                        }
                        if (error instanceof AnalysisStopped) throw error;
                        failed = true;
                        await this.add(report, budget, {id: "invariants.runtime-transition", path: "mechanics", status: "violation", severity: "error", message: error instanceof Error ? error.message : String(error), assumptions: report.assumptions, evidence: {bet, ...(mode ? {mode: mode.id} : {}), variants, choices: prefix, draws, before: attemptedBefore, after: session.toSessionState(), path, expected: "Accepted finite runtime transition and completion conservation", actual: "Runtime rejected transition (cascade exhaustion is not ordinary settlement)."}});
                    }
                }
            }
        };
        for (const value of collectionValues) {
            initialCollection = value;
            await expand(0, [], []);
        }
        if (model.mechanics?.collection) report.assumptions.push("Collection entry values are exhaustively closed across paid rounds; credits and cumulative statistics are reset between entries because they do not affect collection transitions, under the stated wallet/counter assumptions.");
        for (const [target, reached] of targets) {
            // These stateful effects need actual traversal evidence, not a symbol membership guess.
            const incompleteReachability = (!reached && (model.mechanics?.cascade || model.mechanics?.modifiers));
            let reachabilityStatus: AdvancedValidationCheck["status"] = "pass";
            let reachabilitySeverity: AdvancedValidationCheck["severity"] = "info";
            let reachabilityMessage = "Entry is attainable within declared initial-state assumptions (or the grant is explicitly zero).";
            if (!reached) {
                reachabilityStatus = "violation";
                reachabilitySeverity = "error";
                reachabilityMessage = "No entry condition is satisfied by any evaluated circular stop window in the complete positive-weight support.";
                if (incompleteReachability) {
                    reachabilityStatus = "unknown";
                    reachabilitySeverity = "warning";
                    reachabilityMessage = "Stateful entry reachability is unresolved by this adapter.";
                }
            }
            await this.add(report, budget, {id: "reachability.feature", path: target, status: reachabilityStatus, severity: reachabilitySeverity, message: reachabilityMessage, assumptions: report.assumptions, evidence: {target, completeScreenSupport: true, exploredOutcomes: budget.work.outcomes, blockingCondition: "No supported entry satisfies the declared predicate in this closed region", declaration: Reflect.get(model.mechanics ?? {}, target.split(".")[1]), attainableTriggerCounts: [...(attainableCounts.get(target) ?? [])].sort((a, b) => a - b), ...(target === "mechanics.collection" ? {reachableEntryValues: [...collectionValues].sort((a, b) => a - b)} : {}), supportRegion: alternatives.map((variants, reel) => ({reel, variants: variants.map(variant => ({id: variant.id, stopCount: variant.symbols.length})), allCircularStops: true})), geometry: model.screenGeometry ?? {reels: model.reels, rows: model.rows}}});
        }
        if (targets.size === 0) report.checks.push({id: "reachability.feature", path: "mechanics", status: "pass", severity: "info", message: "No feature targets are declared.", assumptions: report.assumptions});
        if (!nonterminating) report.checks.push({id: "termination.all-path", path: "mechanics", status: failed ? "unknown" : "pass", severity: failed ? "warning" : "info", message: failed ? "A runtime transition was rejected; normal all-path settlement is not established. Runtime bounds are distinct from analysis exhaustion." : "All explored logical rounds settled. Built-in respins consume a lifetime maxRespins budget; HoldAndWin resets require a new lock on a finite board.", assumptions: report.assumptions});
        let invariantStatus: AdvancedValidationCheck["status"] = failed ? "violation" : "pass";
        let invariantSeverity: AdvancedValidationCheck["severity"] = failed ? "error" : "info";
        if (unsupported) {
            invariantStatus = "unknown";
            invariantSeverity = "warning";
        }
        report.checks.push({id: "invariants.runtime", path: "mechanics", status: invariantStatus, severity: invariantSeverity, message: unsupported ? "Unbounded feature counters/banks require an additional numeric bound." : "Production transition accounting and completion conservation checked from declared initial state.", assumptions: report.assumptions});
        if (input.maxWinPolicy?.type === "unknown") report.checks.push({id: "invariants.max-win", path: "maxWinPolicy", status: "unknown", severity: "warning", message: input.maxWinPolicy.authority, assumptions: report.assumptions});
        if (model.mechanics?.jackpot?.pool.type === "accumulating" || model.mechanics?.modifiers) {
            report.limitations.push("Persistent jackpot balances and modifier state outside the initial logical round are not abstracted away or certified.");
            report.checks.push({id: "invariants.persistent-state", path: "mechanics", status: "unknown", severity: "warning", message: report.limitations[report.limitations.length - 1], assumptions: report.assumptions});
        }
    }
}
