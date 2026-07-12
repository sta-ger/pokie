import {loadPokieGame} from "pokie";
import type {GamePackageCreating} from "../scaffold/GamePackageCreating.js";
import type {RecentProjectsRepository} from "./RecentProjectsRepository.js";
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
    toolHandlers?: StudioToolHandling[];
};
