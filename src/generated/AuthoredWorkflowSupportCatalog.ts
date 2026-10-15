import {
    AUTHORED_MECHANIC_CATALOG,
    AUTHORED_MODIFIER_CATALOG,
    AUTHORED_BOUNDED_MECHANIC_CATALOG,
} from "./AuthoredMechanicCatalog.js";

/** Authoring/workflow coverage; deliberately separate from random-strategy compatibility. */
export const MANDATORY_AUTHORED_FAMILIES = [
    "freeGames/retrigger",
    "Hold&Win",
    "Jackpot",
    "BetMode",
    "wild variants",
    "multipliers",
    "cascade/respins",
    "collections/accumulators",
    "transforms/reel modifiers",
    "weighted bonus outcomes",
] as const;
export const AUTHORED_WORKFLOW_SURFACES = [
    "core",
    "schema",
    "editor",
    "build",
    "runtime-restore",
    "simulation-report",
    "extraction",
    "PAR",
    "replay",
] as const;
type Family = (typeof MANDATORY_AUTHORED_FAMILIES)[number];
type Surface = (typeof AUTHORED_WORKFLOW_SURFACES)[number];
export type AuthoredWorkflowCell = {
    variant: string;
    assertion: string;
    negativeAssertion: string;
    dataFixture: string;
    additionalExactFixtures?: readonly string[];
    additionalNegativeFixtures?: readonly string[];
    exactFixture: string;
    negativeFixture: string;
    testOwner: string;
};
export interface AuthoredWorkflowSupportDescribing {
    id: string;
    families: readonly Family[];
    cells: Record<Surface, AuthoredWorkflowCell>;
}
type SurfaceCase = readonly [test: string, assertion: string];
type WorkflowCases = Record<Surface, SurfaceCase>;
const existingWorkflow = "$id: validation/build/extraction/real XLSX/seeded continuation/replay/simulation/report";
const modifierWorkflow = "$id/$type: CLI/services, Play, generated CJS/TS, XLSX, extraction, sim/report/replay preserve rules";
const boundedWorkflow = "%s real CLI/Studio authoring, XLSX, extraction, play, report/download and replay services";
const bonusWorkflow = "real CLI/Studio authoring, XLSX, extraction, play, report/download and replay services";
const editorCase = ": Home JSON retains catalogue rules and blocks invalid publication";
const cases: Record<string, WorkflowCases> = {
    ExistingMechanicsAuthoring: {
        core: ["$id: exact grants, locks, awards, reset and mode lifecycle", "Seed 31 scripted reels assert zero grant, 2→4 additive grant, bank 0.3; lock budgets 2/1/2/1/0 and payout 6 or 0.3; jackpot contribution, award/reset; base/ante and one-shot purchase as applicable."],
        schema: [existingWorkflow, "The row's Blueprint has no validation errors before generation."],
        editor: ["$id" + editorCase, "Home JSON→Form→JSON preserves this row's mechanics and modes before any write."],
        build: [existingWorkflow, "Generated package bytes equal the renderer; CJS and TypeScript sessions agree over 35 accepted plays."],
        "runtime-restore": [existingWorkflow, "Each of 35 captured states restores in a fresh instance; subsequent executable states and network results agree."],
        "simulation-report": ["$id: actual Studio runner retains selected/all-mode report presentation and downloads", "Actual Studio reports retain mode, money and jackpot statistics through JSON/Markdown/HTML downloads."],
        extraction: [existingWorkflow, "Complete descriptor extraction retains this row's mechanics; rebuilt seeded execution equals the original."],
        PAR: [existingWorkflow, "Real CLI and library XLSX import retain mechanics and Blueprint hash; rebuilt sessions match executable states."],
        replay: [existingWorkflow, "CLI seeded artifacts match the recorder for every mode; JSON audit replay verifies canonical events."],
    },
    WildModifierAuthoring: {
        core: [modifierWorkflow, "For each lines/ways/clusters evaluator and denomination: restricted factor 2 pays bet×20, other variants factor 6 pay bet×60; exact evaluated screen and multiplier attribution agree."],
        schema: [modifierWorkflow, "Each variant/evaluator fixture validates without errors before generation."],
        editor: ["%s" + editorCase, "Home JSON→Form→JSON retains this exact modifier variant's rules, factors and restrictions without writing."],
        build: [modifierWorkflow, "CLI generation, CJS and TypeScript retain seeded screens, payouts and executable state for all three evaluators."],
        "runtime-restore": [modifierWorkflow, "Fresh JSON restoration preserves continuation screen, payout, network payload and next RNG for each evaluator."],
        "simulation-report": [modifierWorkflow, "CLI simulation observes exactly eight modifier steps and renders those observations in all three report formats."],
        extraction: [modifierWorkflow, "Descriptor extraction retains modifiers and rebuilt execution matches original/direct sessions."],
        PAR: [modifierWorkflow, "Real CLI XLSX import retains modifiers and Blueprint hash; rebuilt execution matches all three evaluators."],
        replay: [modifierWorkflow, "Seeded replay of the extracted model matches money and screen; real CLI replay matches the same screen."],
    },
    CascadeCollectionAuthoring: {
        core: ["%s exact terminal budget and collection awards", "Constant C fixture: one paid entry, zero-winning terminal cascade, at most eight respins; combined collection pays 60 with zero carry, standalone second entry pays 10 with carry 1; duplicates do not execute."],
        schema: [boundedWorkflow, "CLI and Studio validation accept this exact bounded composition."],
        editor: ["%s" + editorCase, "Home JSON→Form→JSON retains every rule in this exact bounded composition without writing."],
        build: ["%s CJS/TypeScript identity, initial serialization, stepwise/composite equivalence, next RNG and audit", "Generated CJS/TypeScript retain model hash, codec and exact stepwise/composite subround results."],
        "runtime-restore": ["%s CJS/TypeScript identity, initial serialization, stepwise/composite equivalence, next RNG and audit", "Fresh restoration after the first accepted subround retains every continuation, delivery-only state and next RNG."],
        "simulation-report": [boundedWorkflow, "CLI and actual Studio jobs retain 18 accepted subrounds, completed-logical sampling, history and report/download presentation."],
        extraction: [boundedWorkflow, "Descriptor extraction preserves all rules; rebuilt execution matches three original seeded states."],
        PAR: [boundedWorkflow, "Real CLI XLSX import retains mechanics and model hash; rebuilt execution matches original states."],
        replay: [boundedWorkflow, "Real CLI and Studio exact audit replay verify the recording and return verified downloads."],
    },
    WeightedBonusAuthoring: {
        core: ["known-answer %s direct/generated CJS/TS, payout duration, stable reads and restored next RNG", "Seed 0 selects large with probability .75/count 1/frequency 1, stake .05, payout .55 and two bonus respins; all three evaluators agree."],
        schema: [bonusWorkflow, "CLI and Studio validation accept the finite table and reference identities."],
        editor: ["Home Form/JSON preserves identity, units, zero mass and malformed drafts without saving", "Renaming the feature updates all outcome targets; explicit zero mass and payout survive Form/JSON without saving."],
        build: ["known-answer %s direct/generated CJS/TS, payout duration, stable reads and restored next RNG", "Direct and generated CJS/TypeScript execution agree on selection, payout, duration and next RNG."],
        "runtime-restore": ["retained progress rejects fresh handlers before creation or effects; untampered retries finish two respins ($explicit/$captureMode)", "Fresh ordinary and explicit handlers restore two respins, retain stake .05/win .55 and return duplicates exactly once."],
        "simulation-report": ["snapshots, chunks, legacy simulation and independent workers retain eligible denominators and unfinished tails", "Snapshots, chunks, legacy simulation and worker merges retain eligible selections, counts/frequencies, zero mass and unfinished duration."],
        extraction: [bonusWorkflow, "Complete extraction retains table/outcome/target identities and rebuilt seeded executable states."],
        PAR: [bonusWorkflow, "Real CLI XLSX import retains the weighted table, Blueprint hash and rebuilt executable states."],
        replay: [bonusWorkflow, "CLI and Studio exact audit verification retain canonical selected identity and return verified downloads."],
    },
};
const negativeAssertions: Record<Exclude<Surface, "editor">, string> = {
    core: "Malformed mechanics cannot construct a generated game.",
    schema: "An unknown mechanic produces an error rather than disappearing from this row's definition.",
    build: "Malformed generation creates no destination; valid generation into an occupied destination preserves its original keep file.",
    "runtime-restore": "Invalid nested RNG rejects before changing any executable state.",
    "simulation-report": "An unfunded session executes zero requested plays, retains RNG/state and reports zero actual rounds, stake and payout.",
    extraction: "An invalid descriptor cannot yield a complete Blueprint and does not create a session.",
    PAR: "A real XLSX containing an unknown mechanic returns parsheet-mechanics-invalid/error at import.",
    replay: "Exact replay against a changed paytable/model rejects before creating a session.",
};
function relatedCases(id: string, suite: string, surface: Surface): Pick<AuthoredWorkflowCell, "additionalExactFixtures" | "additionalNegativeFixtures"> {
    const ref = (test: string): string => `tests/v2/${suite}.test.ts#${test}`;
    const exact: string[] = [], 
        negative: string[] = [];
    if (surface === "core" && suite === "CascadeCollectionAuthoring") {
        if (id.includes("cascade")) exact.push(ref("exact two cascades, terminal evaluation at the bound, unique overlapping removals and overflow"), ref("authored terminal-at-bound cascades complete and replay while exhausted entries roll back and retry"));
        if (id.includes("collection")) exact.push(ref("exact collection cap, crossing, carry, reset, repeated awards, different denominations and isolation"));
        if (id.includes("respins")) exact.push(ref("no-trigger and non-retriggered respins, exact threshold and zero reset have exact outcomes"));
    }
    if (surface === "core" && suite === "WildModifierAuthoring" && ["modifier-expanding", "modifier-sticky", "modifier-transform"].includes(id)) exact.push(ref("ordered transform → expansion → sticky captures identity; expiry, reads and insufficient credits do not renew it"));
    if (surface === "schema" && suite === "WildModifierAuthoring") negative.push(ref("rejects invalid fields, coordinates, factors, symbols, lifetimes and duplicate/conflicting identities before publication"), ref("rejects value evaluators and HoldAndWin composition instead of silently bypassing semantics"));
    if (surface === "schema" && suite === "CascadeCollectionAuthoring") negative.push(ref("direct constructors and rendering reject every unsupported ownership combination"));
    if (suite === "WeightedBonusAuthoring") {
        if (surface === "schema" || surface === "build" || surface === "core") negative.push(ref("negative %s fails validation, rendering, construction and publication before mutation"), ref("rejects the incompatible %s owner before construction/build"));
        if (surface === "core") exact.push(ref("no trigger, zero effect, zero duration and distinct denominations preserve stake and finite selection counts"), ref("both known outcomes preserve payout units and charged denomination %s"));
        if (surface === "runtime-restore") {
            negative.push(ref("coordinated duration corruption rejects direct logical restoration before another draw"), ref("retained progress rejects fresh handlers before creation or effects; untampered retries finish two respins ($explicit/$captureMode)"), ref("descending consumed implicit contexts reject before changing the request, money or next RNG"));
            exact.push(ref("%s durable failure, fresh handlers and duplicates settle selection once"));
        }
        if (surface === "PAR" || surface === "extraction") negative.push(ref("real malformed XLSX and descriptors retain field errors and permit corrected reuse"));
        if (surface === "replay") negative.push(ref("tampered identity, context, model, duration and counters fail before nested restoration"));
    }
    return {...(exact.length ? {additionalExactFixtures: exact} : {}), ...(negative.length ? {additionalNegativeFixtures: negative} : {})};
}
function row(
    id: string,
    families: Family[],
    suite: string,
    fixture: string,
    editor: string,
    observable: string,
): AuthoredWorkflowSupportDescribing {
    const owner = `tests/v2/${suite}.test.ts`;
    const editorOwner = `tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.${editor}.test.tsx`;
    let negative = "%s: catalogue surface rejection boundaries";
    if (suite === "ExistingMechanicsAuthoring") negative = "$id: catalogue surface rejection boundaries";
    if (suite === "WeightedBonusAuthoring") negative = "weighted-bonus: catalogue surface rejection boundaries";
    return {
        id, families,
        cells: Object.fromEntries(AUTHORED_WORKFLOW_SURFACES.map(surface => {
            const [test, assertion] = cases[suite][surface];
            const testOwner = surface === "editor" ? editorOwner : owner;
            const negativeTest = surface === "editor" ? test : negative;
            return [surface, {
                variant: id,
                ...relatedCases(id, suite, surface),
                assertion: `${id}: ${assertion}${surface === "core" ? ` ${observable}` : ""}`,
                negativeAssertion: surface === "editor" ? "Invalid JSON remains intact; validation disables Create and no save/publication request occurs." : negativeAssertions[surface],
                dataFixture: fixture,
                exactFixture: `${testOwner}#${test}`,
                negativeFixture: `${testOwner}#${negativeTest}`,
                testOwner,
            }];
        })) as Record<Surface, AuthoredWorkflowCell>,
    };
}
function progressionObservation(progression: string, betScaled: boolean): string {
    if (progression === "freeGames") return "Missing/zero grants remain distinct; additive retriggers preserve the bank.";
    if (progression === "holdAndWin") return `Value 2 and multiplier 3 locks use ${
        betScaled ? "entry bet multiples" : "flat currency"
    }; new locks reset the two-respin budget and exhaustion pays once.`;
    return "Paid base evaluation retains its actual stake.";
}
function modifierFamily(variant: string): Family {
    if (variant === "multiplier") return "multipliers";
    if (variant === "transform" || variant === "reel") return "transforms/reel modifiers";
    return "wild variants";
}
export const AUTHORED_WORKFLOW_SUPPORT_CATALOG: readonly AuthoredWorkflowSupportDescribing[] = [
    ...AUTHORED_MECHANIC_CATALOG.map((variant) =>
        row(
            variant.id,
            [
                ...(variant.progression === "freeGames" ? ["freeGames/retrigger" as const] : []),
                ...(variant.progression === "holdAndWin" ? ["Hold&Win" as const] : []),
                ...(variant.jackpot ? ["Jackpot" as const] : []),
                ...(variant.modes ? ["BetMode" as const] : []),
            ],
            "ExistingMechanicsAuthoring",
            "tests/v2/fixtures/ExistingMechanicsGame.ts",
            "existingMechanics",
            `${progressionObservation(variant.progression, "values" in variant && variant.values === "bet")} ${
                variant.jackpot
                    ? `${variant.jackpot} pool mini starts at 10; contribution is 0.1 of actual stake; award/reset retains pool identity.`
                    : ""
            } ${
                variant.modes
                    ? "Base, ante ×1.5 and configured purchases charge once and retain original entry mode."
                    : ""
            }`,
        ),
    ),
    ...AUTHORED_MODIFIER_CATALOG.map((variant) =>
        row(
            `modifier-${variant}`,
            [modifierFamily(variant)],
            "WildModifierAuthoring",
            `examples/blueprints/wild-${variant}.blueprint.json`,
            "wildModifiers",
            `${variant} attribution retains ordered rules, evaluated coordinates and expiry through lines/ways/clusters; unsupported evaluators and competing owners reject.`,
        ),
    ),
    ...AUTHORED_BOUNDED_MECHANIC_CATALOG.map((variant) =>
        row(
            `bounded-${variant}`,
            [
                ...(variant.includes("cascade") || variant.includes("respins") ? ["cascade/respins" as const] : []),
                ...(variant.includes("collection") ? ["collections/accumulators" as const] : []),
            ],
            "CascadeCollectionAuthoring",
            "tests/v2/fixtures/BoundedMechanicsGame.ts",
            "cascadeCollection",
            `${variant} retains terminal/bound evaluations, grant/retrigger lifetime and collection threshold/cap/carry/reset as configured, including interrupted observations.`,
        ),
    ),
    row(
        "weighted-bonus",
        ["weighted bonus outcomes"],
        "WeightedBonusAuthoring",
        "tests/v2/fixtures/WeightedBonusGame.ts",
        "weightedBonus",
        "Seed 0 at bet 0.05 selects large: configured probability 0.75, count 1/frequency 1, charged stake 0.05, total payout 0.55 and two executed bonus respins.",
    ),
];
