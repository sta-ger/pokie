import type {GameBlueprint} from "../../generated/GameBlueprint.js";
import {createAuthoredSession} from "../../generated/createAuthoredSession.js";
import type {PokieGame} from "../../gamepackage/PokieGame.js";
import type {GameSessionHandling} from "../../session/GameSessionHandling.js";
import {SeededRandomNumberGenerator} from "../../session/videoslot/combinations/SeededRandomNumberGenerator.js";
import {drawBelow} from "../../session/videoslot/combinations/WeightedSymbolsSequence.js";
import {SeededWeightedOutcomeRandomSource} from "../../pregenerated/SeededWeightedOutcomeRandomSource.js";
import {deriveStandardFeatureEvents} from "../../artifact/buildRoundArtifactFromSession.js";

/** Serializable recipe bound by the adapter's native readback, never accepted as tuning authority. */
export type OptimizationSimulationRecipe = {
    modelId: string;
    stake: number;
} & ({kind: "authored-entry"; blueprint: GameBlueprint} | {
    kind: "native";
    cost: number;
    outcomes: {weight: string; payoutPerBet: number; events: string[]}[];
});
/** Population adapter only: payouts come from the real authored session or stored native outcomes. */
export function createOptimizationSimulationGame(recipe: OptimizationSimulationRecipe): PokieGame {
    const releases = new Set<() => void>();
    return {
        getManifest: () => ({id: "optimization-population", name: "Optimization population", version: "1"}),
        getConfigHash: () => recipe.modelId,
        release: () => {
            for (const dispose of releases) {
                dispose();
                releases.delete(dispose);
            }
            return Promise.resolve();
        },
        createSession: (context) => {
            let credits = 0;
            let win = 0;
            let identities: string[] = [];
            const rng = new SeededRandomNumberGenerator(context?.seed ?? 0);
            const persistent = recipe.kind === "authored-entry" && !Object.values(recipe.blueprint.mechanics ?? {}).some(Boolean)
                ? createAuthoredSession(recipe.blueprint, rng) : undefined;
            if (persistent) releases.add(persistent.dispose);
            const source = new SeededWeightedOutcomeRandomSource(String(context?.seed ?? 0));
            const random = {getRandomInt: (min: number, max: number) => min + source.nextInt(max - min)};
            const total = recipe.kind === "native" ? recipe.outcomes.reduce((sum, outcome) => sum + BigInt(outcome.weight), BigInt(0)) : BigInt(0);
            const cost = recipe.kind === "native" ? recipe.cost : 1;
            const session: GameSessionHandling & {getStakeAmount(): number; getSimulationFeatureIdentities(): string[]} = {
                getCreditsAmount: () => credits,
                setCreditsAmount: value => {
                    credits = value; 
                },
                getBet: () => recipe.stake,
                setBet: value => {
                    if (value !== recipe.stake) throw new Error("Optimization recipe stake changed."); 
                },
                getAvailableBets: () => [recipe.stake],
                getStakeAmount: () => recipe.stake * cost,
                getWinAmount: () => win,
                getSimulationFeatureIdentities: () => identities,
                canPlayNextGame: () => credits >= recipe.stake * cost,
                play: () => {
                    if (recipe.kind === "native") {
                        let draw = drawBelow(total, random);
                        const outcome = recipe.outcomes.find(item => {
                            if (draw < BigInt(item.weight)) return true;
                            draw -= BigInt(item.weight);
                            return false;
                        });
                        if (!outcome) throw new Error("Invalid native draw.");
                        win = outcome.payoutPerBet * recipe.stake;
                        identities = outcome.events;
                    } else {
                        const owned = persistent ?? createAuthoredSession(recipe.blueprint, rng);
                        try {
                            owned.session.setBet(recipe.stake);
                            owned.session.setCreditsAmount(Number.MAX_SAFE_INTEGER);
                            owned.session.play();
                            win = owned.session.getWinAmount();
                            identities = deriveStandardFeatureEvents(owned.session).map(event => event.type);
                        } finally {
                            if (!persistent) owned.dispose();
                        }
                    }
                    credits += win - recipe.stake * cost;
                },
            };
            return session;
        },
    };
}
