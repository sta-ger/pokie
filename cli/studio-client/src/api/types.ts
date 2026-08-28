export type StudioContext = {mode: "home"} | {mode: "project"; projectRoot: string};

export type RecentProjectEntry = {
    projectRoot: string;
    name: string;
    openedAt: string;
};

// GET /api/home/recent-projects's own DTO — see cli/studio/home/StudioHomeRecentProjectView.ts's own
// doc comment. A missing project is flagged, never silently dropped from the list.
export type StudioHomeRecentProjectView = RecentProjectEntry & {missing: boolean};

export type PokieGameManifest = {
    id: string;
    name: string;
    version: string;
    description?: string;
    author?: string;
};

// A single reader-family mode's own exact analysis -- mirrors src/project/OutcomeSourceProjectReport.ts's
// own OutcomeSourceProjectModeAnalysis. Both the native (WeightedOutcomeLibraryAnalysis) and Stake Engine
// (StakeEngineStandaloneModeAnalysis) readers already share these field names (see that server type's own
// doc comment), so this client-side copy is a single flat shape rather than a union.
export type OutcomeSourceProjectModeAnalysisView = {
    modeName: string;
    analysis: {
        totalWeight: number;
        rtp: number;
        hitFrequency: number;
        zeroWinFrequency: number;
        variance: number;
        standardDeviation: number;
        maxWin: number;
        maxWinProbability: number;
    };
};

// Mirrors src/pregenerated/CanonicalOutcomeSourceDescriptor.ts -- what kind of canonical reader produced
// a report, whether it streams (a native bundle) or reads its source fully up front (a Stake Engine
// export), and any other honest limitation of reading outcomes this way rather than from the game model
// that produced them.
export type CanonicalOutcomeSourceDescriptorView = {
    kind: "native" | "stakeEngine";
    streaming: boolean;
    limitations: string[];
};

// Mirrors src/project/OutcomeSourceProjectReport.ts -- what OutcomeSourceProjectAnalyzer.analyze() returns
// for a resolved "outcomeLibrary"/"stakeAdapter" project. `modes` is empty whenever `issues` contains an
// error-severity entry (a malformed source's exact analysis is meaningless -- see that server type's own
// doc comment).
export type OutcomeSourceProjectReportView = {
    rootPath: string;
    descriptor: CanonicalOutcomeSourceDescriptorView;
    issues: ValidationIssue[];
    modes: OutcomeSourceProjectModeAnalysisView[];
};

// POST /api/project/outcome-source/sample's own DTO -- mirrors src/project/sampleOutcomeSourceProject.ts's
// own OutcomeSourceSampleResult. `diagnostic` is StudioServer's exact same structured
// UnsupportedProjectOperationDiagnostic every other unsupported-capability route already surfaces.
export type OutcomeSourceSampleView =
    | {
          supported: true;
          selection: {libraryId: string; libraryHash: string; totalWeight: number; outcome: {id: string; weight: number; artifact: RoundArtifact}};
          // Present for a seeded sample: this is the same portable identity the public replay command
          // consumes, rather than a UI-only approximation of the selected outcome.
          replay?: OutcomeSourceReplayDescriptorView;
      }
    | {supported: false; diagnostic: {detectedType: StudioProjectType; operation: string; missingCapability: string; alternatives: StudioProjectType[]; message: string}};

// The Project Dashboard's own read model — see cli/studio/ProjectDashboardContext.ts (the server's
// copy of this same type; kept as a separate client-side copy, same convention as every other type
// in this file, since the studio-client TS project compiles independently from cli/studio). `type`/
// `capabilities`/`origin` describe the *original* project `projectRoot` resolved from, best-effort --
// see the server type's own doc comment for why they're independently optional from `game`.
//
// "outcome-source" is the dedicated state for a resolved "outcomeLibrary"/"stakeAdapter" `projectRoot` --
// neither type ever gains RUNTIME_EXECUTE_CAPABILITY, so there's no `game` manifest to load; `project`
// carries the resolved project's own type/capabilities/rootPath directly (no separate optional fields,
// unlike "loaded" -- this state is never reached without a successfully resolved project).
// "artifact" is the equivalent state for an exchange-only PAR workbook: it has no game manifest or
// outcome-source analysis, but its own capabilities still make Build/Export available.
export type ProjectDashboardContext =
    | {status: "empty"}
    | {status: "loading"; projectRoot: string}
    | {
          status: "loaded";
          projectRoot: string;
          game: PokieGameManifest;
          type?: StudioProjectType;
          capabilities?: StudioProjectCapability[];
          origin?: StudioProjectOrigin;
      }
    | {
          status: "outcome-source";
          projectRoot: string;
          project: {type: StudioProjectType; rootPath: string; capabilities: StudioProjectCapability[]; provenance: string};
          origin?: StudioProjectOrigin;
          report: OutcomeSourceProjectReportView;
      }
    | {
          status: "artifact";
          projectRoot: string;
          project: {type: StudioProjectType; rootPath: string; capabilities: StudioProjectCapability[]; provenance: string};
          origin?: StudioProjectOrigin;
      }
    // `errorDetail` -- a failed Blueprint materialization's own raw npm diagnostic, kept separate from
    // `error`'s already-curated human message (see the server's own ProjectDashboardContext doc comment) --
    // absent for every other kind of open failure.
    | {status: "error"; projectRoot: string; error: string; errorDetail?: string};

export type GameBuildInfo = {
    schemaVersion: number;
    generatedBy: string;
    pokieVersion: string;
    generatedAt: string;
    blueprintHash: string;
    source?: string;
    files?: string[];
    game: {id: string; name: string; version: string};
};

export type GamePackageInspectionReport = {
    packageRoot: string;
    valid: boolean;
    error?: string;
    packageJson?: {name?: string; version?: string; description?: string};
};

export type ValidationIssue = {
    code: string;
    severity: "error" | "warning" | "info";
    message: string;
    details?: Record<string, unknown>;
    suggestion?: string;
    // Optional dotted/bracketed field path (e.g. "manifest.id", "reels") this issue is about, when the
    // server-side check targets exactly one field -- absent for cross-field/structural checks. See
    // domain/interpret/BlueprintSections.ts's own use of this for field-level Mantine input errors.
    path?: string;
};

export type PokieGamePackageValidationReport = {
    packageRoot: string;
    valid: boolean;
    game: {id: string; name: string; version: string} | null;
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
    suggestions: string[];
};

// GET /api/project/gameModel's own DTO -- mirrors the "pokie" package's own GameModelProjection (see
// src/project/GameModelProjection.ts's own doc comment), kept as a separate client-side copy, same
// convention as every other type in this file. Every section is either "available" (with its own,
// already-computed `data`) or "unavailable" (with a plain-language `reason`) -- GameModelTab.tsx renders
// exactly this, never flattening a paytable or inferring a reel generation mode itself.
export type GameModelSection<T> = {status: "available"; data: T} | {status: "unavailable"; reason: string};

export type GameModelBasics = {id?: string; name?: string; version?: string; description?: string; author?: string};

export type GameModelWinModel = {type: "lines" | "ways" | "clusters"; minimumClusterSize?: number};

export type GameModelLayout = {reels?: number; rows?: number; winModel: GameModelWinModel; paylineCount?: number};

export type GameModelSymbol = {id: string; isWild: boolean; isScatter: boolean};

export type GameModelReelGenerationMode = "reelStrips" | "reelStripGeneration" | "symbolWeights" | "default";

export type GameModelReelWindowCell = {symbolId: string; isWild: boolean; isScatter: boolean};

export type GameModelGameWindow = {reels: number; rows: number; wrapsAround: true; grid: GameModelReelWindowCell[][]};

export type GameModelReelStripPosition = {
    index: number;
    symbolId: string;
    isWild: boolean;
    isScatter: boolean;
    locked: boolean;
    stackSize: number;
};

export type GameModelResolvedReel = {
    reelIndex: number;
    source: "literal" | "generated" | "sample";
    positions: GameModelReelStripPosition[];
    analysis: ReelStripAnalysis;
    generationDiagnostics?: ReelStripGenerationDiagnostic[];
};

export type GameModelUnresolvedReel = {reelIndex: number; source: "generated"; reason: string; generationDiagnostics: ReelStripGenerationDiagnostic[]};

export type GameModelReel = GameModelResolvedReel | GameModelUnresolvedReel;

export type GameModelSharedWeightsSample = {
    weights: Record<string, number>;
    seed: number;
    sampleLength: number;
    conversion: ReelStripSymbolWeightsConversionDiagnostic;
};

export type GameModelReels = {
    generationMode: GameModelReelGenerationMode;
    gameWindow: GameModelGameWindow;
    reels: GameModelReel[];
    sharedWeightsSample?: GameModelSharedWeightsSample;
};

export type GameModelPaytableRow = {symbolId: string; matchCount: number; payout: number};

export type GameModelBetMode = {id: string; label?: string; costMultiplier?: number; targetRtp?: number};

export type GameModelBetsAndModes = {availableBets: number[]; betModes: GameModelBetMode[]};

export type GameModelFreeGames = {scatterSymbol: string; awardsByCount: Record<string, number>};

export type GameModelMechanics = {freeGames?: GameModelFreeGames};

export type GameModelLimits = {minBet?: number; maxBet?: number};

export type GameModelProjection = {
    basics: GameModelSection<GameModelBasics>;
    layout: GameModelSection<GameModelLayout>;
    symbols: GameModelSection<GameModelSymbol[]>;
    reels: GameModelSection<GameModelReels>;
    paytable: GameModelSection<GameModelPaytableRow[]>;
    betsAndModes: GameModelSection<GameModelBetsAndModes>;
    mechanics: GameModelSection<GameModelMechanics>;
    limits: GameModelSection<GameModelLimits>;
};

// Mirrors the "pokie" package's own ProjectType -- the kinds of on-disk input Studio's Projects registry
// resolves "a project" to (see src/project/ProjectType.ts's own doc comment for what each one means).
export type StudioProjectType = "blueprint" | "tsPackage" | "outcomeLibrary" | "stakeAdapter" | "wasm" | "parWorkbook";

// A capability id is a plain, open string -- same convention as the "pokie" package's own
// ProjectCapability (src/project/ProjectCapability.ts).
export type StudioProjectCapability = string;

export type StudioProjectOrigin = "managed" | "external";

export type StudioProjectStatus = "ok" | "missing";

// GET /api/home/projects/registry's own row shape -- see cli/studio/StudioProjectRegistryView.ts's own
// doc comment. `status` is computed fresh at read time, never persisted.
export type StudioProjectRegistryView = {
    location: string;
    name: string;
    type: StudioProjectType;
    capabilities: StudioProjectCapability[];
    origin: StudioProjectOrigin;
    lastOpenedAt: string;
    status: StudioProjectStatus;
    // The .xlsx PAR sheet workbook this project's own managed Blueprint was originally Applied and
    // first-saved from -- see cli/studio/StudioProjectRegistryEntry.ts's own doc comment. Undefined for
    // every project that didn't come from that flow.
    importedFromParSheetPath?: string;
};

// POST /api/home/projects/registry/preview's own DTO — see
// cli/studio/StudioProjectImportPreviewResult.ts's own doc comment. Never the result of anything being
// registered -- purely a read-only "detect" step.
export type StudioProjectImportPreviewResult =
    | {
          status: "recognized";
          location: string;
          type: StudioProjectType;
          capabilities: StudioProjectCapability[];
          suggestedName: string;
      }
    | {status: "unrecognized"; path: string};

// POST /api/home/projects/registry/register's own DTO — see
// cli/studio/StudioProjectRegistrationResult.ts's own doc comment. "unrecognized" is an ordinary,
// expected outcome of pointing registration at an arbitrary path, never a thrown error.
export type StudioProjectRegistrationResult = {status: "ok"; entry: StudioProjectRegistryView} | {status: "unrecognized"; path: string};

// GET /api/home/fs/browse's own DTO — see cli/studio/home/StudioFsBrowseService.ts's own doc comment.
// Backs the "Browse" action on every filesystem-path input in Home's project-creation forms.
export type StudioFsEntry = {name: string; isDirectory: boolean};

// Mirrors StudioFsBrowseService.ts's own StudioFsBrowseErrorReason -- "unresolved" (a dangling symlink) and
// "symlink-escape" (a project-scoped field's value that looks contained but, through a symlink, isn't) are
// only ever produced for a caller-supplied `base`; see that file's own doc comments for the full picture.
export type StudioFsBrowseErrorReason = "absent" | "type" | "permission" | "unresolved" | "symlink-escape" | "other";

export type StudioFsBrowseView =
    | {status: "ok"; resolvedPath: string; displayPath: string; parentPath?: string; entries: StudioFsEntry[]; isDirectory: boolean}
    | {status: "error"; error: string; resolvedPath: string; reason: StudioFsBrowseErrorReason};

// GET /api/home/fs/native-browse/availability's own DTO — see
// cli/studio/home/StudioNativePickerService.ts's own doc comment. PathInput only ever shows
// PathBrowseModal's "Server filesystem browser" when this comes back "unavailable" (or a pick request
// itself later reports "unavailable"/"error").
export type StudioNativePickerAvailabilityView = {status: "available"} | {status: "unavailable"; reason: string};

export type StudioNativePickerFileFilter = {name: string; extensions: string[]};

// POST /api/home/fs/native-browse's own DTO. "cancelled" is a deliberate no-op outcome (the user closed
// the OS dialog without picking anything) — distinct from "unavailable"/"error", which are what send
// PathInput to the PathBrowseModal fallback instead.
export type StudioNativePickerResultView =
    | {status: "selected"; path: string}
    | {status: "cancelled"}
    | {status: "unavailable"; reason: string}
    | {status: "error"; message: string};

// GET /api/home/fs/default-location's own DTO — see cli/studio/home/StudioDefaultLocationView.ts's own
// doc comment.
export type StudioDefaultLocationView = {status: "valid"; directory: string; source: "documents" | "home"} | {status: "unavailable"};

// POST /api/home/fs/open-folder's own DTO — see cli/studio/home/StudioOpenFolderView.ts's own doc
// comment.
export type StudioOpenFolderView = {status: "ok"} | {status: "unavailable"; reason: string} | {status: "error"; message: string};

// POST /api/home/fs/reveal-path mirrors open-folder, but accepts a file as well. The host opens the
// file's containing directory, which is the portable "Reveal file" behavior available to Studio.
export type StudioRevealPathView = StudioOpenFolderView;

// Mirrors cli/studio/previewBuildDestination.ts's own BuildDestinationPreview — see that file's own
// doc comment. Read-only: never the result of anything being created/modified on disk.
export type BuildDestinationPreview = {
    projectRoot: string;
    destinationHasContent: boolean;
    createFiles: string[];
    updateFiles: string[];
    deleteFiles: string[];
};

// POST /api/home/blueprints/build-preview's own DTO — see cli/studio/home/StudioBuildPreviewView.ts's
// own doc comment. Never the result of anything being written to disk.
export type StudioBuildPreviewView =
    | {status: "load-error"; error: string}
    | {status: "invalid"; errors: ValidationIssue[]; warnings: ValidationIssue[]}
    | ({
          status: "ok";
          warnings: ValidationIssue[];
          manifest: PokieGameManifest;
          reels: number;
          rows: number;
          symbolsCount: number;
          blueprintHash: string;
          expectedFiles: string[];
      } & BuildDestinationPreview);

// POST /api/home/blueprints/build's own DTO — see cli/studio/home/StudioBuildResult.ts's own doc
// comment.
export type StudioBuildResult =
    | {status: "load-error"; error: string}
    | {status: "invalid"; errors: ValidationIssue[]; warnings: ValidationIssue[]}
    | {status: "error"; error: string}
    | {
          status: "ok";
          projectRoot: string;
          manifest: PokieGameManifest;
          createdFiles: string[];
          buildInfo: GameBuildInfo;
          warnings: ValidationIssue[];
      };

// POST /api/home/blueprints/validate's own DTO — see cli/studio/blueprint/StudioBlueprintValidationView.ts's
// own doc comment. Never the result of anything being read/written on disk.
export type StudioBlueprintValidationView =
    | {status: "ok"; warnings: ValidationIssue[]}
    | {status: "invalid"; errors: ValidationIssue[]; warnings: ValidationIssue[]};

export type ReelStripConstraintViolation = {
    constraintId: string;
    message: string;
    positions?: number[];
    details?: Record<string, unknown>;
};

export type ReelStripGenerationDiagnostic = {
    attempt: number;
    accepted: boolean;
    violations: ReelStripConstraintViolation[];
    score?: number;
};

export type ReelStripSymbolWeightsConversionDiagnostic = {
    weights: Record<string, number>;
    counts: Record<string, number>;
    targetProportions: Record<string, number>;
    actualProportions: Record<string, number>;
    deviations: Record<string, number>;
};

export type ReelStripAnalysis = {
    length: number;
    symbolCounts: Record<string, number>;
    symbolFrequencies: Record<string, number>;
    minimumCircularDistances: Record<string, number>;
    maximumCircularDistances: Record<string, number>;
    maximumConsecutiveOccurrences: Record<string, number>;
};

// POST /api/home/blueprints/reel-strip-generation-preview's own DTO — see
// cli/studio/blueprint/StudioReelStripGenerationView.ts's own doc comment. Never the result of
// anything being read/written on disk; a "generated" reel's success: false carries the same
// diagnostics/violations "pokie build" itself would report for an unsatisfiable config.
export type StudioReelStripGenerationReelView =
    | {reelIndex: number; type: "literal"; strip: string[]; analysis: ReelStripAnalysis}
    | {
          reelIndex: number;
          type: "generated";
          seed: number;
          success: true;
          attemptsUsed: number;
          diagnostics: ReelStripGenerationDiagnostic[];
          strip: string[];
          analysis: ReelStripAnalysis;
      }
    | {
          reelIndex: number;
          type: "generated";
          seed: number;
          success: false;
          attemptsUsed: number;
          diagnostics: ReelStripGenerationDiagnostic[];
      };

// Always "ok": `errors`/`warnings` are surfaced *alongside* `reels`, never instead of them -- a
// blueprint-level problem unrelated to reelStripGeneration itself never hides every other,
// resolvable reel's result. See StudioReelStripGenerationView.ts's own doc comment.
export type StudioReelStripGenerationView = {
    status: "ok";
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
    reels: StudioReelStripGenerationReelView[];
};

// POST /api/home/blueprints/load's own DTO — see cli/studio/blueprint/StudioBlueprintLoadView.ts's own
// doc comment. `blueprint` is the raw parsed JSON value (unknown), not yet validated. `blueprintHash`
// is that content's own exact-content hash — carry it forward as the "expectedHash" a later save is
// built from.
export type StudioBlueprintLoadView = {status: "ok"; path: string; blueprint: unknown; blueprintHash: string} | {status: "load-error"; error: string};

// POST /api/home/blueprints/check-source's own DTO — see cli/studio/blueprint/StudioBlueprintCheckView.ts's
// own doc comment. Lets a caller that already holds a loaded/saved path's own blueprintHash cheaply ask
// whether the persisted source has since changed externally; "changed" carries the fresh content/hash
// straight back so a caller detecting drift never needs a second round trip just to see what changed.
export type StudioBlueprintCheckView =
    | {status: "unchanged"}
    | {status: "changed"; blueprint: unknown; blueprintHash: string}
    | {status: "load-error"; error: string};

// What produced a randomly generated blueprint and with which algorithm — see
// cli/studio/blueprint/StudioBlueprintRandomView.ts's own doc comment. Same seed + same
// generatorVersion always reproduces the same blueprint.
export type RandomBlueprintProvenance = {generatorVersion: string; strategy: string; seed: number};

// POST /api/home/blueprints/random's own DTO — see cli/studio/blueprint/StudioBlueprintRandomView.ts's
// own doc comment. Always "ok"; never written to disk. "seed"/"provenance" are what the New flow's
// "Generate random" step shows and what a follow-up request with the same seed/preset reproduces
// exactly.
export type StudioBlueprintRandomView = {
    status: "ok";
    blueprint: unknown;
    seed: number;
    preset: "default" | "variant";
    provenance: RandomBlueprintProvenance;
};

// POST /api/home/blueprints/save's own DTO — see cli/studio/blueprint/StudioBlueprintSaveView.ts's own
// doc comment. A stale conflict carries current-versus-edited content and hashes, allowing Reload,
// Compare and Save As without risking a stale overwrite. "blueprintHash" on "ok" is the just-written
// content's own hash — a caller uses it as the next known-good snapshot for StudioBlueprintCheckView.
export type StudioBlueprintSaveView =
    | {status: "ok"; path: string; blueprintHash: string}
    | {
          status: "conflict";
          reason: "existing" | "stale";
          path: string;
          error: string;
          currentBlueprint?: unknown;
          currentHash?: string;
          editedBlueprint: unknown;
          editedHash: string;
          expectedHash?: string;
          canSaveAs: true;
      }
    | {status: "error"; error: string};

// POST /api/home/blueprints/save-managed's own DTO — see
// cli/studio/blueprint/StudioBlueprintSaveManagedView.ts's own doc comment. Unlike StudioBlueprintSaveView
// above, there's no "conflict" outcome (the path is always one Studio itself picked, never a user-chosen
// one that might already hold someone else's file) — "invalid-name"/"unavailable" cover a path this
// service couldn't resolve a usable destination for at all.
export type StudioBlueprintSaveManagedView =
    | {
          status: "ok";
          path: string;
          name: string;
          blueprintHash: string;
          sourceWorkbookPath?: string;
          // The server's just-persisted registry record.  Returning it with the save lets Home update
          // its already-mounted Projects panel immediately, while its normal refresh reconciles later.
          registeredProject?: StudioProjectRegistryView;
      }
    | {status: "invalid-name"; error: string}
    | {status: "unavailable"; error: string}
    | {status: "error"; error: string};

// A selected PNG is staged by Studio until the Blueprint is saved. The Blueprint itself receives only
// `reference` (for example `assets/symbols/wild-a1b2.png`), never the absolute picker path.
export type StudioSymbolArtworkImportView = {status: "ok"; reference: string} | {status: "error"; error: string};

// Read from (or written to) a PAR sheet's own "Meta" sheet — never fed back into GameBlueprint fields,
// purely informational (see cli/studio/blueprint/StudioParSheetImportView.ts's own doc comment).
export type ParSheetProvenance = {
    schemaVersion?: number;
    pokieVersion?: string;
    exportedAt?: string;
    source?: string;
    blueprintHash?: string;
};

// POST /api/home/blueprints/par-import's own DTO — see
// cli/studio/blueprint/StudioParSheetImportView.ts's own doc comment. "ok" here means "the file was read
// and mapped", never "the result is error-free" -- errors/warnings are the PAR Sheet Import/Export
// panel's own Diagnose & map step's data, not a gate on reaching "ok".
export type StudioParSheetImportView =
    | {
          status: "ok";
          path: string;
          blueprint: unknown;
          provenance?: ParSheetProvenance;
          errors: ValidationIssue[];
          warnings: ValidationIssue[];
      }
    | {status: "load-error"; error: string};

// POST /api/home/blueprints/par-export's own DTO — see
// cli/studio/blueprint/StudioParSheetExportView.ts's own doc comment. "conflict" mirrors
// StudioBlueprintSaveView's own overwrite-confirmation contract; "invalid" (never a write) covers both a
// blueprint that fails validation and one PAR export simply can't represent (e.g.
// "parsheet-unsupported-reel-source").
export type StudioParSheetExportView =
    | {status: "ok"; path: string; warnings: ValidationIssue[]}
    | {status: "conflict"; path: string; error: string}
    | {status: "invalid"; errors: ValidationIssue[]; warnings: ValidationIssue[]}
    | {status: "error"; error: string};

export type SimulationReportBreakdownComponent = {
    rounds: number;
    totalBet: number;
    totalWin: number;
    // Studio Replay's player-facing balance after the target round.  Replays execute with an
    // intentionally unlimited internal bankroll, so this ledger value is the original session's
    // observable balance rather than that implementation detail.
    credits?: number;
    rtp: number;
    hitFrequency: number;
    maxWin: number;
    contribution: number;
};

export type SimulationReportReproducibility = {
    game: {id: string; name: string; version: string};
    seed: string | null;
    requestedRounds: number;
    actualRounds: number;
    command: string;
    workerSeedStrategy?: string;
};

// The server's copy of this same type lives in "pokie" itself (src/reporting/SimulationReport.ts) —
// kept as its own client-side copy here, same convention as every other type in this file.
export type SimulationReport = {
    game: {id: string; name: string; version: string};
    requestedRounds: number;
    rounds: number;
    seed: string | null;
    totalBet: number;
    totalWin: number;
    rtp: number;
    hitFrequency: number;
    maxWin: number;
    durationMs: number;
    spinsPerSecond: number;
    workers?: number;
    reproducibility?: SimulationReportReproducibility;
    warnings?: string[];
    recommendations?: string[];
    breakdown?: {components: Record<string, SimulationReportBreakdownComponent>};
    averageBet?: number;
    averagePayout?: number;
    volatility?: number;
    payoutHistogram?: Record<string, number>;
    maxWinFrequency?: number;
    stopReason?: "maxRounds" | "sessionStopped" | "converged";
    convergence?: {
        minRounds: number;
        rtpTolerance: number;
        checkIntervalRounds: number;
        stableChecks: number;
        checksPerformed: number;
        consecutiveStableChecks: number;
        achievedRtpHalfWidth: number;
    };
};

// The extra volatility/standard-deviation/confidence-interval fields Studio surfaces alongside the
// standard SimulationReport — see cli/studio/simulation/StudioSimulationJobView.ts's own doc comment
// for why these live here rather than as a change to SimulationReport itself.
export type StudioSimulationStatisticsView = {
    volatility: number;
    payoutStandardDeviation: number;
    returnStandardDeviation: number;
    averagePayoutConfidenceInterval95: {low: number; high: number};
    rtpConfidenceInterval95: {low: number; high: number};
    payoutHistogram?: Record<string, number>;
};

// The server's copy of this same type lives in "pokie" itself (cli/studio/simulation/
// StudioSimulationJobView.ts) -- GET /api/project/reports/:id's response envelope, bundling the
// persisted SimulationReport with the same statistics a live job's own poll response carries, so a
// historical report renders identically to a just-completed one.
export type StudioSimulationReportDetail = {
    report: SimulationReport;
    statistics?: StudioSimulationStatisticsView;
};

export type StudioSimulationStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type StudioSimulationJobView = {
    id: string;
    status: StudioSimulationStatus;
    rounds: number;
    seed?: string;
    workers: number;
    startedAt: string;
    roundsCompleted: number;
    durationMs: number;
    report?: SimulationReport;
    statistics?: StudioSimulationStatisticsView;
    error?: string;
    // The real outcome-library mode this job samples/sampled -- undefined for an ordinary
    // "tsPackage"/"blueprint" simulation, which has no notion of an outcome-library mode at all.
    modeName?: string;
    // The final seeded outcome-library draw, retained by Studio simulation for exact replay.
    lastReplay?: OutcomeSourceReplayDescriptorView;
};

// One row of GET /api/project/reports — only ever built from a "completed" job, see
// cli/studio/simulation/StudioSimulationReportListEntry.ts's own doc comment.
export type StudioSimulationReportListEntry = {
    id: string;
    status: "completed";
    game: {id: string; version: string};
    requestedRounds: number;
    actualRounds: number;
    seed?: string;
    workers: number;
    rtp: number;
    hitFrequency: number;
    maxWin: number;
    startedAt: string;
    completedAt: string;
    durationMs: number;
    hasWarnings: boolean;
    modeName?: string;
};

// The server's copies of this whole RoundArtifact family live in "pokie" itself (src/artifact/*.ts) —
// kept as their own client-side copies here, same convention as every other type in this file. Deeply
// readonly to match the server's own guarantee (a RoundArtifact is deep-frozen at build time).
export type RoundArtifactProvenance = {
    readonly game: {id: string; name: string; version: string};
    readonly pokieVersion: string;
    readonly configHash?: string;
};

export type RoundArtifactMultiplierBreakdown = {
    readonly source: string;
    readonly positions: readonly (readonly number[])[];
    readonly values: readonly number[];
    readonly combinedMultiplier: number;
};

export type RoundArtifactWin = {
    readonly type: string;
    readonly id: string;
    readonly symbolId: string | number;
    readonly winAmount: number;
    readonly winningPositions: readonly (readonly number[])[];
    readonly multiplierBreakdown: readonly RoundArtifactMultiplierBreakdown[];
    readonly metadata: Record<string, unknown>;
};

export type RoundArtifactFeatureEvent = {
    readonly type: string;
    readonly data?: Record<string, unknown>;
};

export type RoundStepArtifact = {
    readonly index: number;
    readonly screen: readonly (readonly (string | number)[])[];
    readonly totalWin: number;
    readonly wins: readonly RoundArtifactWin[];
    readonly featureEvents?: readonly RoundArtifactFeatureEvent[];
    readonly debug?: Record<string, unknown>;
};

export type RoundArtifact = {
    readonly schemaVersion: number;
    readonly roundId: string;
    readonly provenance: RoundArtifactProvenance;
    readonly betMode: string;
    readonly stake: number;
    readonly totalWin: number;
    readonly payoutMultiplier: number;
    readonly screen: readonly (readonly (string | number)[])[];
    readonly steps: readonly RoundStepArtifact[];
    readonly wins: readonly RoundArtifactWin[];
    readonly featureEvents?: readonly RoundArtifactFeatureEvent[];
    readonly debug?: Record<string, unknown>;
};

// PokieJsonRoundArtifactProjector's own output shape -- a RoundArtifact stamped with its own content
// hash, what a completed replay's descriptor.artifact and a pasted "Replay Artifact" JSON both are.
export type RoundArtifactJson = RoundArtifact & {readonly hash: string};

// Mirrors PreGeneratedRoundReplayDescriptor. It travels with ordinary outcome-library Play and
// Sample results so consumers can hand the exact recorded seed/round/mode/provenance to `pokie replay`.
export type OutcomeSourceReplayDescriptorView = {
    game?: {id: string; name: string; version: string};
    libraryId: string;
    libraryHash: string;
    modeName: string;
    selectionAlgorithm: "derived-round-seed-v1";
    seed: string;
    round: number;
    outcomeId: string | number;
    weight: number;
    totalWin: number;
    payoutMultiplier: number;
    stake?: number;
    screen?: unknown[][];
    artifact?: RoundArtifact;
    timestamp: number;
    durationMs: number;
};

// The server's copy of this same type lives in "pokie" itself (src/replay/ReplayDescriptor.ts) —
// kept as its own client-side copy here, same convention as every other type in this file.
export type ReplayDescriptor = {
    // The identity of the actual game session this replay created and played forward -- distinct from
    // the replay job id (StudioReplayJobView.id, minted before this session even exists) that tracks the
    // run itself. See src/replay/ReplayDescriptor.ts's own doc comment.
    sessionId: string;
    game: {id: string; name: string; version: string};
    seed: string | null;
    round: number;
    totalBet: number;
    totalWin: number;
    // The player-facing balance after the replayed round. Optional because older replay descriptors
    // did not persist it, while Studio's replay executor includes it for current sessions.
    credits?: number;
    screen: unknown[][] | null;
    timestamp: number;
    durationMs: number;
    // Only present for a replay run by Studio's own StudioReplayExecutionService against a video-slot
    // game -- absent for anything predating this field or for a non-video-slot session (see
    // StudioReplayExecutionService.buildArtifact()'s own doc comment).
    artifact?: RoundArtifactJson;
    // Serialized session state immediately before / after the target round's play() -- public fields
    // only (no RNG/debug data, which lives in artifact.debug instead). Absent when the game/session
    // doesn't support state serialization or capture failed -- never a replay failure by itself (see
    // StudioReplayExecutionService.captureBoundaryState()'s own doc comment).
    stateBefore?: Record<string, unknown>;
    stateAfter?: Record<string, unknown>;
    // Native outcome-library provenance. Its absence means this is package replay or an older,
    // inspection-only descriptor; a caller must not invent a mode/seed for exact comparison.
    outcomeSource?: {
        game?: {id: string; name: string; version: string};
        libraryId: string;
        libraryHash: string;
        modeName: string;
        selectionAlgorithm: "derived-round-seed-v1";
        seed: string;
        round: number;
        outcomeId: string;
        weight: number;
        totalWin: number;
        payoutMultiplier: number;
        stake?: number;
        screen?: unknown[][];
        artifact?: RoundArtifact;
        timestamp: number;
        durationMs: number;
    };
};

export type StudioReplayStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

// The typed DTO every /api/project/replays* endpoint returns — see
// cli/studio/replay/StudioReplayJobView.ts's own doc comment. `descriptor` is only present once
// `status` is "completed"; `error` only once `status` is "failed".
export type StudioReplayJobView = {
    id: string;
    status: StudioReplayStatus;
    round: number;
    seed?: string;
    // Present only for a job started from the Replay tab's "Recent Simulation" source -- the completed
    // simulation report this round was selected from. See cli/studio/replay/StudioReplayJobRecord.ts's
    // own doc comment.
    simulationId?: string;
    startedAt: string;
    completedRounds: number;
    durationMs: number;
    game?: {id: string; name: string; version: string};
    descriptor?: ReplayDescriptor;
    error?: string;
    // The real outcome-library mode this job replays/replayed -- undefined for an ordinary
    // "tsPackage"/"blueprint" replay, which has no notion of an outcome-library mode at all.
    modeName?: string;
};

// One row of GET /api/project/replays — see cli/studio/replay/StudioReplayListEntry.ts's own doc
// comment (no `screen`, kept out of the list summary; every job for the project regardless of status,
// unlike Simulation's Reports list which only ever shows completed jobs).
export type StudioReplayListEntry = {
    id: string;
    status: StudioReplayStatus;
    game?: {id: string; name: string; version: string};
    round: number;
    seed?: string;
    completedRounds: number;
    totalBet?: number;
    totalWin?: number;
    startedAt: string;
    completedAt?: string;
    durationMs: number;
    error?: string;
    modeName?: string;
};

// Play tab (and Outcome Source Analysis "Sample") response DTO — see
// cli/studio/runtime/StudioRuntimeSessionView.ts's own doc comment. `sessionVersion` is present
// whenever the underlying session repository is versioned; `studioRequestId` is Studio's own bookkeeping
// (the client's requestId for this spin), present whenever one was supplied; `debug` is always attached
// (Play and Outcome Source Analysis never withhold it). `studioRound`/`studioRecordedAt`/`studioSource`/
// `studioOperation` are present only on a round the shared StudioRoundRecorder actually recorded (every
// spin/draw across every tab — see that class's own doc comment) — never on a plain create/get-session
// response — and together give each recorded round its own unambiguous, session-scoped identity:
// `studioRound` is that session's stable 1-based round index (survives both the recorder's own bound and
// an idempotent retry of the same requestId), `studioRecordedAt` is when Studio recorded it, `studioSource`
// names which tab/route produced it, and `studioOperation` names the concrete action within that tab.
export type StudioRuntimeSessionView = {
    sessionId: string;
    game: {id: string; name: string; version: string};
    // Absent only for a stateless one-shot draw with no session/wallet of its own (the Outcome Source
    // Analysis tab's "Sample" route) -- never fabricated as 0 to fill the shape out where there truly
    // isn't a credits figure at all.
    credits?: number;
    bet?: number;
    win?: number;
    screen?: unknown[][];
    // The game's own real symbol list (VideoSlotConfigDescribing.getAvailableSymbols()), present whenever
    // the underlying session reports one -- Play's own "Find symbol win" chooser is the one consumer today.
    availableSymbols?: string[];
    sessionVersion?: number;
    studioRequestId?: string;
    studioRound?: number;
    studioRecordedAt?: string;
    // Which of Studio's own tabs/routes produced this round -- "play"/"play-outcome-source" are the Play
    // tab (an ordinary session vs. a draw against a resolved "outcomeLibrary" project),
    // "outcome-source-sample" is the Outcome Source Analysis tab's own one-shot "Sample" draw,
    // "simulation-sample" is the Replay tab's "Recent Simulation" reproduction. "live"/"pre-generated"
    // are vestigial -- no longer producible now that the Runtime tab is gone -- kept in the union only
    // so Replay's own display mapping (describeStudioRoundSource) stays exhaustive.
    studioSource?: "live" | "pre-generated" | "play" | "play-outcome-source" | "outcome-source-sample" | "simulation-sample";
    // The concrete action that produced this round, independent of studioSource -- "find-any-win"/
    // "find-symbol-win"/"find-free-games" are the Play tab's own scenario-search controls (every spin
    // along the way is recorded under the operation actually driving it, not demoted to a bare "spin").
    studioOperation?: "spin" | "find-any-win" | "find-symbol-win" | "find-free-games" | "outcome-source-sample" | "simulation-sample";
    studioProjectRoot?: string;
    studioSeed?: string | number;
    // The real outcome-library mode this round was drawn against -- present only for an outcome-library-
    // backed round ("play-outcome-source"/"outcome-source-sample"/"simulation-sample"), absent for a
    // "runtime"/"live"/"pre-generated" one, which has no such notion at all.
    studioModeName?: string;
    replay?: OutcomeSourceReplayDescriptorView;
    debug?: {
        stateAfter?: unknown;
        stateBefore?: unknown;
        debugData?: Record<string, unknown>;
        requestId?: string;
        // The same complete, JSON-projected, hashed RoundArtifact the Replay tab's other sources already
        // render through RoundArtifactInspector -- present whenever this exact round's session supported
        // building one, so Session Spin can use the identical inspector instead of a bespoke raw-JSON view.
        artifact?: RoundArtifactJson;
        // Present instead of `artifact` whenever this session couldn't produce one (e.g. a non-video-slot
        // game) -- an honest diagnostic, never a silent absence.
        artifactUnavailableReason?: string;
    } & Record<string, unknown>;
} & Record<string, unknown>;

// GET /api/project/deployment/targets' own DTO — see
// cli/studio/deployment/StudioDeploymentTargetSummary.ts's own doc comment.
export type StudioDeploymentTargetSummary = {
    id: string;
    version: string;
    requirements: {minPokieVersion?: string; symbolAlphabet?: "numeric" | "any"; requiresHomogeneousProvenance?: boolean};
    capabilities: string[];
};

// GET /api/project/deployment/build-modes' own DTO — see
// cli/studio/deployment/StudioDeploymentBuildModesView.ts's own doc comment: resolved from the
// project's own current built package, never the mutable tracked source blueprint.
export type StudioDeploymentBuildModesView = {status: "ok"; modeIds: readonly string[]} | {status: "unavailable"};

// One mode row of a POST /api/project/deployment/runs request body — "librarySelector" is the same
// OutcomeLibrarySelector (see below) the Outcome Libraries tab's own Select/Compare/Generate steps
// already use, so a deployment mode can point at a plain JSON file, one mode of a canonical
// outcome-library bundle the registry discovered, or one mode of a Stake Engine export.
export type StudioDeploymentModeInput = {
    modeName: string;
    librarySelector: OutcomeLibrarySelector;
};

// One generated artifact as sent back from POST /api/project/deployment/runs — see
// cli/studio/deployment/StudioDeploymentArtifactView.ts's own doc comment: `content` is always a
// plain string, decoded server-side.
export type StudioDeploymentArtifactView = {
    relativePath: string;
    content: string;
};

// One row of StudioDeploymentRunView.stages — see cli/studio/deployment/StudioDeploymentStageSummary.ts's
// own doc comment. Computed server-side (see computeDeploymentStages) — never re-derived here from
// which of the other StudioDeploymentRunView fields happen to be present.
export type StudioDeploymentStageSummary = {
    key: "descriptor" | "compatibility" | "projection" | "generation" | "artifactValidation" | "diagnostic" | "delivery";
    label: string;
    status: "ok" | "error" | "skipped";
    issues: ValidationIssue[];
};

// POST /api/project/deployment/runs' own DTO — see cli/studio/deployment/StudioDeploymentRunView.ts's
// own doc comment. `stages` is the authoritative per-stage status; the fields below it are the raw
// ExternalDeploymentResult mirror `stages` was itself computed from.
export type StudioDeploymentRunView = {
    plan?: StudioArtifactConversionPlan;
    targetId: string;
    publish: boolean;
    stages: StudioDeploymentStageSummary[];
    descriptorIssues: ValidationIssue[];
    compatibilityIssues: ValidationIssue[];
    projectionIssues: ValidationIssue[];
    generation?: {
        artifacts: StudioDeploymentArtifactView[];
        issues: ValidationIssue[];
    };
    artifactIssues: ValidationIssue[];
    diagnostic?: {ok: boolean; checks: {name: string; ok: boolean; message?: string}[]};
    delivery?: {delivered: boolean; details?: Record<string, unknown>; issues?: ValidationIssue[]};
};

// POST /api/project/outcome-libraries/generate's own selector shape — see
// cli/studio/outcomeLibrary/OutcomeLibrarySelector.ts's own doc comment for what each source means.
export type OutcomeLibrarySelector =
    | {kind: "json"; path: string}
    | {kind: "bundle"; bundleDir: string; modeName: string}
    | {kind: "stakeengine"; stakeDir: string; modeName: string};

export type WeightedOutcomePayoutBucket = {payoutMultiplier: number; probability: number};

// WeightedOutcomeLibraryAnalyzer's own output, embedded verbatim in CertificationEvidenceBundleModeEntry
// -- never recomputed here.
export type WeightedOutcomeLibraryAnalysis = {
    totalWeight: number;
    rtp: number;
    hitFrequency: number;
    zeroWinFrequency: number;
    variance: number;
    standardDeviation: number;
    maxWin: number;
    maxWinProbability: number;
    payoutDistribution: WeightedOutcomePayoutBucket[];
};

export type OutcomeLibraryGenerationStrategy = "exact" | "bounded-coverage";

// POST /api/project/outcome-libraries/generate/estimate's own DTO — see
// cli/studio/outcomeLibrary/StudioOutcomeLibraryGenerateEstimateView.ts's own doc comment. Mirrors "pokie
// outcomelibrary generate --estimate" exactly; totalOutcomeSpaceSize/maxOutcomeSpaceSize are bigint-safe
// (a plain number when it fits Number.MAX_SAFE_INTEGER, a decimal string otherwise).
export type StudioOutcomeLibraryGenerateEstimateView =
    | {
          status: "ok";
          game: {id: string; name: string; version: string};
          reelsNumber: number;
          reelsSymbolsNumber: number;
          reelSizes: number[];
          totalOutcomeSpaceSize: number | string;
          maxOutcomeSpaceSize: number | string;
          strategy: OutcomeLibraryGenerationStrategy;
          requiresBounded: boolean;
          plan?: StudioArtifactConversionPlan;
      }
    | {status: "unsupported"; error: string; plan?: StudioArtifactConversionPlan}
    | {status: "conflict"; error: string; plan: StudioArtifactConversionPlan}
    | {status: "load-error"; error: string; plan?: StudioArtifactConversionPlan};

// OutcomeLibraryGeneratorDiagnostics, embedded verbatim -- see its own doc comment
// (src/weightedoutcome/generate/OutcomeLibraryGeneratorDiagnostics.ts).
export type OutcomeLibraryGeneratorDiagnostics = {
    algorithm: string;
    strategy: OutcomeLibraryGenerationStrategy;
    totalOutcomeSpaceSize: number | string;
    sampledRawCount: number | string;
    seed?: string;
    pokieVersion: string;
    game: {id: string; name: string; version: string};
    configHash?: string;
    generatedAt: string;
};

// POST /api/project/outcome-libraries/generate's own DTO — see
// cli/studio/outcomeLibrary/StudioOutcomeLibraryGenerateResultView.ts's own doc comment. `selector` is a
// ready-to-use reference to the bundle mode this run just wrote.
export type StudioOutcomeLibraryGenerateResultView =
    | {
          status: "ok";
          bundleDir: string;
          files: string[];
          warnings: ValidationIssue[];
          mode: {modeName: string; libraryId: string; hash: string; outcomeCount: number; totalWeight: number; rtp: number};
          generator: OutcomeLibraryGeneratorDiagnostics;
          coverage: number;
          selector: OutcomeLibrarySelector;
          plan?: StudioArtifactConversionPlan;
      }
    | {status: "unsupported"; error: string; plan?: StudioArtifactConversionPlan}
    | {status: "conflict"; error: string; plan: StudioArtifactConversionPlan}
    | {status: "generation-error"; code: string; error: string; plan?: StudioArtifactConversionPlan}
    | {status: "invalid"; errors: ValidationIssue[]; warnings: ValidationIssue[]; plan?: StudioArtifactConversionPlan}
    | {status: "load-error"; error: string; plan?: StudioArtifactConversionPlan};

export type StudioOutcomeLibraryRegistryModeEntry = {
    modeName: string;
    libraryId: string;
    bundleDir: string;
    buildStatus: "compatible" | "stale" | "wrong";
    outcomeCount: number;
    totalWeight: number;
    rtp: number;
    hash: string;
    strategy?: OutcomeLibraryGenerationStrategy;
    generatedAt?: string;
};

// GET /api/project/outcome-libraries/registry's own DTO — see
// cli/studio/outcomeLibrary/StudioOutcomeLibraryRegistryView.ts's own doc comment for what
// "compatible"/"stale"/"wrong"/"missing" mean.
export type StudioOutcomeLibraryRegistryView =
    | {status: "ok"; bundleDir: string; buildStatus: "missing"}
    | {
          status: "ok";
          bundleDir: string;
          buildStatus: "compatible" | "stale" | "wrong";
          game: {id: string; name: string; version: string};
          currentGame: {id: string; name: string; version: string};
          configHash?: string;
          artifactPokieVersion: string;
          currentPokieVersion: string;
          generatedAt: string;
          modes: StudioOutcomeLibraryRegistryModeEntry[];
      }
    | {status: "load-error"; error: string};

// POST /api/project/certification/validate-source's own DTO — see
// cli/studio/certification/StudioCertificationSourceValidateView.ts's own doc comment.
export type StudioCertificationSourceValidateView = {status: "ok"; errors: ValidationIssue[]; warnings: ValidationIssue[]} | {status: "load-error"; error: string};

// Mirrors pokie's own CertificationEvidenceBundleModeEntry/CertificationEvidenceDeepValidation/
// CertificationEvidenceBundleManifest (src/certification/CertificationEvidenceBundleManifest.ts) --
// every hash/metric here is read verbatim off the source outcome-library bundle's own manifest, never
// recomputed by Studio.
export type CertificationEvidenceBundleModeEntry = {
    modeName: string;
    betMode: string;
    stake: number;
    libraryId: string;
    libraryHash: string;
    outcomeCount: number;
    totalWeight: number;
    analysis: WeightedOutcomeLibraryAnalysis;
    sampleSeed: string;
    sampleCount: number;
    samplesFile: string;
    samplesHash: string;
};

export type CertificationEvidenceDeepValidation = {ranAt: string; issues: ValidationIssue[]};

export type CertificationEvidenceBundleManifest = {
    schemaVersion: number;
    generatedBy: string;
    pokieVersion: string;
    generatedAt: string;
    game: PokieGameManifest;
    configHash?: string;
    artifactPokieVersion: string;
    sourceBundleDir: string;
    sourceBundleManifestHash: string;
    modes: CertificationEvidenceBundleModeEntry[];
    deepValidation: CertificationEvidenceDeepValidation;
    files: string[];
    evidenceContentHash: string;
};

// POST /api/project/certification/build's own DTO — see
// cli/studio/certification/StudioCertificationBuildView.ts's own doc comment. Mirrors
// CertificationEvidenceBundleBuilder's own "no partial bundle" contract: `manifest` is present iff
// `status` is "ok".
export type StudioCertificationBuildView =
    | {status: "ok"; manifest: CertificationEvidenceBundleManifest; files: string[]; warnings: ValidationIssue[]}
    | {status: "error"; errors: ValidationIssue[]; warnings: ValidationIssue[]}
    | {status: "load-error"; error: string};

// Mirrors pokie's own FairnessServerSeedCommitment/FairnessCommitment/FairnessRoundProof
// (src/fairness/). See docs/provably-fair.md for the full commit-reveal flow these three artifacts
// form.
export type FairnessServerSeedCommitment = {schemaVersion: number; algorithmVersion: string; serverSeedHash: string; issuedAt: string};

export type FairnessCommitment = {
    schemaVersion: number;
    algorithmVersion: string;
    serverSeedHash: string;
    clientSeed: string;
    nonce: number;
    libraryId: string;
    libraryHash: string;
    modeName: string;
    issuedAt: string;
};

export type FairnessRoundProof = {
    schemaVersion: number;
    algorithmVersion: string;
    serverSeed: string;
    serverSeedHash: string;
    clientSeed: string;
    nonce: number;
    libraryId: string;
    libraryHash: string;
    modeName: string;
    indexHash: string;
    outcomeId: string;
    weight: number;
    recordHash: string;
    commitmentHash: string;
    revealedAt: string;
};

// POST /api/project/fairness/configure's own DTO — see
// cli/studio/fairness/StudioFairnessConfigureView.ts's own doc comment.
export type StudioFairnessConfigureView =
    | {status: "ok"; serverSeedCommitment: FairnessServerSeedCommitment; commitment: FairnessCommitment}
    | {status: "invalid"; message: string}
    | {status: "load-error"; error: string};

// POST /api/project/fairness/generate's own DTO — see
// cli/studio/fairness/StudioFairnessGenerateView.ts's own doc comment.
export type StudioFairnessGenerateView =
    | {status: "ok"; proof: FairnessRoundProof}
    | {status: "build-error"; code: string; message: string}
    | {status: "load-error"; error: string};

// POST /api/project/fairness/verify's own DTO — see
// cli/studio/fairness/StudioFairnessVerifyView.ts's own doc comment.
export type StudioFairnessVerifyView = {status: "ok"; errors: ValidationIssue[]; warnings: ValidationIssue[]} | {status: "load-error"; error: string};

// One mode row of a POST /api/project/stakeengine/{validate,export} request body — see
// cli/studio/stakeengine/StudioStakeEngineExportModeInput.ts's own doc comment.
export type StudioStakeEngineExportModeInput = {
    modeName: string;
    librarySelector: OutcomeLibrarySelector;
    cost: number;
};

// A per-mode provenance summary read straight off each loaded library — see
// cli/studio/stakeengine/StudioStakeEngineExportValidateView.ts's own doc comment. Never recomputed here.
export type StudioStakeEngineExportModeSummary = {
    modeName: string;
    cost: number;
    outcomeCount: number;
    libraryId: string;
    libraryHash: string;
};

// POST /api/project/stakeengine/validate's own DTO — see
// cli/studio/stakeengine/StudioStakeEngineExportValidateView.ts's own doc comment.
export type StudioStakeEngineExportValidateView =
    | {status: "ok"; modes: StudioStakeEngineExportModeSummary[]; errors: ValidationIssue[]; warnings: ValidationIssue[]; plan?: StudioArtifactConversionPlan}
    | {status: "load-error"; error: string; plan?: StudioArtifactConversionPlan};

// Mirrors pokie's own StakeEngineManifest/StakeEngineManifestModeEntry
// (src/stakeengine/StakeEngineManifest.ts) — every hash/metric here is read verbatim off the export
// result's own manifest, never recomputed by Studio.
export type StakeEngineManifestModeEntry = {
    name: string;
    betMode: string;
    stake: number;
    cost: number;
    outcomeCount: number;
    libraryId: string;
    libraryHash: string;
    events: string;
    weights: string;
};

export type StakeEngineManifest = {
    schemaVersion: number;
    generatedBy: string;
    pokieVersion: string;
    generatedAt: string;
    game: PokieGameManifest;
    configHash?: string;
    modes: StakeEngineManifestModeEntry[];
    files: string[];
};

// POST /api/project/stakeengine/export's own DTO — see
// cli/studio/stakeengine/StudioStakeEngineExportView.ts's own doc comment. Mirrors StakeEngineExporter's
// own "no partial export" contract: `manifest` is present iff `status` is "ok". "conflict" mirrors
// StudioParSheetExportView's own overwrite-confirmation contract — never a write. `overwritable` is only
// `true` when `outDir` is recognized as a prior Stake Engine export's own output — resubmitting with
// `overwrite: true` can never succeed otherwise, so the UI must never offer that action when it's `false`.
export type StudioStakeEngineExportView =
    | {status: "ok"; outDir: string; files: string[]; manifest: StakeEngineManifest; warnings: ValidationIssue[]; plan?: StudioArtifactConversionPlan}
    | {status: "conflict"; outDir: string; overwritable: boolean; error: string; plan?: StudioArtifactConversionPlan}
    | {status: "unavailable"; error: string; plan: StudioArtifactConversionPlan}
    | {status: "invalid"; errors: ValidationIssue[]; warnings: ValidationIssue[]; plan?: StudioArtifactConversionPlan}
    | {status: "load-error"; error: string; plan?: StudioArtifactConversionPlan};

// Mirrors the "pokie" package's own ArtifactTargetType -- the closed vocabulary ArtifactBuilderRegistry
// (and "pokie build <project> --target <target>") builds toward. Studio-client never imports the pokie
// package directly (see ExportDeployTargets.ts's own top-level doc comment), so this is a plain literal
// mirror, same convention as StudioProjectType above.
export type StudioArtifactTargetType = "tsPackage" | "outcomeLibrary" | "stakeAdapter" | "parWorkbook";

// JSON-safe mirror of the server planner.  Studio deliberately consumes this payload instead of maintaining
// another source/target table in the browser.
export type StudioArtifactConversionPlan = {
    status: "planned" | "unavailable" | "conflict";
    source: {kind: string; canonicalLocation?: string; recognitionProvenance?: string; capabilities: string[]; configurationProvenance?: {configurationHash?: string; pokieVersion?: string; generationSemantics?: "exact" | "boundedSample"; gameId?: string; gameVersion?: string; manifestIdentity?: string; sampleCount?: string; sampleSeed?: string}};
    target: {kind: string; canonicalLocation?: string; capabilities: string[]; configurationProvenance?: {generationSemantics?: "exact" | "boundedSample"; sampleCount?: string; sampleSeed?: string}};
    steps: {kind: "publish" | "materializeRuntime" | "generateOutcomeLibrary" | "reuseManagedOutcomeLibrary"; choice: "materialize" | "reuse" | "publish"; estimatedWork: "none" | "read" | "materialize" | "generate" | "publish"; losses?: string[]}[];
    preflight: {destinationKind: "file" | "directory"; estimatedWork: "none" | "read" | "materialize" | "generate" | "publish"; losses: string[]; oneWay: boolean};
    managedOutcome?: {disposition: "reused" | "ineligible"; reason?: string};
    diagnostic?: {code: "missing-capability" | "missing-data" | "unsupported-boundary" | "stale-provenance" | "destination-conflict"; failedEdge: {from: StudioProjectType; to: StudioArtifactTargetType}; message: string; recovery: string};
};

// GET /api/project/artifacts/targets' own DTO — see cli/studio/artifacts/StudioArtifactTargetView.ts's
// own doc comment. `supported` is already resolved against the active project's own ProjectType server-side
// (the exact same ArtifactBuilderRegistry.supportsConversionFrom() check "pokie build" itself runs) — the
// Build/Export tab never re-derives that rule itself.
export type StudioArtifactTargetView = {
    target: StudioArtifactTargetType;
    supported: boolean;
    state: "supported" | "diagnostic-required" | "hidden/unadvertised";
    diagnostic?: string;
    unsupportedNotes: string[];
    plan?: StudioArtifactConversionPlan;
};

// POST /api/project/artifacts/build's own DTO — see cli/studio/artifacts/StudioArtifactBuildView.ts's own
// doc comment. Mirrors ArtifactBuilderRegistry.build()'s own outcomes exactly: a successful build's
// outputPath/sourceType, an unsupported conversion, a destination conflict, or any other build failure.
export type StudioArtifactBuildView =
    | {
          status: "ok";
          target: StudioArtifactTargetType;
          outputPath: string;
          outputKind: "file" | "directory";
          sourceType: StudioProjectType;
          plan: StudioArtifactConversionPlan;
          preflight?: {estimatedItemCount?: string; estimatedBytes?: string; complexityWarning?: string};
      }
    | {status: "unsupported"; target: StudioArtifactTargetType; message: string; plan: StudioArtifactConversionPlan}
    | {status: "conflict"; target: StudioArtifactTargetType; message: string; plan: StudioArtifactConversionPlan}
    | {status: "cancelled"; message: string}
    | {status: "error"; message: string};

// The Build/Export artifact publisher is a server-side job, not a held-open request.  This lets the
// screen render the same ArtifactBuildOptions preflight/progress callbacks that the CLI receives.
export type StudioArtifactBuildJobView = {
    id: string;
    target: StudioArtifactTargetType;
    status: "queued" | "running" | "completed" | "failed" | "cancelled";
    cancellationRequested: boolean;
    progress?: {
        status: "preflight" | "running" | "completed" | "cancelled" | "failed";
        completed?: string;
        total?: string;
        preflight?: {estimatedItemCount?: string; estimatedBytes?: string; complexityWarning?: string};
        message?: string;
    };
    result?: StudioArtifactBuildView;
};

// POST /api/project/artifacts/preview's own DTO — see cli/studio/artifacts/StudioArtifactPreviewView.ts's
// own doc comment. The pre-build counterpart to StudioArtifactBuildView above: the same registry-resolved
// target/destination/sourceType and the same capability/conflict diagnostics a subsequent build would
// report, computed without ever writing anything.
export type StudioArtifactPreviewView =
    | {
          status: "ok";
          target: StudioArtifactTargetType;
          destination: string;
          destinationKind: "file" | "directory";
          plannedOutputs: string[];
          sourceType: StudioProjectType;
          plan: StudioArtifactConversionPlan;
      }
    | {status: "unsupported"; target: StudioArtifactTargetType; message: string; plan: StudioArtifactConversionPlan}
    | {
          status: "conflict";
          target: StudioArtifactTargetType;
          destination: string;
          destinationKind: "file" | "directory";
          plannedOutputs: string[];
          message: string;
          plan: StudioArtifactConversionPlan;
      }
    | {status: "error"; message: string};
