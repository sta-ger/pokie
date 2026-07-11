// Single source of truth for the two built-in simulation-breakdown category names, so "base" and
// "freeGames" aren't duplicated as raw string literals across StakeBasedSimulationRoundCategoryDeterminer,
// SimulationReportBuilder, SimulationReportDiffer, and SimulationCategoryOrdering.
export const BASE_SIMULATION_CATEGORY = "base";
export const FREE_GAMES_SIMULATION_CATEGORY = "freeGames";
