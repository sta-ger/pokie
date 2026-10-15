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
    exactFixture: string;
    negativeFixture: string;
    testOwner: string;
};
export interface AuthoredWorkflowSupportDescribing {
    id: string;
    families: readonly Family[];
    cells: Record<Surface, AuthoredWorkflowCell>;
}
const assertions: Record<Surface, string> = {
    core: "Known-answer payout, stake, grants and expiry match the authored variant.",
    schema: "Shared validation rejects malformed parameters and unsupported ownership combinations before mutation.",
    editor: "Rendered Form/JSON retains zeros and malformed drafts; explicit Apply/save is required.",
    build: "CJS and recompilable TypeScript preserve definitions and next seeded result; invalid publication leaves destinations intact.",
    "runtime-restore":
        "Interrupted/restored progression and duplicate commands retain identity, duration and settlement.",
    "simulation-report":
        "Actual stake/payout and feature observations survive snapshots, worker merges and report rendering.",
    extraction:
        "Descriptor extraction/rebuild preserves effective rules; custom-only reasons remain visible without creating a session.",
    PAR: "Real XLSX export/import/rebuild preserves rules and rejects invalid imported parameters.",
    replay: "Seeded and exact audit replay preserve canonical feature events and reject incompatible state/model.",
};
function row(
    id: string,
    families: Family[],
    suite: string,
    fixture: string,
    negative: string,
    editor: string,
    observable: string,
): AuthoredWorkflowSupportDescribing {
    return {
        id,
        families,
        cells: Object.fromEntries(
            AUTHORED_WORKFLOW_SURFACES.map((surface) => [
                surface,
                {
                    variant: id,
                    assertion: `${id}: ${assertions[surface]} ${observable}`,
                    exactFixture: `${fixture}#${id}`,
                    negativeFixture: `tests/v2/${suite}.test.ts#${negative}`,
                    testOwner:
                        surface === "editor"
                            ? `tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.${editor}.test.tsx`
                            : `tests/v2/${suite}.test.ts`,
                },
            ]),
        ) as Record<Surface, AuthoredWorkflowCell>,
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
            "rejects conflicts and unknown fields",
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
            "unsupported",
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
            "direct constructors and rendering reject",
            "cascadeCollection",
            `${variant} retains terminal/bound evaluations, grant/retrigger lifetime and collection threshold/cap/carry/reset as configured, including interrupted observations.`,
        ),
    ),
    row(
        "weighted-bonus",
        ["weighted bonus outcomes"],
        "WeightedBonusAuthoring",
        "tests/v2/fixtures/WeightedBonusGame.ts",
        "negative",
        "weightedBonus",
        "Seed 0 at bet 0.05 selects large: configured probability 0.75, count 1/frequency 1, charged stake 0.05, total payout 0.55 and two executed bonus respins.",
    ),
];
