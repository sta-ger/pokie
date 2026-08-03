import {GamePackageInspecting, loadPokieGame, PokieGamePackageValidating} from "pokie";
import type {IncomingMessage} from "http";
import type {RuntimePackageResolving} from "../materialize/materializeRuntimePackage.js";
import {StudioBlueprintService} from "./blueprint/StudioBlueprintService.js";
import {StudioCertificationService} from "./certification/StudioCertificationService.js";
import {StudioDeploymentService} from "./deployment/StudioDeploymentService.js";
import {StudioFairnessService} from "./fairness/StudioFairnessService.js";
import {StudioFsBrowseService} from "./home/StudioFsBrowseService.js";
import {StudioHomeService} from "./home/StudioHomeService.js";
import {StudioNativePickerService} from "./home/StudioNativePickerService.js";
import {StudioOutcomeLibraryGenerateService} from "./outcomeLibrary/StudioOutcomeLibraryGenerateService.js";
import {StudioOutcomeLibraryService} from "./outcomeLibrary/StudioOutcomeLibraryService.js";
import {StudioReplayExecutionService} from "./replay/StudioReplayExecutionService.js";
import {StudioRuntimeManager} from "./runtime/StudioRuntimeManager.js";
import {StudioSimulationService} from "./simulation/StudioSimulationService.js";
import {StudioStakeEngineExportService} from "./stakeengine/StudioStakeEngineExportService.js";
import type {StudioContext} from "./StudioContext.js";
import {StudioProjectRegistrationService} from "./StudioProjectRegistrationService.js";
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
    // Drives GET /api/home/fs/browse -- the "Browse" action on Home's project-creation path inputs
    // (Create/Init/Build from Blueprint). Defaults to a StudioFsBrowseService rooted at `studioRoot`,
    // same "optional, defaulted around a value already required above" shape as gamePackageInspector/
    // gamePackageValidator below.
    fsBrowseService?: StudioFsBrowseService;
    // Drives GET /api/home/fs/native-browse/availability and POST /api/home/fs/native-browse -- the
    // system-native folder/file dialog every PathInput tries before ever falling back to
    // fsBrowseService's own browser-rendered listing. Defaults to a real StudioNativePickerService (no
    // `root` needed, unlike fsBrowseService: a native OS dialog has its own start-location argument, not
    // a fixed root to resolve relative paths against).
    nativePickerService?: StudioNativePickerService;
    // Gates the two endpoints above to a "confirmed local" caller (see isLoopbackRequest.ts) -- a remote
    // Studio session (e.g. `pokie studio --host 0.0.0.0`) is reported unavailable and can never invoke
    // nativePickerService, regardless of the server's own platform/display. Defaults to the real
    // isLoopbackRequest (the request's actual TCP peer address); overridable in tests, since a test's
    // own HTTP client always connects over loopback, the same as a genuinely local caller.
    isLoopbackRequest?: (req: IncomingMessage) => boolean;
    // Backs POST /api/home/fs/open-folder -- "Open output folder" on a successful Build/Rebuild.
    // Defaults to the real openInFileManager (a best-effort OS command, see its own doc comment);
    // overridable in tests so no real OS command is ever spawned.
    openFolder?: (folderPath: string) => void;
    // Drives the Blueprint Editor's five /api/home/blueprints/* endpoints — see StudioBlueprintService.
    // Required rather than defaulted for the same reason homeService is: a default instance would need
    // a `pokie` version to embed into generated package.json files, and StudioServer has no business
    // guessing one. StudioCommand always builds this with readOwnVersion() and passes it in.
    blueprintService: StudioBlueprintService;
    loadGame?: typeof loadPokieGame;
    // Crosses from "the projectRoot a direct `pokie <path>`/`pokie studio <path>` launch was given" to "a
    // real, loadable runtime" before the background Project Dashboard load (and runtimeManager's own Play
    // runtime) ever touch loadGame -- see StudioServer's own field doc comment. Defaults to a real
    // materializing resolver (operation STUDIO_OPERATION), same "always default to the real thing, only
    // tests override" shape as runtimeManager above; overridable in tests so no real
    // BlueprintProjectMaterializer/npm install ever runs.
    resolveRuntimePackageRoot?: RuntimePackageResolving;
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
    // Drives the Project Dashboard's Outcome Libraries tab's own Generate step/Registry panel (POST
    // /api/project/outcome-libraries/generate/estimate, /generate, GET /registry) -- built on the exact
    // same generateExactWeightedOutcomeLibrary/estimateExactOutcomeSpaceSize "pokie outcomelibrary
    // generate" itself drives, plus the same OutcomeLibraryBundleWriter/Reader "build"/deep validation use.
    // Needs `pokieVersion` (embedded in every bundle it writes/compares against), same reasoning as
    // certificationService/stakeEngineExportService.
    outcomeLibraryGenerateService?: StudioOutcomeLibraryGenerateService;
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
    // Drives the Project Dashboard's Stake Engine Export tab (POST /api/project/stakeengine/validate,
    // /export) — built directly on top of pokie's own StakeEngineExporter/StakeEngineExportValidator; no
    // `loadGame` needed (same reasoning as deploymentService), but does need `pokieVersion` (embedded in
    // the exported manifest's own `pokieVersion` field), same reasoning as certificationService.
    stakeEngineExportService?: StudioStakeEngineExportService;
    // Owns the persistent Studio project registry (every managed and registered external project Studio
    // knows about, not just Home's own short recent-projects list) -- see
    // StudioProjectRegistrationService/FileStudioProjectRegistry. Defaults to
    // createDefaultStudioProjectRegistrationService(), which composes a FileStudioProjectRegistry rooted
    // at the platform app-data directory so registrations survive a Studio restart, falling back
    // gracefully to a process-lifetime registry when no app-data directory can be resolved; overridable
    // in tests so no real filesystem state is ever touched.
    projectRegistrationService?: StudioProjectRegistrationService;
    toolHandlers?: StudioToolHandling[];
};
