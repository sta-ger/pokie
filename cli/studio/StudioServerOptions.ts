import {GamePackageInspecting, loadPokieGame, PokieGamePackageValidating} from "pokie";
import {StudioBlueprintService} from "./blueprint/StudioBlueprintService.js";
import {StudioHomeService} from "./home/StudioHomeService.js";
import {StudioReplayExecutionService} from "./replay/StudioReplayExecutionService.js";
import {StudioRuntimeManager} from "./runtime/StudioRuntimeManager.js";
import {StudioSimulationService} from "./simulation/StudioSimulationService.js";
import type {StudioContext} from "./StudioContext.js";
import type {StudioToolHandling} from "./StudioToolHandling.js";

export type StudioServerOptions = {
    host?: string;
    port?: number;
    // Embedded in GET /api/studio/diagnostics' studioVersion field — the same value StudioCommand
    // already resolves via readOwnVersion() and threads into homeService/blueprintService below.
    // Required rather than defaulted for the same reason those are: StudioServer has no business
    // guessing a `pokie` version.
    pokieVersion: string;
    // Where the compiled cli/studio-client assets live (dist/cli/studio-client at runtime) — same
    // "computed once by cli/pokie.ts, passed in" pattern as PokieClientServer's clientRoot.
    studioRoot: string;
    // Where the compiled simulation worker-thread entry point lives — passed through to
    // StudioSimulationService (via ParallelSimulationRunner) so a Simulation request with workers > 1
    // can spawn real worker threads. undefined when the caller never configured one (e.g. most unit
    // tests, which only ever use workers: 1), in which case a workers > 1 request fails with a clear
    // error the same way SimCommand's own runParallel() does.
    workerEntryUrl?: URL;
    initialContext?: StudioContext;
    // Drives every Home nav flow (POST/GET /api/home/*: recent projects, create, init, build
    // preview/build, open) — see StudioHomeService. Required rather than defaulted: a default
    // instance would need a `pokie` version to embed into scaffolded/generated package.json files
    // (see GamePackageCreator/GamePackageGenerator), and StudioServer has no business guessing one.
    // StudioCommand always builds this with readOwnVersion() and passes it in — same reasoning as
    // gamePackageCreator used to have before Home absorbed it.
    homeService: StudioHomeService;
    // Drives the Blueprint Editor's five /api/home/blueprints/* endpoints — see StudioBlueprintService.
    // Required rather than defaulted for the same reason homeService is: a default instance would need
    // a `pokie` version to embed into generated package.json files, and StudioServer has no business
    // guessing one. StudioCommand always builds this with readOwnVersion() and passes it in.
    blueprintService: StudioBlueprintService;
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
    // Runs replays for the Project Dashboard's Replay tab (POST/GET/DELETE /api/project/replays*) —
    // same "defaults around this same `loadGame`" reasoning as simulationService above.
    replayService?: StudioReplayExecutionService;
    // Owns the Project Dashboard's Runtime tab (GET/POST /api/project/runtime*) — a process-local
    // in-process `pokie serve`-equivalent server for the active project, plus its Session Tools. Same
    // "defaults around this same `loadGame`" reasoning as simulationService/replayService above; no
    // `pokieVersion` needed, unlike homeService/blueprintService.
    runtimeManager?: StudioRuntimeManager;
    toolHandlers?: StudioToolHandling[];
};
