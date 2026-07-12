import {GamePackageInspecting, loadPokieGame, PokieGamePackageValidating} from "pokie";
import type {GamePackageCreating} from "../scaffold/GamePackageCreating.js";
import type {RecentProjectsRepository} from "./RecentProjectsRepository.js";
import {StudioSimulationService} from "./simulation/StudioSimulationService.js";
import type {StudioContext} from "./StudioContext.js";
import type {StudioToolHandling} from "./StudioToolHandling.js";

export type StudioServerOptions = {
    host?: string;
    port?: number;
    // Where the compiled cli/studio-client assets live (dist/cli/studio-client at runtime) — same
    // "computed once by cli/pokie.ts, passed in" pattern as PokieClientServer's clientRoot.
    studioRoot: string;
    initialContext?: StudioContext;
    recentProjectsRepository?: RecentProjectsRepository;
    // Required rather than defaulted: a default instance would need a `pokie` version to embed into
    // a scaffolded package.json (see GamePackageCreator), and StudioServer has no business guessing
    // one. StudioCommand always builds this the same way CreateCommand does (readOwnVersion()) and
    // passes it in.
    gamePackageCreator: GamePackageCreating;
    loadGame?: typeof loadPokieGame;
    // Provenance (GET /api/project/inspect) and contract/validation (GET /api/project/validate) for
    // the Project Dashboard — the exact same services `pokie inspect`/`pokie validate` use, so
    // Studio never re-implements either.
    gamePackageInspector?: GamePackageInspecting;
    gamePackageValidator?: PokieGamePackageValidating;
    // Runs simulations for the Project Dashboard's Simulation tab (POST/GET/DELETE
    // /api/project/simulations*) — defaults to a StudioSimulationService built around this same
    // `loadGame`, so tests only ever need to configure one loader, not two.
    simulationService?: StudioSimulationService;
    toolHandlers?: StudioToolHandling[];
};
