import type {InspectionResultView, ProjectHeaderView, ValidationSummaryView} from "./interpretProjectDashboard.js";
import type {RecentProjectEntry} from "./types.js";

export type ProjectTab = "overview" | "validation";

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
};

function requireElement<T extends HTMLElement>(id: string): T {
    const el = document.getElementById(id);
    if (el === null) {
        throw new Error(`Missing #${id} in index.html.`);
    }
    return el as T;
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
    elements.tabOverviewButton.setAttribute("aria-current", tab === "overview" ? "page" : "false");
    elements.tabValidationButton.setAttribute("aria-current", tab === "validation" ? "page" : "false");
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
