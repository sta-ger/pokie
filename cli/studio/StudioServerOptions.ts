import {GamePackageInspecting, loadPokieGame, PokieGamePackageValidating} from "pokie";
import {StudioBlueprintService} from "./blueprint/StudioBlueprintService.js";
import {StudioCertificationService} from "./certification/StudioCertificationService.js";
import {StudioDeploymentService} from "./deployment/StudioDeploymentService.js";
import {StudioFairnessService} from "./fairness/StudioFairnessService.js";
import {StudioHomeService} from "./home/StudioHomeService.js";
import {StudioOutcomeLibraryService} from "./outcomeLibrary/StudioOutcomeLibraryService.js";
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
    // Drives the Project Dashboard's Deployment tab (GET /api/project/deployment/targets, POST
    // /api/project/deployment/runs) — built directly on top of the pokie package's own External
    // Adapter SDK (ExternalDeploymentService); no `loadGame`/`pokieVersion` needed, unlike
    // simulationService/replayService/homeService, since it never touches a game package itself.
    deploymentService?: StudioDeploymentService;
    // Drives the Project Dashboard's Outcome Libraries tab (POST /api/project/outcome-libraries/select,
    // /compare, /validate-deep) — built directly on top of pokie's own WeightedOutcomeLibrary/
    // OutcomeLibraryBundle/StakeEngine services; no `loadGame`/`pokieVersion` needed, same reasoning as
    // deploymentService.
    outcomeLibraryService?: StudioOutcomeLibraryService;
    // Drives the Project Dashboard's Certification tab (POST /api/project/certification/validate-source,
    // /build) — built directly on top of pokie's own CertificationEvidenceBundleBuilder/
    // OutcomeLibraryBundleValidator; no `loadGame` needed (same reasoning as deploymentService), but
    // does need `pokieVersion` (embedded in the built manifest's own `generatedBy`/`pokieVersion`
    // fields), same reasoning as homeService/blueprintService.
    certificationService?: StudioCertificationService;
    // Drives the Project Dashboard's Provably Fair tab (POST /api/project/fairness/configure, /generate,
    // /verify) — built directly on top of pokie's own commit-reveal services (FairnessRoundProofBuilder/
    // FairnessRoundProofVerifier/computeFairnessCommitment); no `loadGame`/`pokieVersion` needed, same
    // reasoning as outcomeLibraryService.
    fairnessService?: StudioFairnessService;
    toolHandlers?: StudioToolHandling[];
};
