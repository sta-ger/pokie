import type {InspectionResultView, ProjectHeaderView, ValidationSummaryView} from "./interpretProjectDashboard.js";
import type {ReportListView} from "./interpretReports.js";
import type {SimulationProgressView, SimulationReportView} from "./interpretSimulation.js";
import type {RecentProjectEntry, StudioSimulationReportListEntry} from "./types.js";

export type ProjectTab = "overview" | "validation" | "simulation" | "reports";

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
    createForm: HTMLFormElement;
    createName: HTMLInputElement;
    createStatus: HTMLElement;
    openForm: HTMLFormElement;
    openPath: HTMLInputElement;
    openStatus: HTMLElement;
    recentList: HTMLElement;
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
        createForm: requireElement("create-form"),
        createName: requireElement("create-name"),
        createStatus: requireElement("create-status"),
        openForm: requireElement("open-form"),
        openPath: requireElement("open-path"),
        openStatus: requireElement("open-status"),
        recentList: requireElement("recent-list"),
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
    };
}

export function showView(elements: Elements, route: "home" | "project"): void {
    elements.homeView.hidden = route !== "home";
    elements.projectView.hidden = route !== "project";
}

export function renderRecentProjects(
    container: HTMLElement,
    entries: RecentProjectEntry[],
    onOpen: (projectRoot: string) => void,
): void {
    container.textContent = "";
    if (entries.length === 0) {
        const empty = document.createElement("li");
        empty.textContent = "No recent projects yet.";
        container.appendChild(empty);
        return;
    }
    for (const entry of entries) {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = `${entry.name} — ${entry.projectRoot}`;
        button.addEventListener("click", () => onOpen(entry.projectRoot));
        item.appendChild(button);
        container.appendChild(item);
    }
}

export function setStatus(element: HTMLElement, message: string): void {
    element.textContent = message;
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
    elements.tabOverviewButton.setAttribute("aria-current", tab === "overview" ? "page" : "false");
    elements.tabValidationButton.setAttribute("aria-current", tab === "validation" ? "page" : "false");
    elements.tabSimulationButton.setAttribute("aria-current", tab === "simulation" ? "page" : "false");
    elements.tabReportsButton.setAttribute("aria-current", tab === "reports" ? "page" : "false");
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
