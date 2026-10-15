/** Authored workflows, distinct from random-strategy compatibility feature sets.
 * Assembly is inner → outer. Every row has public workflow fixtures in ExistingMechanicsAuthoring.
 */
export const AUTHORED_MECHANIC_CATALOG = [
    {id: "free-games", progression: "freeGames", modes: false, jackpot: undefined},
    {id: "modes", progression: "freeGames", modes: true, jackpot: undefined},
    ...(["flat", "bet"] as const).flatMap(values => [false, true].map(modes => ({id: `hold-${values}${modes ? "-modes" : ""}`, progression: "holdAndWin", values, modes, jackpot: undefined}))),
    ...(["fixed", "accumulating"] as const).flatMap(jackpot =>
        (["base", "freeGames", "holdAndWin"] as const).flatMap(progression => (progression === "holdAndWin" ? ["flat", "bet"] as const : [undefined]).flatMap(values => [false, true].map(modes => ({id: `${jackpot}-${progression}${values === "bet" ? "-bet" : ""}${modes ? "-modes" : ""}`, progression, values, modes, jackpot}))))),
] as const;

/** Modifier catalogue: each variant has a deterministic example and workflow regression. */
export const AUTHORED_MODIFIER_CATALOG = ["expanding", "sticky", "restricted", "multiplier", "transform", "reel"] as const;
