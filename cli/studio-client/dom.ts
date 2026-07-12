import {
    addReelStripSymbol,
    duplicateBetAt,
    duplicatePaylineAt,
    duplicatePaytablePayout,
    duplicateReelStripSymbolAt,
    duplicateSymbolAt,
    getReelGenerationMode,
    moveBetAt,
    movePaylineAt,
    moveReelStripSymbolAt,
    moveSymbolAt,
    removeBetAt,
    removePaylineAt,
    removePaytablePayout,
    removeReelStripSymbolAt,
    removeSymbolAt,
    removeSymbolWeight,
    setBetAt,
    setPaylineCell,
    setPaytablePayout,
    setReelStripSymbolAt,
    setSymbolAt,
    setSymbolWeight,
    toggleScatterSymbol,
    toggleWildSymbol,
    type ReelGenerationMode,
} from "./blueprintFormOps.js";
import type {BlueprintLoadView, BlueprintSaveView, BlueprintValidationView} from "./interpretBlueprintEditor.js";
import type {BuildPreviewView, BuildProjectView, HomeRecentProjectsListView, ScaffoldActionView} from "./interpretHome.js";
import type {InspectionResultView, ProjectHeaderView, ValidationSummaryView} from "./interpretProjectDashboard.js";
import type {ReplayListView, ReplayProgressView, ReplayResultView} from "./interpretReplay.js";
import type {ReportListView} from "./interpretReports.js";
import type {SimulationProgressView, SimulationReportView} from "./interpretSimulation.js";
import type {StudioHomeRecentProjectView, StudioReplayListEntry, StudioSimulationReportListEntry} from "./types.js";

// A single hand-off point from every dynamic row's add/remove/duplicate/move/edit control back to
// main.ts: run a pure mutator from blueprintFormOps.ts against a clone of the current blueprint, then
// let main.ts re-derive jsonText and re-render (see blueprintEditorState.ts's withFieldUpdate). Row
// wiring below calls blueprintFormOps functions directly (they're pure, DOM-independent) so this stays
// the only callback the Blueprint Editor's render functions need.
export type BlueprintMutate = (mutate: (blueprint: Record<string, unknown>) => void) => void;

export type ProjectTab = "overview" | "validation" | "simulation" | "reports" | "replay";
export type HomeTab = "recent" | "create" | "init" | "build" | "open" | "blueprint-editor";

// One report's worth of display fields — factored out so the exact same renderSimulationReport()
// below can fill in both the Simulation tab's own "just completed" block and the Reports tab's
// detail view, without duplicating the field-by-field rendering logic twice.
export type SimulationReportElements = {
    container: HTMLElement;
    game: HTMLElement;
    rounds: HTMLElement;
    seed: HTMLElement;
    totalBet: HTMLElement;
    totalWin: HTMLElement;
    rtp: HTMLElement;
    hitFrequency: HTMLElement;
    volatility: HTMLElement;
    confidenceInterval: HTMLElement;
    maxWin: HTMLElement;
    duration: HTMLElement;
    breakdownSection: HTMLElement;
    breakdownBody: HTMLElement;
    warningsSection: HTMLElement;
    warningsList: HTMLElement;
    reproducibility: HTMLElement;
};

export type Elements = {
    status: HTMLElement;
    homeView: HTMLElement;
    projectView: HTMLElement;
    homeTabs: HTMLElement;
    homeTabRecentButton: HTMLButtonElement;
    homeTabCreateButton: HTMLButtonElement;
    homeTabInitButton: HTMLButtonElement;
    homeTabBuildButton: HTMLButtonElement;
    homeTabOpenButton: HTMLButtonElement;
    homeRecentSection: HTMLElement;
    homeRecentRefreshButton: HTMLButtonElement;
    homeRecentEmpty: HTMLElement;
    homeRecentError: HTMLElement;
    homeRecentList: HTMLElement;
    homeCreateSection: HTMLElement;
    homeCreateForm: HTMLFormElement;
    homeCreateDestination: HTMLInputElement;
    homeCreateName: HTMLInputElement;
    homeCreateGameId: HTMLInputElement;
    homeCreateGameName: HTMLInputElement;
    homeCreateVersion: HTMLInputElement;
    homeCreateLoading: HTMLElement;
    homeCreateError: HTMLElement;
    homeCreateResult: HTMLElement;
    homeCreateResultSummary: HTMLElement;
    homeCreateResultCreatedSection: HTMLElement;
    homeCreateResultCreated: HTMLElement;
    homeCreateNextSteps: HTMLElement;
    homeCreateOpenButton: HTMLButtonElement;
    homeInitSection: HTMLElement;
    homeInitForm: HTMLFormElement;
    homeInitDirectory: HTMLInputElement;
    homeInitLoading: HTMLElement;
    homeInitError: HTMLElement;
    homeInitResult: HTMLElement;
    homeInitResultSummary: HTMLElement;
    homeInitResultCreatedSection: HTMLElement;
    homeInitResultCreated: HTMLElement;
    homeInitResultUpdatedSection: HTMLElement;
    homeInitResultUpdated: HTMLElement;
    homeInitResultSkippedSection: HTMLElement;
    homeInitResultSkipped: HTMLElement;
    homeInitOpenButton: HTMLButtonElement;
    homeBuildSection: HTMLElement;
    homeBuildForm: HTMLFormElement;
    homeBuildBlueprintPath: HTMLInputElement;
    homeBuildOutDir: HTMLInputElement;
    homeBuildPreviewButton: HTMLButtonElement;
    homeBuildRunButton: HTMLButtonElement;
    homeBuildLoading: HTMLElement;
    homeBuildError: HTMLElement;
    homeBuildPreview: HTMLElement;
    homeBuildPreviewLoadError: HTMLElement;
    homeBuildPreviewOk: HTMLElement;
    homeBuildPreviewGame: HTMLElement;
    homeBuildPreviewReelsRows: HTMLElement;
    homeBuildPreviewSymbols: HTMLElement;
    homeBuildPreviewHash: HTMLElement;
    homeBuildPreviewFiles: HTMLElement;
    homeBuildPreviewWarningsSection: HTMLElement;
    homeBuildPreviewWarnings: HTMLElement;
    homeBuildPreviewErrorsSection: HTMLElement;
    homeBuildPreviewErrors: HTMLElement;
    homeBuildResult: HTMLElement;
    homeBuildResultSummary: HTMLElement;
    homeBuildResultWarningsSection: HTMLElement;
    homeBuildResultWarnings: HTMLElement;
    homeBuildResultCreatedSection: HTMLElement;
    homeBuildResultCreated: HTMLElement;
    homeBuildOpenButton: HTMLButtonElement;
    homeOpenSection: HTMLElement;
    homeOpenForm: HTMLFormElement;
    homeOpenPath: HTMLInputElement;
    homeOpenLoading: HTMLElement;
    homeOpenError: HTMLElement;
    closeProjectButton: HTMLButtonElement;
    projectTitle: HTMLElement;
    projectSubtitle: HTMLElement;
    projectEmpty: HTMLElement;
    projectLoading: HTMLElement;
    projectError: HTMLElement;
    projectTabs: HTMLElement;
    tabOverviewButton: HTMLButtonElement;
    tabValidationButton: HTMLButtonElement;
    projectOverviewSection: HTMLElement;
    projectValidationSection: HTMLElement;
    projectId: HTMLElement;
    projectVersion: HTMLElement;
    projectRoot: HTMLElement;
    inspectButton: HTMLButtonElement;
    inspectLoading: HTMLElement;
    inspectError: HTMLElement;
    inspectReport: HTMLElement;
    inspectPackageName: HTMLElement;
    inspectPackageVersion: HTMLElement;
    inspectPackageRoot: HTMLElement;
    provenanceGenerated: HTMLElement;
    provenanceNotGenerated: HTMLElement;
    provenanceError: HTMLElement;
    provenanceDetails: HTMLElement;
    provenanceHash: HTMLElement;
    provenanceSource: HTMLElement;
    provenancePokieVersion: HTMLElement;
    provenanceGeneratedAt: HTMLElement;
    provenanceFiles: HTMLElement;
    validateQuickActionButton: HTMLButtonElement;
    runValidateButton: HTMLButtonElement;
    validationStatus: HTMLElement;
    validationSummary: HTMLElement;
    validationErrorsSection: HTMLElement;
    validationErrorsList: HTMLElement;
    validationWarningsSection: HTMLElement;
    validationWarningsList: HTMLElement;
    validationSuggestionsSection: HTMLElement;
    validationSuggestionsList: HTMLElement;
    tabSimulationButton: HTMLButtonElement;
    projectSimulationSection: HTMLElement;
    simulationForm: HTMLFormElement;
    simulationRoundsInput: HTMLInputElement;
    simulationSeedInput: HTMLInputElement;
    simulationRunButton: HTMLButtonElement;
    simulationIdle: HTMLElement;
    simulationError: HTMLElement;
    simulationProgress: HTMLElement;
    simulationStatusText: HTMLElement;
    simulationProgressText: HTMLElement;
    simulationCancelButton: HTMLButtonElement;
    simulationRerunButton: HTMLButtonElement;
    simulationViewInReportsButton: HTMLButtonElement;
    simulationReport: SimulationReportElements;
    tabReportsButton: HTMLButtonElement;
    projectReportsSection: HTMLElement;
    reportsRefreshButton: HTMLButtonElement;
    reportsEmpty: HTMLElement;
    reportsError: HTMLElement;
    reportsList: HTMLElement;
    reportDetail: HTMLElement;
    reportDetailEmpty: HTMLElement;
    reportDetailLoading: HTMLElement;
    reportDetailError: HTMLElement;
    reportDetailActions: HTMLElement;
    reportDownloadJson: HTMLAnchorElement;
    reportDownloadMarkdown: HTMLAnchorElement;
    reportDownloadHtml: HTMLAnchorElement;
    reportBackToSimulationButton: HTMLButtonElement;
    reportDetailReport: SimulationReportElements;
    tabReplayButton: HTMLButtonElement;
    projectReplaySection: HTMLElement;
    replayForm: HTMLFormElement;
    replayRoundInput: HTMLInputElement;
    replaySeedInput: HTMLInputElement;
    replayRunButton: HTMLButtonElement;
    replayIdle: HTMLElement;
    replayError: HTMLElement;
    replayProgress: HTMLElement;
    replayStatusText: HTMLElement;
    replayProgressText: HTMLElement;
    replayCancelButton: HTMLButtonElement;
    replayRerunButton: HTMLButtonElement;
    replayResult: HTMLElement;
    replayResultGame: HTMLElement;
    replayResultRound: HTMLElement;
    replayResultSeed: HTMLElement;
    replayResultTotalBet: HTMLElement;
    replayResultTotalWin: HTMLElement;
    replayResultTimestamp: HTMLElement;
    replayResultDuration: HTMLElement;
    replayResultScreenSection: HTMLElement;
    replayResultScreenBody: HTMLElement;
    replayResultNoScreen: HTMLElement;
    replayDownloadJson: HTMLAnchorElement;
    replayListRefreshButton: HTMLButtonElement;
    replayListEmpty: HTMLElement;
    replayListError: HTMLElement;
    replayList: HTMLElement;
    homeTabBlueprintEditorButton: HTMLButtonElement;
    homeBlueprintEditorSection: HTMLElement;
    blueprintNewButton: HTMLButtonElement;
    blueprintLoadPath: HTMLInputElement;
    blueprintLoadButton: HTMLButtonElement;
    blueprintSavePath: HTMLInputElement;
    blueprintSaveButton: HTMLButtonElement;
    blueprintLoadError: HTMLElement;
    blueprintSaveConflict: HTMLElement;
    blueprintSaveConflictMessage: HTMLElement;
    blueprintSaveOverwriteButton: HTMLButtonElement;
    blueprintSaveError: HTMLElement;
    blueprintSaveOk: HTMLElement;
    blueprintModeFormButton: HTMLButtonElement;
    blueprintModeJsonButton: HTMLButtonElement;
    blueprintFormView: HTMLElement;
    blueprintJsonView: HTMLElement;
    blueprintFieldId: HTMLInputElement;
    blueprintFieldName: HTMLInputElement;
    blueprintFieldVersion: HTMLInputElement;
    blueprintFieldDescription: HTMLInputElement;
    blueprintFieldAuthor: HTMLInputElement;
    blueprintFieldReels: HTMLInputElement;
    blueprintFieldRows: HTMLInputElement;
    blueprintSymbolsBody: HTMLElement;
    blueprintAddSymbolInput: HTMLInputElement;
    blueprintAddSymbolButton: HTMLButtonElement;
    blueprintBetsList: HTMLElement;
    blueprintAddBetInput: HTMLInputElement;
    blueprintAddBetButton: HTMLButtonElement;
    blueprintPaylinesList: HTMLElement;
    blueprintAddPaylineButton: HTMLButtonElement;
    blueprintPaytableBody: HTMLElement;
    blueprintAddPaytableSymbol: HTMLSelectElement;
    blueprintAddPaytableMatchCount: HTMLInputElement;
    blueprintAddPaytablePayout: HTMLInputElement;
    blueprintAddPaytableButton: HTMLButtonElement;
    blueprintModeDefaultRadio: HTMLInputElement;
    blueprintModeReelStripsRadio: HTMLInputElement;
    blueprintModeWeightsRadio: HTMLInputElement;
    blueprintReelStripsSection: HTMLElement;
    blueprintReelStripsContainer: HTMLElement;
    blueprintWeightsSection: HTMLElement;
    blueprintWeightsBody: HTMLElement;
    blueprintAddWeightSymbol: HTMLSelectElement;
    blueprintAddWeightValue: HTMLInputElement;
    blueprintAddWeightButton: HTMLButtonElement;
    blueprintJsonTextarea: HTMLTextAreaElement;
    blueprintJsonApplyButton: HTMLButtonElement;
    blueprintJsonError: HTMLElement;
    blueprintValidateButton: HTMLButtonElement;
    blueprintValidationStatus: HTMLElement;
    blueprintValidationErrorsSection: HTMLElement;
    blueprintValidationErrors: HTMLElement;
    blueprintValidationWarningsSection: HTMLElement;
    blueprintValidationWarnings: HTMLElement;
    blueprintOutDir: HTMLInputElement;
    blueprintBuildPreviewButton: HTMLButtonElement;
    blueprintBuildButton: HTMLButtonElement;
    blueprintBuildLoading: HTMLElement;
    blueprintBuildError: HTMLElement;
    blueprintBuildPreview: HTMLElement;
    blueprintBuildPreviewLoadError: HTMLElement;
    blueprintBuildPreviewOk: HTMLElement;
    blueprintBuildPreviewGame: HTMLElement;
    blueprintBuildPreviewReelsRows: HTMLElement;
    blueprintBuildPreviewSymbols: HTMLElement;
    blueprintBuildPreviewHash: HTMLElement;
    blueprintBuildPreviewFiles: HTMLElement;
    blueprintBuildPreviewWarningsSection: HTMLElement;
    blueprintBuildPreviewWarnings: HTMLElement;
    blueprintBuildPreviewErrorsSection: HTMLElement;
    blueprintBuildPreviewErrors: HTMLElement;
    blueprintBuildResult: HTMLElement;
    blueprintBuildResultSummary: HTMLElement;
    blueprintBuildResultWarningsSection: HTMLElement;
    blueprintBuildResultWarnings: HTMLElement;
    blueprintBuildResultCreatedSection: HTMLElement;
    blueprintBuildResultCreated: HTMLElement;
    blueprintBuildOpenButton: HTMLButtonElement;
};

function requireElement<T extends HTMLElement>(id: string): T {
    const el = document.getElementById(id);
    if (el === null) {
        throw new Error(`Missing #${id} in index.html.`);
    }
    return el as T;
}

// `prefix` itself is the report container's own id; every field below follows `${prefix}-<field>` —
// used to build both the Simulation tab's "just completed" block (prefix "simulation-report") and
// the Reports tab's detail view (prefix "report-detail") from the exact same id-naming convention.
function querySimulationReportElements(prefix: string): SimulationReportElements {
    return {
        container: requireElement(prefix),
        game: requireElement(`${prefix}-game`),
        rounds: requireElement(`${prefix}-rounds`),
        seed: requireElement(`${prefix}-seed`),
        totalBet: requireElement(`${prefix}-total-bet`),
        totalWin: requireElement(`${prefix}-total-win`),
        rtp: requireElement(`${prefix}-rtp`),
        hitFrequency: requireElement(`${prefix}-hit-frequency`),
        volatility: requireElement(`${prefix}-volatility`),
        confidenceInterval: requireElement(`${prefix}-confidence-interval`),
        maxWin: requireElement(`${prefix}-max-win`),
        duration: requireElement(`${prefix}-duration`),
        breakdownSection: requireElement(`${prefix}-breakdown-section`),
        breakdownBody: requireElement(`${prefix}-breakdown-body`),
        warningsSection: requireElement(`${prefix}-warnings-section`),
        warningsList: requireElement(`${prefix}-warnings`),
        reproducibility: requireElement(`${prefix}-reproducibility`),
    };
}

export function queryElements(): Elements {
    return {
        status: requireElement("status"),
        homeView: requireElement("home-view"),
        projectView: requireElement("project-view"),
        homeTabs: requireElement("home-tabs"),
        homeTabRecentButton: requireElement("home-tab-recent"),
        homeTabCreateButton: requireElement("home-tab-create"),
        homeTabInitButton: requireElement("home-tab-init"),
        homeTabBuildButton: requireElement("home-tab-build"),
        homeTabOpenButton: requireElement("home-tab-open"),
        homeRecentSection: requireElement("home-recent"),
        homeRecentRefreshButton: requireElement("home-recent-refresh-button"),
        homeRecentEmpty: requireElement("home-recent-empty"),
        homeRecentError: requireElement("home-recent-error"),
        homeRecentList: requireElement("home-recent-list"),
        homeCreateSection: requireElement("home-create"),
        homeCreateForm: requireElement("home-create-form"),
        homeCreateDestination: requireElement("home-create-destination"),
        homeCreateName: requireElement("home-create-name"),
        homeCreateGameId: requireElement("home-create-game-id"),
        homeCreateGameName: requireElement("home-create-game-name"),
        homeCreateVersion: requireElement("home-create-version"),
        homeCreateLoading: requireElement("home-create-loading"),
        homeCreateError: requireElement("home-create-error"),
        homeCreateResult: requireElement("home-create-result"),
        homeCreateResultSummary: requireElement("home-create-result-summary"),
        homeCreateResultCreatedSection: requireElement("home-create-result-created-section"),
        homeCreateResultCreated: requireElement("home-create-result-created"),
        homeCreateNextSteps: requireElement("home-create-next-steps"),
        homeCreateOpenButton: requireElement("home-create-open-button"),
        homeInitSection: requireElement("home-init"),
        homeInitForm: requireElement("home-init-form"),
        homeInitDirectory: requireElement("home-init-directory"),
        homeInitLoading: requireElement("home-init-loading"),
        homeInitError: requireElement("home-init-error"),
        homeInitResult: requireElement("home-init-result"),
        homeInitResultSummary: requireElement("home-init-result-summary"),
        homeInitResultCreatedSection: requireElement("home-init-result-created-section"),
        homeInitResultCreated: requireElement("home-init-result-created"),
        homeInitResultUpdatedSection: requireElement("home-init-result-updated-section"),
        homeInitResultUpdated: requireElement("home-init-result-updated"),
        homeInitResultSkippedSection: requireElement("home-init-result-skipped-section"),
        homeInitResultSkipped: requireElement("home-init-result-skipped"),
        homeInitOpenButton: requireElement("home-init-open-button"),
        homeBuildSection: requireElement("home-build"),
        homeBuildForm: requireElement("home-build-form"),
        homeBuildBlueprintPath: requireElement("home-build-blueprint-path"),
        homeBuildOutDir: requireElement("home-build-out-dir"),
        homeBuildPreviewButton: requireElement("home-build-preview-button"),
        homeBuildRunButton: requireElement("home-build-run-button"),
        homeBuildLoading: requireElement("home-build-loading"),
        homeBuildError: requireElement("home-build-error"),
        homeBuildPreview: requireElement("home-build-preview"),
        homeBuildPreviewLoadError: requireElement("home-build-preview-load-error"),
        homeBuildPreviewOk: requireElement("home-build-preview-ok"),
        homeBuildPreviewGame: requireElement("home-build-preview-game"),
        homeBuildPreviewReelsRows: requireElement("home-build-preview-reels-rows"),
        homeBuildPreviewSymbols: requireElement("home-build-preview-symbols"),
        homeBuildPreviewHash: requireElement("home-build-preview-hash"),
        homeBuildPreviewFiles: requireElement("home-build-preview-files"),
        homeBuildPreviewWarningsSection: requireElement("home-build-preview-warnings-section"),
        homeBuildPreviewWarnings: requireElement("home-build-preview-warnings"),
        homeBuildPreviewErrorsSection: requireElement("home-build-preview-errors-section"),
        homeBuildPreviewErrors: requireElement("home-build-preview-errors"),
        homeBuildResult: requireElement("home-build-result"),
        homeBuildResultSummary: requireElement("home-build-result-summary"),
        homeBuildResultWarningsSection: requireElement("home-build-result-warnings-section"),
        homeBuildResultWarnings: requireElement("home-build-result-warnings"),
        homeBuildResultCreatedSection: requireElement("home-build-result-created-section"),
        homeBuildResultCreated: requireElement("home-build-result-created"),
        homeBuildOpenButton: requireElement("home-build-open-button"),
        homeOpenSection: requireElement("home-open"),
        homeOpenForm: requireElement("home-open-form"),
        homeOpenPath: requireElement("home-open-path"),
        homeOpenLoading: requireElement("home-open-loading"),
        homeOpenError: requireElement("home-open-error"),
        closeProjectButton: requireElement("close-project"),
        projectTitle: requireElement("project-title"),
        projectSubtitle: requireElement("project-subtitle"),
        projectEmpty: requireElement("project-empty"),
        projectLoading: requireElement("project-loading"),
        projectError: requireElement("project-error"),
        projectTabs: requireElement("project-tabs"),
        tabOverviewButton: requireElement("tab-overview"),
        tabValidationButton: requireElement("tab-validation"),
        projectOverviewSection: requireElement("project-overview"),
        projectValidationSection: requireElement("project-validation"),
        projectId: requireElement("project-id"),
        projectVersion: requireElement("project-version"),
        projectRoot: requireElement("project-root"),
        inspectButton: requireElement("inspect-button"),
        inspectLoading: requireElement("inspect-loading"),
        inspectError: requireElement("inspect-error"),
        inspectReport: requireElement("inspect-report"),
        inspectPackageName: requireElement("inspect-package-name"),
        inspectPackageVersion: requireElement("inspect-package-version"),
        inspectPackageRoot: requireElement("inspect-package-root"),
        provenanceGenerated: requireElement("provenance-generated"),
        provenanceNotGenerated: requireElement("provenance-not-generated"),
        provenanceError: requireElement("provenance-error"),
        provenanceDetails: requireElement("provenance-details"),
        provenanceHash: requireElement("provenance-hash"),
        provenanceSource: requireElement("provenance-source"),
        provenancePokieVersion: requireElement("provenance-pokie-version"),
        provenanceGeneratedAt: requireElement("provenance-generated-at"),
        provenanceFiles: requireElement("provenance-files"),
        validateQuickActionButton: requireElement("validate-quick-action"),
        runValidateButton: requireElement("run-validate-button"),
        validationStatus: requireElement("validation-status"),
        validationSummary: requireElement("validation-summary"),
        validationErrorsSection: requireElement("validation-errors-section"),
        validationErrorsList: requireElement("validation-errors"),
        validationWarningsSection: requireElement("validation-warnings-section"),
        validationWarningsList: requireElement("validation-warnings"),
        validationSuggestionsSection: requireElement("validation-suggestions-section"),
        validationSuggestionsList: requireElement("validation-suggestions"),
        tabSimulationButton: requireElement("tab-simulation"),
        projectSimulationSection: requireElement("project-simulation"),
        simulationForm: requireElement("simulation-form"),
        simulationRoundsInput: requireElement("simulation-rounds"),
        simulationSeedInput: requireElement("simulation-seed"),
        simulationRunButton: requireElement("simulation-run-button"),
        simulationIdle: requireElement("simulation-idle"),
        simulationError: requireElement("simulation-error"),
        simulationProgress: requireElement("simulation-progress"),
        simulationStatusText: requireElement("simulation-status-text"),
        simulationProgressText: requireElement("simulation-progress-text"),
        simulationCancelButton: requireElement("simulation-cancel-button"),
        simulationRerunButton: requireElement("simulation-rerun-button"),
        simulationViewInReportsButton: requireElement("simulation-view-in-reports-button"),
        simulationReport: querySimulationReportElements("simulation-report"),
        tabReportsButton: requireElement("tab-reports"),
        projectReportsSection: requireElement("project-reports"),
        reportsRefreshButton: requireElement("reports-refresh-button"),
        reportsEmpty: requireElement("reports-empty"),
        reportsError: requireElement("reports-error"),
        reportsList: requireElement("reports-list"),
        reportDetail: requireElement("report-detail"),
        reportDetailEmpty: requireElement("report-detail-empty"),
        reportDetailLoading: requireElement("report-detail-loading"),
        reportDetailError: requireElement("report-detail-error"),
        reportDetailActions: requireElement("report-detail-actions"),
        reportDownloadJson: requireElement("report-download-json"),
        reportDownloadMarkdown: requireElement("report-download-markdown"),
        reportDownloadHtml: requireElement("report-download-html"),
        reportBackToSimulationButton: requireElement("report-back-to-simulation-button"),
        reportDetailReport: querySimulationReportElements("report-detail"),
        tabReplayButton: requireElement("tab-replay"),
        projectReplaySection: requireElement("project-replay"),
        replayForm: requireElement("replay-form"),
        replayRoundInput: requireElement("replay-round"),
        replaySeedInput: requireElement("replay-seed"),
        replayRunButton: requireElement("replay-run-button"),
        replayIdle: requireElement("replay-idle"),
        replayError: requireElement("replay-error"),
        replayProgress: requireElement("replay-progress"),
        replayStatusText: requireElement("replay-status-text"),
        replayProgressText: requireElement("replay-progress-text"),
        replayCancelButton: requireElement("replay-cancel-button"),
        replayRerunButton: requireElement("replay-rerun-button"),
        replayResult: requireElement("replay-result"),
        replayResultGame: requireElement("replay-result-game"),
        replayResultRound: requireElement("replay-result-round"),
        replayResultSeed: requireElement("replay-result-seed"),
        replayResultTotalBet: requireElement("replay-result-total-bet"),
        replayResultTotalWin: requireElement("replay-result-total-win"),
        replayResultTimestamp: requireElement("replay-result-timestamp"),
        replayResultDuration: requireElement("replay-result-duration"),
        replayResultScreenSection: requireElement("replay-result-screen-section"),
        replayResultScreenBody: requireElement("replay-result-screen-body"),
        replayResultNoScreen: requireElement("replay-result-no-screen"),
        replayDownloadJson: requireElement("replay-download-json"),
        replayListRefreshButton: requireElement("replay-list-refresh-button"),
        replayListEmpty: requireElement("replay-list-empty"),
        replayListError: requireElement("replay-list-error"),
        replayList: requireElement("replay-list"),
        homeTabBlueprintEditorButton: requireElement("home-tab-blueprint-editor"),
        homeBlueprintEditorSection: requireElement("home-blueprint-editor"),
        blueprintNewButton: requireElement("blueprint-new-button"),
        blueprintLoadPath: requireElement("blueprint-load-path"),
        blueprintLoadButton: requireElement("blueprint-load-button"),
        blueprintSavePath: requireElement("blueprint-save-path"),
        blueprintSaveButton: requireElement("blueprint-save-button"),
        blueprintLoadError: requireElement("blueprint-load-error"),
        blueprintSaveConflict: requireElement("blueprint-save-conflict"),
        blueprintSaveConflictMessage: requireElement("blueprint-save-conflict-message"),
        blueprintSaveOverwriteButton: requireElement("blueprint-save-overwrite-button"),
        blueprintSaveError: requireElement("blueprint-save-error"),
        blueprintSaveOk: requireElement("blueprint-save-ok"),
        blueprintModeFormButton: requireElement("blueprint-mode-form-button"),
        blueprintModeJsonButton: requireElement("blueprint-mode-json-button"),
        blueprintFormView: requireElement("blueprint-form-view"),
        blueprintJsonView: requireElement("blueprint-json-view"),
        blueprintFieldId: requireElement("blueprint-field-id"),
        blueprintFieldName: requireElement("blueprint-field-name"),
        blueprintFieldVersion: requireElement("blueprint-field-version"),
        blueprintFieldDescription: requireElement("blueprint-field-description"),
        blueprintFieldAuthor: requireElement("blueprint-field-author"),
        blueprintFieldReels: requireElement("blueprint-field-reels"),
        blueprintFieldRows: requireElement("blueprint-field-rows"),
        blueprintSymbolsBody: requireElement("blueprint-symbols-body"),
        blueprintAddSymbolInput: requireElement("blueprint-add-symbol-input"),
        blueprintAddSymbolButton: requireElement("blueprint-add-symbol-button"),
        blueprintBetsList: requireElement("blueprint-bets-list"),
        blueprintAddBetInput: requireElement("blueprint-add-bet-input"),
        blueprintAddBetButton: requireElement("blueprint-add-bet-button"),
        blueprintPaylinesList: requireElement("blueprint-paylines-list"),
        blueprintAddPaylineButton: requireElement("blueprint-add-payline-button"),
        blueprintPaytableBody: requireElement("blueprint-paytable-body"),
        blueprintAddPaytableSymbol: requireElement("blueprint-add-paytable-symbol"),
        blueprintAddPaytableMatchCount: requireElement("blueprint-add-paytable-matchcount"),
        blueprintAddPaytablePayout: requireElement("blueprint-add-paytable-payout"),
        blueprintAddPaytableButton: requireElement("blueprint-add-paytable-button"),
        blueprintModeDefaultRadio: requireElement("blueprint-mode-default"),
        blueprintModeReelStripsRadio: requireElement("blueprint-mode-reelstrips"),
        blueprintModeWeightsRadio: requireElement("blueprint-mode-weights"),
        blueprintReelStripsSection: requireElement("blueprint-reelstrips-section"),
        blueprintReelStripsContainer: requireElement("blueprint-reelstrips-container"),
        blueprintWeightsSection: requireElement("blueprint-weights-section"),
        blueprintWeightsBody: requireElement("blueprint-weights-body"),
        blueprintAddWeightSymbol: requireElement("blueprint-add-weight-symbol"),
        blueprintAddWeightValue: requireElement("blueprint-add-weight-value"),
        blueprintAddWeightButton: requireElement("blueprint-add-weight-button"),
        blueprintJsonTextarea: requireElement("blueprint-json-textarea"),
        blueprintJsonApplyButton: requireElement("blueprint-json-apply-button"),
        blueprintJsonError: requireElement("blueprint-json-error"),
        blueprintValidateButton: requireElement("blueprint-validate-button"),
        blueprintValidationStatus: requireElement("blueprint-validation-status"),
        blueprintValidationErrorsSection: requireElement("blueprint-validation-errors-section"),
        blueprintValidationErrors: requireElement("blueprint-validation-errors"),
        blueprintValidationWarningsSection: requireElement("blueprint-validation-warnings-section"),
        blueprintValidationWarnings: requireElement("blueprint-validation-warnings"),
        blueprintOutDir: requireElement("blueprint-out-dir"),
        blueprintBuildPreviewButton: requireElement("blueprint-build-preview-button"),
        blueprintBuildButton: requireElement("blueprint-build-button"),
        blueprintBuildLoading: requireElement("blueprint-build-loading"),
        blueprintBuildError: requireElement("blueprint-build-error"),
        blueprintBuildPreview: requireElement("blueprint-build-preview"),
        blueprintBuildPreviewLoadError: requireElement("blueprint-build-preview-load-error"),
        blueprintBuildPreviewOk: requireElement("blueprint-build-preview-ok"),
        blueprintBuildPreviewGame: requireElement("blueprint-build-preview-game"),
        blueprintBuildPreviewReelsRows: requireElement("blueprint-build-preview-reels-rows"),
        blueprintBuildPreviewSymbols: requireElement("blueprint-build-preview-symbols"),
        blueprintBuildPreviewHash: requireElement("blueprint-build-preview-hash"),
        blueprintBuildPreviewFiles: requireElement("blueprint-build-preview-files"),
        blueprintBuildPreviewWarningsSection: requireElement("blueprint-build-preview-warnings-section"),
        blueprintBuildPreviewWarnings: requireElement("blueprint-build-preview-warnings"),
        blueprintBuildPreviewErrorsSection: requireElement("blueprint-build-preview-errors-section"),
        blueprintBuildPreviewErrors: requireElement("blueprint-build-preview-errors"),
        blueprintBuildResult: requireElement("blueprint-build-result"),
        blueprintBuildResultSummary: requireElement("blueprint-build-result-summary"),
        blueprintBuildResultWarningsSection: requireElement("blueprint-build-result-warnings-section"),
        blueprintBuildResultWarnings: requireElement("blueprint-build-result-warnings"),
        blueprintBuildResultCreatedSection: requireElement("blueprint-build-result-created-section"),
        blueprintBuildResultCreated: requireElement("blueprint-build-result-created"),
        blueprintBuildOpenButton: requireElement("blueprint-build-open-button"),
    };
}

export function showView(elements: Elements, route: "home" | "project"): void {
    elements.homeView.hidden = route !== "home";
    elements.projectView.hidden = route !== "project";
}

export function setStatus(element: HTMLElement, message: string): void {
    element.textContent = message;
}

export function showHomeTab(elements: Elements, tab: HomeTab): void {
    elements.homeRecentSection.hidden = tab !== "recent";
    elements.homeCreateSection.hidden = tab !== "create";
    elements.homeInitSection.hidden = tab !== "init";
    elements.homeBuildSection.hidden = tab !== "build";
    elements.homeOpenSection.hidden = tab !== "open";
    elements.homeBlueprintEditorSection.hidden = tab !== "blueprint-editor";
    elements.homeTabRecentButton.setAttribute("aria-current", tab === "recent" ? "page" : "false");
    elements.homeTabCreateButton.setAttribute("aria-current", tab === "create" ? "page" : "false");
    elements.homeTabInitButton.setAttribute("aria-current", tab === "init" ? "page" : "false");
    elements.homeTabBuildButton.setAttribute("aria-current", tab === "build" ? "page" : "false");
    elements.homeTabOpenButton.setAttribute("aria-current", tab === "open" ? "page" : "false");
    elements.homeTabBlueprintEditorButton.setAttribute("aria-current", tab === "blueprint-editor" ? "page" : "false");
}

export type BlueprintMode = "form" | "json";

export function showBlueprintMode(elements: Elements, mode: BlueprintMode): void {
    elements.blueprintFormView.hidden = mode !== "form";
    elements.blueprintJsonView.hidden = mode !== "json";
    elements.blueprintModeFormButton.setAttribute("aria-current", mode === "form" ? "page" : "false");
    elements.blueprintModeJsonButton.setAttribute("aria-current", mode === "json" ? "page" : "false");
}

export function renderHomeRecentProjects(
    elements: Elements,
    view: HomeRecentProjectsListView,
    onOpen: (entry: StudioHomeRecentProjectView) => void,
): void {
    elements.homeRecentError.hidden = true;
    elements.homeRecentEmpty.hidden = view.status !== "empty";
    elements.homeRecentList.textContent = "";
    if (view.status === "empty") {
        return;
    }

    for (const entry of view.entries) {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.disabled = entry.missing;
        const openedAt = new Date(entry.openedAt).toLocaleString();
        button.textContent = entry.missing
            ? `${entry.name} — ${entry.projectRoot} (missing), last opened ${openedAt}`
            : `${entry.name} — ${entry.projectRoot}, last opened ${openedAt}`;
        if (!entry.missing) {
            button.addEventListener("click", () => onOpen(entry));
        }
        item.appendChild(button);
        elements.homeRecentList.appendChild(item);
    }
}

export function renderHomeRecentProjectsError(elements: Elements, message: string): void {
    elements.homeRecentError.hidden = false;
    elements.homeRecentError.textContent = message;
}

function renderScaffoldResult(
    view: ScaffoldActionView,
    loadingEl: HTMLElement,
    errorEl: HTMLElement,
    resultEl: HTMLElement,
    summaryEl: HTMLElement,
    createdSectionEl: HTMLElement,
    createdListEl: HTMLElement,
): void {
    loadingEl.hidden = view.status !== "loading";
    errorEl.hidden = view.status !== "error" && view.status !== "failed";
    resultEl.hidden = view.status !== "ok";

    if (view.status === "error" || view.status === "failed") {
        errorEl.textContent = view.message;
        return;
    }
    if (view.status !== "ok") {
        return;
    }

    summaryEl.textContent = `"${view.manifest.name}" (id: "${view.manifest.id}", v${view.manifest.version}) at "${view.projectRoot}".`;
    createdSectionEl.hidden = view.createdFiles.length === 0;
    renderFileList(createdListEl, view.createdFiles);
}

function renderFileList(container: HTMLElement, files: string[]): void {
    container.textContent = "";
    for (const file of files) {
        const item = document.createElement("li");
        item.textContent = file;
        container.appendChild(item);
    }
}

export function renderCreateResult(elements: Elements, view: ScaffoldActionView): void {
    renderScaffoldResult(
        view,
        elements.homeCreateLoading,
        elements.homeCreateError,
        elements.homeCreateResult,
        elements.homeCreateResultSummary,
        elements.homeCreateResultCreatedSection,
        elements.homeCreateResultCreated,
    );
    if (view.status === "ok") {
        elements.homeCreateNextSteps.textContent = `Next: cd ${view.projectRoot} && npm install && npm run build`;
    }
}

export function renderInitResult(elements: Elements, view: ScaffoldActionView): void {
    renderScaffoldResult(
        view,
        elements.homeInitLoading,
        elements.homeInitError,
        elements.homeInitResult,
        elements.homeInitResultSummary,
        elements.homeInitResultCreatedSection,
        elements.homeInitResultCreated,
    );
    if (view.status !== "ok") {
        return;
    }
    elements.homeInitResultUpdatedSection.hidden = view.updatedFiles.length === 0;
    renderFileList(elements.homeInitResultUpdated, view.updatedFiles);
    elements.homeInitResultSkippedSection.hidden = view.skippedFiles.length === 0;
    renderFileList(elements.homeInitResultSkipped, view.skippedFiles);
}

export function renderBuildPreview(elements: Elements, view: BuildPreviewView): void {
    elements.homeBuildLoading.hidden = view.status !== "loading";
    elements.homeBuildError.hidden = view.status !== "error";
    elements.homeBuildPreview.hidden = view.status === "idle" || view.status === "loading" || view.status === "error";

    if (view.status === "error") {
        elements.homeBuildError.textContent = view.message;
        return;
    }
    if (view.status === "idle" || view.status === "loading") {
        return;
    }

    elements.homeBuildPreviewLoadError.hidden = view.status !== "load-error";
    elements.homeBuildPreviewOk.hidden = view.status !== "ok";
    elements.homeBuildPreviewErrorsSection.hidden = view.status !== "invalid";

    if (view.status === "load-error") {
        elements.homeBuildPreviewLoadError.textContent = view.message;
        elements.homeBuildPreviewWarningsSection.hidden = true;
        return;
    }

    elements.homeBuildPreviewWarningsSection.hidden = view.warnings.length === 0;
    renderIssueList(elements.homeBuildPreviewWarnings, view.warnings);

    if (view.status === "invalid") {
        renderIssueList(elements.homeBuildPreviewErrors, view.errors);
        return;
    }

    elements.homeBuildPreviewGame.textContent = `${view.manifest.name} (id: "${view.manifest.id}", v${view.manifest.version})`;
    elements.homeBuildPreviewReelsRows.textContent = `${view.reels} x ${view.rows}`;
    elements.homeBuildPreviewSymbols.textContent = String(view.symbolsCount);
    elements.homeBuildPreviewHash.textContent = view.blueprintHash;
    elements.homeBuildPreviewFiles.textContent = view.expectedFiles.join(", ");
}

export function renderBuildResult(elements: Elements, view: BuildProjectView): void {
    elements.homeBuildLoading.hidden = view.status !== "loading";
    elements.homeBuildError.hidden = view.status !== "error";
    elements.homeBuildResult.hidden = true;
    elements.homeBuildOpenButton.hidden = true;

    if (view.status === "error") {
        elements.homeBuildError.textContent = view.message;
        return;
    }
    if (view.status === "idle" || view.status === "loading") {
        return;
    }

    elements.homeBuildResult.hidden = false;

    if (view.status === "load-error" || view.status === "failed") {
        elements.homeBuildResultSummary.textContent = view.message;
        elements.homeBuildResultWarningsSection.hidden = true;
        elements.homeBuildResultCreatedSection.hidden = true;
        return;
    }
    if (view.status === "invalid") {
        elements.homeBuildResultSummary.textContent = `Blueprint is invalid — ${view.errors.length} error(s).`;
        elements.homeBuildResultWarningsSection.hidden = true;
        elements.homeBuildResultCreatedSection.hidden = true;
        return;
    }

    elements.homeBuildResultSummary.textContent =
        `"${view.manifest.name}" (id: "${view.manifest.id}", v${view.manifest.version}) built in "${view.projectRoot}"` +
        (view.unchanged ? " (unchanged — deterministic rebuild)." : ".");
    elements.homeBuildResultWarningsSection.hidden = view.warnings.length === 0;
    renderIssueList(elements.homeBuildResultWarnings, view.warnings);
    elements.homeBuildResultCreatedSection.hidden = view.createdFiles.length === 0;
    renderFileList(elements.homeBuildResultCreated, view.createdFiles);
    elements.homeBuildOpenButton.hidden = false;
}

// Renders the Project Dashboard header for every ProjectHeaderView state (empty/loading/error/
// loaded — see interpretProjectDashboard.ts) and toggles the tabs/Overview/Validation sections:
// visible for "loaded" and "error" (Inspect/Validate are both still meaningful — a package can fail
// to load as a PokieGame yet still have a perfectly readable package.json/build-info, or a validate
// action can be run precisely to see *why* loading failed), hidden for "empty"/"loading".
export function renderProjectHeader(elements: Elements, header: ProjectHeaderView, activeTab: ProjectTab): void {
    elements.projectEmpty.hidden = header.status !== "empty";
    elements.projectLoading.hidden = header.status !== "loading";
    elements.projectError.hidden = header.status !== "error";

    const showDashboard = header.status === "loaded" || header.status === "error";
    elements.projectTabs.hidden = !showDashboard;
    if (showDashboard) {
        showProjectTab(elements, activeTab);
    } else {
        elements.projectOverviewSection.hidden = true;
        elements.projectValidationSection.hidden = true;
        elements.projectSimulationSection.hidden = true;
        elements.projectReportsSection.hidden = true;
        elements.projectReplaySection.hidden = true;
    }

    if (header.status === "empty") {
        elements.projectTitle.textContent = "Project";
        elements.projectSubtitle.textContent = "";
        return;
    }

    if (header.status === "loading") {
        elements.projectTitle.textContent = "Project";
        elements.projectSubtitle.textContent = `Loading ${header.projectRoot}…`;
        return;
    }

    if (header.status === "error") {
        elements.projectTitle.textContent = "Project (failed to load)";
        elements.projectSubtitle.textContent = header.projectRoot;
        elements.projectError.textContent = header.message;
        elements.projectRoot.textContent = header.projectRoot;
        return;
    }

    elements.projectTitle.textContent = header.name;
    elements.projectSubtitle.textContent = header.description ?? "";
    elements.projectId.textContent = header.id;
    elements.projectVersion.textContent = header.version;
    elements.projectRoot.textContent = header.projectRoot;
}

export function showProjectTab(elements: Elements, tab: ProjectTab): void {
    elements.projectOverviewSection.hidden = tab !== "overview";
    elements.projectValidationSection.hidden = tab !== "validation";
    elements.projectSimulationSection.hidden = tab !== "simulation";
    elements.projectReportsSection.hidden = tab !== "reports";
    elements.projectReplaySection.hidden = tab !== "replay";
    elements.tabOverviewButton.setAttribute("aria-current", tab === "overview" ? "page" : "false");
    elements.tabValidationButton.setAttribute("aria-current", tab === "validation" ? "page" : "false");
    elements.tabSimulationButton.setAttribute("aria-current", tab === "simulation" ? "page" : "false");
    elements.tabReportsButton.setAttribute("aria-current", tab === "reports" ? "page" : "false");
    elements.tabReplayButton.setAttribute("aria-current", tab === "replay" ? "page" : "false");
}

// Renders the full Inspect result block for every InspectionResultView state (loading/error/loaded
// — see interpretProjectDashboard.ts): "error" here is the /api/project/inspect call itself failing
// (e.g. a 409 when there's no active project); a successful call that reports an invalid package is
// "loaded", with the invalidity shown via its nested provenance "error" state (report's own safe
// message — never a stack trace, see describeProvenance).
export function renderInspectionResult(elements: Elements, inspection: InspectionResultView): void {
    elements.inspectLoading.hidden = inspection.status !== "loading";
    elements.inspectError.hidden = inspection.status !== "error";
    elements.inspectReport.hidden = inspection.status !== "loaded";

    if (inspection.status === "error") {
        elements.inspectError.textContent = inspection.message;
        return;
    }
    if (inspection.status === "loading") {
        return;
    }

    elements.inspectPackageName.textContent = inspection.packageName ?? "(unknown)";
    elements.inspectPackageVersion.textContent = inspection.packageVersion ?? "(unknown)";
    elements.inspectPackageRoot.textContent = inspection.packageRoot;

    const {provenance} = inspection;
    elements.provenanceGenerated.hidden = provenance.status !== "generated";
    elements.provenanceNotGenerated.hidden = provenance.status !== "not-generated";
    elements.provenanceError.hidden = provenance.status !== "error";
    elements.provenanceDetails.hidden = provenance.status !== "generated";

    if (provenance.status === "error") {
        elements.provenanceError.textContent = provenance.message;
        return;
    }
    if (provenance.status !== "generated") {
        return;
    }
    elements.provenanceHash.textContent = provenance.blueprintHash;
    elements.provenanceSource.textContent = provenance.source;
    elements.provenancePokieVersion.textContent = provenance.pokieVersion;
    elements.provenanceGeneratedAt.textContent = provenance.generatedAt;
    elements.provenanceFiles.textContent = provenance.files.join(", ");
}

function renderIssueList(container: HTMLElement, issues: Array<{code: string; message: string}>): void {
    container.textContent = "";
    for (const issue of issues) {
        const item = document.createElement("li");
        item.textContent = `${issue.code}: ${issue.message}`;
        container.appendChild(item);
    }
}

export function renderValidationSummary(elements: Elements, summary: ValidationSummaryView): void {
    elements.validationSummary.textContent = summary.hasIssues
        ? `${summary.valid ? "Valid, with warnings" : "Invalid"} — ${summary.errors.length} error(s), ${summary.warnings.length} warning(s).`
        : "Valid — no issues found.";

    elements.validationErrorsSection.hidden = summary.errors.length === 0;
    renderIssueList(elements.validationErrorsList, summary.errors);

    elements.validationWarningsSection.hidden = summary.warnings.length === 0;
    renderIssueList(elements.validationWarningsList, summary.warnings);

    elements.validationSuggestionsSection.hidden = summary.suggestions.length === 0;
    elements.validationSuggestionsList.textContent = "";
    for (const suggestion of summary.suggestions) {
        const item = document.createElement("li");
        item.textContent = suggestion;
        elements.validationSuggestionsList.appendChild(item);
    }
}

// `progress` is undefined exactly for "idle" (no simulation has been started this session yet) — not
// an API state, purely a frontend concept before the first POST /api/project/simulations. Every
// other state (queued/running/completed/failed/cancelled) comes straight from the polled job.
export function renderSimulationProgress(elements: Elements, progress: SimulationProgressView | undefined): void {
    const active = progress !== undefined && (progress.status === "queued" || progress.status === "running");
    const terminal = progress !== undefined && !active;

    elements.simulationIdle.hidden = progress !== undefined;
    elements.simulationError.hidden = progress?.status !== "failed";
    elements.simulationProgress.hidden = progress === undefined;
    elements.simulationCancelButton.hidden = !active;
    elements.simulationRerunButton.hidden = !terminal;

    if (progress === undefined) {
        return;
    }

    elements.simulationStatusText.textContent = `Status: ${progress.status}`;
    elements.simulationProgressText.textContent =
        `${progress.roundsCompleted} / ${progress.rounds} rounds (${progress.percent}%) — ${progress.durationMs}ms`;

    if (progress.status === "failed") {
        elements.simulationError.textContent = progress.error ?? "Simulation failed.";
    }
}

// For an apiClient call itself failing (network error, an unexpected non-2xx) — distinct from the
// job's own "failed" status, which renderSimulationProgress already handles from polled data.
export function renderSimulationError(elements: Elements, message: string): void {
    elements.simulationError.hidden = false;
    elements.simulationError.textContent = message;
}

function formatConfidenceInterval(interval: {low: number; high: number} | undefined): string {
    if (!interval) {
        return "—";
    }
    return `${(interval.low * 100).toFixed(2)}% – ${(interval.high * 100).toFixed(2)}%`;
}

// Fills in one SimulationReportElements bag — used for both the Simulation tab's own inline "just
// completed" block and the Reports tab's detail view (see querySimulationReportElements), so this
// formatting logic exists in exactly one place.
export function renderSimulationReport(elements: SimulationReportElements, view: SimulationReportView): void {
    elements.container.hidden = false;
    elements.game.textContent = `${view.game.name} (id: "${view.game.id}", v${view.game.version})`;
    elements.rounds.textContent =
        view.rounds === view.requestedRounds ? String(view.rounds) : `${view.rounds} (requested ${view.requestedRounds})`;
    elements.seed.textContent = view.seed ?? "(none)";
    elements.totalBet.textContent = view.totalBet.toFixed(2);
    elements.totalWin.textContent = view.totalWin.toFixed(2);
    elements.rtp.textContent = `${(view.rtp * 100).toFixed(2)}%`;
    elements.hitFrequency.textContent = `${(view.hitFrequency * 100).toFixed(2)}%`;
    elements.volatility.textContent = view.volatility === undefined ? "—" : view.volatility.toFixed(2);
    elements.confidenceInterval.textContent = formatConfidenceInterval(view.rtpConfidenceInterval95);
    elements.maxWin.textContent = view.maxWin.toFixed(2);
    elements.duration.textContent = `${view.durationMs}ms (${view.spinsPerSecond} spins/s)`;

    elements.breakdownSection.hidden = !view.breakdown || view.breakdown.length === 0;
    elements.breakdownBody.textContent = "";
    for (const row of view.breakdown ?? []) {
        const tr = document.createElement("tr");
        const cells = [
            row.category,
            String(row.rounds),
            `${(row.rtp * 100).toFixed(2)}%`,
            `${(row.contribution * 100).toFixed(2)} pp`,
            `${(row.hitFrequency * 100).toFixed(2)}%`,
            row.maxWin.toFixed(2),
        ];
        for (const cellText of cells) {
            const td = document.createElement("td");
            td.textContent = cellText;
            tr.appendChild(td);
        }
        elements.breakdownBody.appendChild(tr);
    }

    elements.warningsSection.hidden = view.warnings.length === 0;
    elements.warningsList.textContent = "";
    for (const warning of view.warnings) {
        const item = document.createElement("li");
        item.textContent = warning;
        elements.warningsList.appendChild(item);
    }

    elements.reproducibility.hidden = view.reproducibilityCommand === undefined;
    if (view.reproducibilityCommand !== undefined) {
        elements.reproducibility.textContent = view.reproducibilityCommand;
    }
}

export function renderReportsList(
    elements: Elements,
    view: ReportListView,
    onSelect: (entry: StudioSimulationReportListEntry) => void,
): void {
    elements.reportsError.hidden = true;
    elements.reportsEmpty.hidden = view.status !== "empty";
    elements.reportsList.textContent = "";
    if (view.status === "empty") {
        return;
    }

    for (const entry of view.entries) {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        const startedAt = new Date(entry.startedAt).toLocaleString();
        button.textContent =
            `${entry.game.id} v${entry.game.version} — ${entry.actualRounds}/${entry.requestedRounds} rounds, ` +
            `RTP ${(entry.rtp * 100).toFixed(2)}%, ${startedAt}` +
            (entry.hasWarnings ? " (has warnings)" : "");
        button.addEventListener("click", () => onSelect(entry));
        item.appendChild(button);
        elements.reportsList.appendChild(item);
    }
}

export function renderReportsListError(elements: Elements, message: string): void {
    elements.reportsError.hidden = false;
    elements.reportsError.textContent = message;
}

export type ReportDetailView = {status: "empty"} | {status: "loading"} | {status: "error"; message: string} | {status: "loaded"};

// Toggles which part of the Reports tab's detail panel is visible for every state. The "loaded"
// case's actual field values are filled in separately by calling
// renderSimulationReport(elements.reportDetailReport, ...) right after this — same split as
// renderInspectionResult/renderSimulationProgress use for their own "loaded" cases.
export function renderReportDetailState(elements: Elements, view: ReportDetailView): void {
    elements.reportDetailEmpty.hidden = view.status !== "empty";
    elements.reportDetailLoading.hidden = view.status !== "loading";
    elements.reportDetailError.hidden = view.status !== "error";
    elements.reportDetailActions.hidden = view.status !== "loaded";
    if (view.status !== "loaded") {
        elements.reportDetailReport.container.hidden = true;
    }

    if (view.status === "error") {
        elements.reportDetailError.textContent = view.message;
    }
}

// `progress` is undefined exactly for "idle" (no replay has been run this session yet) — purely a
// frontend concept before the first POST /api/project/replays. Every other state (queued/running/
// completed/failed/cancelled) comes straight from the polled job. Mirrors renderSimulationProgress —
// this only toggles idle/error/progress/cancel/rerun visibility; the completed result's own fields are
// filled in separately by renderReplayResult (called by main.ts once status === "completed"), same
// split as renderSimulationProgress/renderSimulationReport.
export function renderReplayProgress(elements: Elements, progress: ReplayProgressView | undefined): void {
    const active = progress !== undefined && (progress.status === "queued" || progress.status === "running");
    const terminal = progress !== undefined && !active;

    elements.replayIdle.hidden = progress !== undefined;
    elements.replayError.hidden = progress?.status !== "failed";
    elements.replayProgress.hidden = progress === undefined;
    elements.replayCancelButton.hidden = !active;
    elements.replayRerunButton.hidden = !terminal;

    if (progress === undefined) {
        return;
    }

    elements.replayStatusText.textContent = `Status: ${progress.status}`;
    elements.replayProgressText.textContent =
        `${progress.completedRounds} / ${progress.round} rounds (${progress.percent}%) — ${progress.durationMs}ms`;

    if (progress.status === "failed") {
        elements.replayError.textContent = progress.error ?? "Replay failed.";
    }
}

// For an apiClient call itself failing (network error, an unexpected non-2xx) — distinct from the
// job's own "failed" status, which renderReplayProgress already handles from polled data.
export function renderReplayError(elements: Elements, message: string): void {
    elements.replayError.hidden = false;
    elements.replayError.textContent = message;
}

// Only ever called once a job's status is "completed" (see describeReplayResult) — fills in the
// completed result's own fields; visibility of the surrounding idle/error/progress states is handled
// separately by renderReplayProgress above.
export function renderReplayResult(elements: Elements, result: ReplayResultView): void {
    elements.replayResult.hidden = false;

    elements.replayResultGame.textContent = `${result.game.name} (id: "${result.game.id}", v${result.game.version})`;
    elements.replayResultRound.textContent = String(result.round);
    elements.replayResultSeed.textContent = result.seed ?? "(none)";
    elements.replayResultTotalBet.textContent = result.totalBet.toFixed(2);
    elements.replayResultTotalWin.textContent = result.totalWin.toFixed(2);
    elements.replayResultTimestamp.textContent = new Date(result.timestamp).toLocaleString();
    elements.replayResultDuration.textContent = `${result.durationMs}ms`;

    elements.replayResultScreenSection.hidden = result.screen === undefined;
    elements.replayResultNoScreen.hidden = result.screen !== undefined;
    elements.replayResultScreenBody.textContent = "";
    for (const row of result.screen ?? []) {
        const tr = document.createElement("tr");
        for (const cellText of row) {
            const td = document.createElement("td");
            td.textContent = cellText;
            tr.appendChild(td);
        }
        elements.replayResultScreenBody.appendChild(tr);
    }

    elements.replayDownloadJson.href = `/api/project/replays/${encodeURIComponent(result.id)}/download`;
}

export function renderReplayList(
    elements: Elements,
    view: ReplayListView,
    onSelect: (entry: StudioReplayListEntry) => void,
): void {
    elements.replayListError.hidden = true;
    elements.replayListEmpty.hidden = view.status !== "empty";
    elements.replayList.textContent = "";
    if (view.status === "empty") {
        return;
    }

    for (const entry of view.entries) {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        const startedAt = new Date(entry.startedAt).toLocaleString();
        const outcome =
            entry.status === "completed"
                ? `bet ${entry.totalBet?.toFixed(2)} / win ${entry.totalWin?.toFixed(2)}`
                : `${entry.completedRounds}/${entry.round} rounds`;
        const game = entry.game ? `${entry.game.id} v${entry.game.version}` : "(loading game)";
        button.textContent =
            `[${entry.status}] ${game} — round ${entry.round}, seed ${entry.seed ?? "(none)"}, ${outcome}, ${startedAt}`;
        button.addEventListener("click", () => onSelect(entry));
        item.appendChild(button);
        elements.replayList.appendChild(item);
    }
}

export function renderReplayListError(elements: Elements, message: string): void {
    elements.replayListError.hidden = false;
    elements.replayListError.textContent = message;
}

// ---- Blueprint Editor ----
//
// The dynamic collection sections below (symbols/bets/paylines/paytable/reelStrips/symbolWeights) all
// follow the same shape: clear the container, rebuild every row from the current blueprint, and wire
// each row's controls straight to a blueprintFormOps.ts mutator via the single `mutate` callback (see
// its own doc comment above) — there's no listener-accumulation risk since these containers are fully
// torn down and rebuilt on every render. Static, persistent controls (metadata inputs, the JSON
// textarea, the generation-mode radios) are the opposite: their listeners are wired once by main.ts at
// startup, and the render functions here only ever reflect state into them, guarded by
// `document.activeElement` so a re-render never clobbers what the user is mid-typing.

function setInputValueIfNotFocused(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
    if (document.activeElement !== input) {
        input.value = value;
    }
}

function appendRowActions(row: HTMLElement, actions: Array<{label: string; onClick: () => void}>): void {
    const cell = document.createElement("td");
    for (const action of actions) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = action.label;
        button.addEventListener("click", action.onClick);
        cell.appendChild(button);
    }
    row.appendChild(cell);
}

function asStringList(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function renderBlueprintMetadata(elements: Elements, blueprint: Record<string, unknown>): void {
    const manifest =
        typeof blueprint.manifest === "object" && blueprint.manifest !== null && !Array.isArray(blueprint.manifest)
            ? (blueprint.manifest as Record<string, unknown>)
            : {};
    setInputValueIfNotFocused(elements.blueprintFieldId, typeof manifest.id === "string" ? manifest.id : "");
    setInputValueIfNotFocused(elements.blueprintFieldName, typeof manifest.name === "string" ? manifest.name : "");
    setInputValueIfNotFocused(elements.blueprintFieldVersion, typeof manifest.version === "string" ? manifest.version : "");
    setInputValueIfNotFocused(elements.blueprintFieldDescription, typeof manifest.description === "string" ? manifest.description : "");
    setInputValueIfNotFocused(elements.blueprintFieldAuthor, typeof manifest.author === "string" ? manifest.author : "");
    setInputValueIfNotFocused(elements.blueprintFieldReels, typeof blueprint.reels === "number" ? String(blueprint.reels) : "");
    setInputValueIfNotFocused(elements.blueprintFieldRows, typeof blueprint.rows === "number" ? String(blueprint.rows) : "");
}

export function renderBlueprintSymbols(elements: Elements, blueprint: Record<string, unknown>, mutate: BlueprintMutate): void {
    const symbols = asStringList(blueprint.symbols);
    const wilds = new Set(asStringList(blueprint.wilds));
    const scatters = new Set(asStringList(blueprint.scatters));

    elements.blueprintSymbolsBody.textContent = "";
    symbols.forEach((symbolId, index) => {
        const row = document.createElement("tr");

        const idCell = document.createElement("td");
        const idInput = document.createElement("input");
        idInput.type = "text";
        idInput.value = symbolId;
        idInput.addEventListener("change", () => mutate((b) => setSymbolAt(b, index, idInput.value)));
        idCell.appendChild(idInput);
        row.appendChild(idCell);

        const wildCell = document.createElement("td");
        const wildCheckbox = document.createElement("input");
        wildCheckbox.type = "checkbox";
        wildCheckbox.checked = wilds.has(symbolId);
        wildCheckbox.addEventListener("change", () => mutate((b) => toggleWildSymbol(b, symbolId)));
        wildCell.appendChild(wildCheckbox);
        row.appendChild(wildCell);

        const scatterCell = document.createElement("td");
        const scatterCheckbox = document.createElement("input");
        scatterCheckbox.type = "checkbox";
        scatterCheckbox.checked = scatters.has(symbolId);
        scatterCheckbox.addEventListener("change", () => mutate((b) => toggleScatterSymbol(b, symbolId)));
        scatterCell.appendChild(scatterCheckbox);
        row.appendChild(scatterCell);

        appendRowActions(row, [
            {label: "Duplicate", onClick: () => mutate((b) => duplicateSymbolAt(b, index))},
            {label: "Remove", onClick: () => mutate((b) => removeSymbolAt(b, index))},
            {label: "↑", onClick: () => mutate((b) => moveSymbolAt(b, index, index - 1))},
            {label: "↓", onClick: () => mutate((b) => moveSymbolAt(b, index, index + 1))},
        ]);

        elements.blueprintSymbolsBody.appendChild(row);
    });
}

export function renderBlueprintBets(elements: Elements, blueprint: Record<string, unknown>, mutate: BlueprintMutate): void {
    const bets = Array.isArray(blueprint.availableBets)
        ? blueprint.availableBets.filter((item): item is number => typeof item === "number")
        : [];

    elements.blueprintBetsList.textContent = "";
    bets.forEach((value, index) => {
        const item = document.createElement("li");
        const input = document.createElement("input");
        input.type = "number";
        input.step = "any";
        input.value = String(value);
        input.addEventListener("change", () => mutate((b) => setBetAt(b, index, input.valueAsNumber)));
        item.appendChild(input);

        appendRowActions(item, [
            {label: "Duplicate", onClick: () => mutate((b) => duplicateBetAt(b, index))},
            {label: "Remove", onClick: () => mutate((b) => removeBetAt(b, index))},
            {label: "↑", onClick: () => mutate((b) => moveBetAt(b, index, index - 1))},
            {label: "↓", onClick: () => mutate((b) => moveBetAt(b, index, index + 1))},
        ]);

        elements.blueprintBetsList.appendChild(item);
    });
}

export function renderBlueprintPaylines(elements: Elements, blueprint: Record<string, unknown>, mutate: BlueprintMutate): void {
    const paylines = Array.isArray(blueprint.paylines)
        ? blueprint.paylines.map((line) => (Array.isArray(line) ? line.filter((row): row is number => typeof row === "number") : []))
        : [];

    elements.blueprintPaylinesList.textContent = "";
    paylines.forEach((line, lineIndex) => {
        const row = document.createElement("div");
        row.className = "payline-row";

        const label = document.createElement("span");
        label.textContent = `Line ${lineIndex + 1}: `;
        row.appendChild(label);

        line.forEach((rowValue, reelIndex) => {
            const input = document.createElement("input");
            input.type = "number";
            input.min = "0";
            input.step = "1";
            input.value = String(rowValue);
            input.addEventListener("change", () =>
                mutate((b) => setPaylineCell(b, lineIndex, reelIndex, input.valueAsNumber)),
            );
            row.appendChild(input);
        });

        appendRowActions(row, [
            {label: "Duplicate", onClick: () => mutate((b) => duplicatePaylineAt(b, lineIndex))},
            {label: "Remove", onClick: () => mutate((b) => removePaylineAt(b, lineIndex))},
            {label: "↑", onClick: () => mutate((b) => movePaylineAt(b, lineIndex, lineIndex - 1))},
            {label: "↓", onClick: () => mutate((b) => movePaylineAt(b, lineIndex, lineIndex + 1))},
        ]);

        elements.blueprintPaylinesList.appendChild(row);
    });
}

function renderSymbolOptions(select: HTMLSelectElement, symbols: string[]): void {
    const previousValue = select.value;
    select.textContent = "";
    for (const symbolId of symbols) {
        const option = document.createElement("option");
        option.value = symbolId;
        option.textContent = symbolId;
        select.appendChild(option);
    }
    if (symbols.includes(previousValue)) {
        select.value = previousValue;
    }
}

export function renderBlueprintPaytable(elements: Elements, blueprint: Record<string, unknown>, mutate: BlueprintMutate): void {
    const symbols = asStringList(blueprint.symbols);
    renderSymbolOptions(elements.blueprintAddPaytableSymbol, symbols);

    const paytable =
        typeof blueprint.paytable === "object" && blueprint.paytable !== null && !Array.isArray(blueprint.paytable)
            ? (blueprint.paytable as Record<string, unknown>)
            : {};
    const reels = typeof blueprint.reels === "number" ? blueprint.reels : 10;

    elements.blueprintPaytableBody.textContent = "";
    for (const [symbolId, payouts] of Object.entries(paytable)) {
        if (typeof payouts !== "object" || payouts === null || Array.isArray(payouts)) {
            continue;
        }
        for (const [timesKey, multiplier] of Object.entries(payouts as Record<string, unknown>)) {
            if (typeof multiplier !== "number") {
                continue;
            }
            const matchCount = Number(timesKey);
            const row = document.createElement("tr");

            const symbolCell = document.createElement("td");
            symbolCell.textContent = symbolId;
            row.appendChild(symbolCell);

            const matchCell = document.createElement("td");
            matchCell.textContent = String(matchCount);
            row.appendChild(matchCell);

            const payoutCell = document.createElement("td");
            const payoutInput = document.createElement("input");
            payoutInput.type = "number";
            payoutInput.step = "any";
            payoutInput.value = String(multiplier);
            payoutInput.addEventListener("change", () =>
                mutate((b) => setPaytablePayout(b, symbolId, matchCount, payoutInput.valueAsNumber)),
            );
            payoutCell.appendChild(payoutInput);
            row.appendChild(payoutCell);

            appendRowActions(row, [
                {label: "Duplicate", onClick: () => mutate((b) => duplicatePaytablePayout(b, symbolId, matchCount, reels))},
                {label: "Remove", onClick: () => mutate((b) => removePaytablePayout(b, symbolId, matchCount))},
            ]);

            elements.blueprintPaytableBody.appendChild(row);
        }
    }
}

export function renderBlueprintReelStrips(elements: Elements, blueprint: Record<string, unknown>, mutate: BlueprintMutate): void {
    const strips = Array.isArray(blueprint.reelStrips) ? blueprint.reelStrips.map((strip) => asStringList(strip)) : [];

    elements.blueprintReelStripsContainer.textContent = "";
    strips.forEach((strip, reelIndex) => {
        const fieldset = document.createElement("fieldset");
        const legend = document.createElement("legend");
        legend.textContent = `Reel ${reelIndex + 1}`;
        fieldset.appendChild(legend);

        const list = document.createElement("ul");
        strip.forEach((symbolId, position) => {
            const item = document.createElement("li");
            const input = document.createElement("input");
            input.type = "text";
            input.value = symbolId;
            input.addEventListener("change", () =>
                mutate((b) => setReelStripSymbolAt(b, reelIndex, position, input.value)),
            );
            item.appendChild(input);

            appendRowActions(item, [
                {label: "Duplicate", onClick: () => mutate((b) => duplicateReelStripSymbolAt(b, reelIndex, position))},
                {label: "Remove", onClick: () => mutate((b) => removeReelStripSymbolAt(b, reelIndex, position))},
                {label: "↑", onClick: () => mutate((b) => moveReelStripSymbolAt(b, reelIndex, position, position - 1))},
                {label: "↓", onClick: () => mutate((b) => moveReelStripSymbolAt(b, reelIndex, position, position + 1))},
            ]);
            list.appendChild(item);
        });
        fieldset.appendChild(list);

        const addRow = document.createElement("div");
        addRow.className = "quick-actions";
        const addInput = document.createElement("input");
        addInput.type = "text";
        addInput.placeholder = "Symbol id";
        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.textContent = "Add symbol";
        addButton.addEventListener("click", () => mutate((b) => addReelStripSymbol(b, reelIndex, addInput.value)));
        addRow.appendChild(addInput);
        addRow.appendChild(addButton);
        fieldset.appendChild(addRow);

        elements.blueprintReelStripsContainer.appendChild(fieldset);
    });
}

export function renderBlueprintWeights(elements: Elements, blueprint: Record<string, unknown>, mutate: BlueprintMutate): void {
    renderSymbolOptions(elements.blueprintAddWeightSymbol, asStringList(blueprint.symbols));

    const weights =
        typeof blueprint.symbolWeights === "object" && blueprint.symbolWeights !== null && !Array.isArray(blueprint.symbolWeights)
            ? (blueprint.symbolWeights as Record<string, unknown>)
            : {};

    elements.blueprintWeightsBody.textContent = "";
    for (const [symbolId, weight] of Object.entries(weights)) {
        if (typeof weight !== "number") {
            continue;
        }
        const row = document.createElement("tr");

        const symbolCell = document.createElement("td");
        symbolCell.textContent = symbolId;
        row.appendChild(symbolCell);

        const weightCell = document.createElement("td");
        const weightInput = document.createElement("input");
        weightInput.type = "number";
        weightInput.min = "1";
        weightInput.step = "1";
        weightInput.value = String(weight);
        weightInput.addEventListener("change", () => mutate((b) => setSymbolWeight(b, symbolId, weightInput.valueAsNumber)));
        weightCell.appendChild(weightInput);
        row.appendChild(weightCell);

        appendRowActions(row, [{label: "Remove", onClick: () => mutate((b) => removeSymbolWeight(b, symbolId))}]);

        elements.blueprintWeightsBody.appendChild(row);
    }
}

export function renderBlueprintGenerationMode(elements: Elements, blueprint: Record<string, unknown>, mutate: BlueprintMutate): void {
    const mode: ReelGenerationMode = getReelGenerationMode(blueprint);
    elements.blueprintModeDefaultRadio.checked = mode === "default";
    elements.blueprintModeReelStripsRadio.checked = mode === "reelStrips";
    elements.blueprintModeWeightsRadio.checked = mode === "symbolWeights";
    elements.blueprintReelStripsSection.hidden = mode !== "reelStrips";
    elements.blueprintWeightsSection.hidden = mode !== "symbolWeights";

    if (mode === "reelStrips") {
        renderBlueprintReelStrips(elements, blueprint, mutate);
    } else if (mode === "symbolWeights") {
        renderBlueprintWeights(elements, blueprint, mutate);
    }
}

// The one function main.ts calls after every blueprint change — renders every Form section from the
// current blueprint in one go. Cheap enough to always fully rebuild (these are small collections for a
// single game's worth of symbols/bets/paylines/paytable entries, not a large dataset).
export function renderBlueprintForm(elements: Elements, blueprint: Record<string, unknown>, mutate: BlueprintMutate): void {
    renderBlueprintMetadata(elements, blueprint);
    renderBlueprintSymbols(elements, blueprint, mutate);
    renderBlueprintBets(elements, blueprint, mutate);
    renderBlueprintPaylines(elements, blueprint, mutate);
    renderBlueprintPaytable(elements, blueprint, mutate);
    renderBlueprintGenerationMode(elements, blueprint, mutate);
}

export function renderBlueprintJson(elements: Elements, jsonText: string, jsonError: string | undefined): void {
    setInputValueIfNotFocused(elements.blueprintJsonTextarea, jsonText);
    elements.blueprintJsonError.hidden = jsonError === undefined;
    elements.blueprintJsonError.textContent = jsonError ?? "";
}

export function renderBlueprintValidation(elements: Elements, view: BlueprintValidationView): void {
    elements.blueprintValidationStatus.hidden = view.status === "idle" || view.status === "loading";
    elements.blueprintValidationErrorsSection.hidden = true;
    elements.blueprintValidationWarningsSection.hidden = true;

    if (view.status === "idle" || view.status === "loading") {
        return;
    }
    if (view.status === "error") {
        elements.blueprintValidationStatus.textContent = view.message;
        return;
    }

    if (view.status === "invalid") {
        elements.blueprintValidationStatus.textContent = `Invalid — ${view.errors.length} error(s).`;
    } else if (view.warnings.length === 0) {
        elements.blueprintValidationStatus.textContent = "Valid — no issues found.";
    } else {
        elements.blueprintValidationStatus.textContent = `Valid, with warnings — ${view.warnings.length} warning(s).`;
    }

    elements.blueprintValidationWarningsSection.hidden = view.warnings.length === 0;
    renderIssueList(elements.blueprintValidationWarnings, view.warnings);

    if (view.status === "invalid") {
        elements.blueprintValidationErrorsSection.hidden = view.errors.length === 0;
        renderIssueList(elements.blueprintValidationErrors, view.errors);
    }
}

export function renderBlueprintLoadResult(elements: Elements, view: BlueprintLoadView): void {
    elements.blueprintLoadError.hidden = view.status !== "load-error" && view.status !== "error";
    if (view.status === "load-error" || view.status === "error") {
        elements.blueprintLoadError.textContent = view.message;
    }
}

export function renderBlueprintSaveResult(elements: Elements, view: BlueprintSaveView): void {
    elements.blueprintSaveConflict.hidden = view.status !== "conflict";
    elements.blueprintSaveError.hidden = view.status !== "failed" && view.status !== "error";
    elements.blueprintSaveOk.hidden = view.status !== "ok";

    if (view.status === "conflict") {
        elements.blueprintSaveConflictMessage.textContent = view.message;
    } else if (view.status === "failed" || view.status === "error") {
        elements.blueprintSaveError.textContent = view.message;
    } else if (view.status === "ok") {
        elements.blueprintSaveOk.textContent = `Saved to "${view.path}".`;
    }
}

export function renderBlueprintBuildPreview(elements: Elements, view: BuildPreviewView): void {
    elements.blueprintBuildLoading.hidden = view.status !== "loading";
    elements.blueprintBuildError.hidden = view.status !== "error";
    elements.blueprintBuildPreview.hidden = view.status === "idle" || view.status === "loading" || view.status === "error";

    if (view.status === "error") {
        elements.blueprintBuildError.textContent = view.message;
        return;
    }
    if (view.status === "idle" || view.status === "loading") {
        return;
    }

    elements.blueprintBuildPreviewLoadError.hidden = view.status !== "load-error";
    elements.blueprintBuildPreviewOk.hidden = view.status !== "ok";
    elements.blueprintBuildPreviewErrorsSection.hidden = view.status !== "invalid";

    if (view.status === "load-error") {
        elements.blueprintBuildPreviewLoadError.textContent = view.message;
        elements.blueprintBuildPreviewWarningsSection.hidden = true;
        return;
    }

    elements.blueprintBuildPreviewWarningsSection.hidden = view.warnings.length === 0;
    renderIssueList(elements.blueprintBuildPreviewWarnings, view.warnings);

    if (view.status === "invalid") {
        renderIssueList(elements.blueprintBuildPreviewErrors, view.errors);
        return;
    }

    elements.blueprintBuildPreviewGame.textContent = `${view.manifest.name} (id: "${view.manifest.id}", v${view.manifest.version})`;
    elements.blueprintBuildPreviewReelsRows.textContent = `${view.reels} x ${view.rows}`;
    elements.blueprintBuildPreviewSymbols.textContent = String(view.symbolsCount);
    elements.blueprintBuildPreviewHash.textContent = view.blueprintHash;
    elements.blueprintBuildPreviewFiles.textContent = view.expectedFiles.join(", ");
}

export function renderBlueprintBuildResult(elements: Elements, view: BuildProjectView): void {
    elements.blueprintBuildLoading.hidden = view.status !== "loading";
    elements.blueprintBuildError.hidden = view.status !== "error";
    elements.blueprintBuildResult.hidden = true;
    elements.blueprintBuildOpenButton.hidden = true;

    if (view.status === "error") {
        elements.blueprintBuildError.textContent = view.message;
        return;
    }
    if (view.status === "idle" || view.status === "loading") {
        return;
    }

    elements.blueprintBuildResult.hidden = false;

    if (view.status === "load-error" || view.status === "failed") {
        elements.blueprintBuildResultSummary.textContent = view.message;
        elements.blueprintBuildResultWarningsSection.hidden = true;
        elements.blueprintBuildResultCreatedSection.hidden = true;
        return;
    }
    if (view.status === "invalid") {
        elements.blueprintBuildResultSummary.textContent = `Blueprint is invalid — ${view.errors.length} error(s).`;
        elements.blueprintBuildResultWarningsSection.hidden = true;
        elements.blueprintBuildResultCreatedSection.hidden = true;
        return;
    }

    elements.blueprintBuildResultSummary.textContent =
        `"${view.manifest.name}" (id: "${view.manifest.id}", v${view.manifest.version}) built in "${view.projectRoot}"` +
        (view.unchanged ? " (unchanged — deterministic rebuild)." : ".");
    elements.blueprintBuildResultWarningsSection.hidden = view.warnings.length === 0;
    renderIssueList(elements.blueprintBuildResultWarnings, view.warnings);
    elements.blueprintBuildResultCreatedSection.hidden = view.createdFiles.length === 0;
    renderFileList(elements.blueprintBuildResultCreated, view.createdFiles);
    elements.blueprintBuildOpenButton.hidden = false;
}
