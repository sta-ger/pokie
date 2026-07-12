import type {RecentProjectEntry} from "./types.js";

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
    projectRoot: HTMLElement;
    closeProjectButton: HTMLButtonElement;
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
        projectRoot: requireElement("project-root"),
        closeProjectButton: requireElement("close-project"),
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

export function renderProjectRoot(elements: Elements, projectRoot: string): void {
    elements.projectRoot.textContent = projectRoot;
}

export function setStatus(element: HTMLElement, message: string): void {
    element.textContent = message;
}
