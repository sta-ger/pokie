export type StudioRoute = "home" | "project";

// Deliberately hash-based: it's the "routing" component asked for as its own concern, kept separate
// from the backend's context resolution (StudioContextResolving) — the server decides *what* mode is
// active, this decides *which view* is rendered for a given URL, and main.ts is what keeps the two
// in sync (navigating the hash after a successful open/create/close).
export function currentRoute(): StudioRoute {
    return window.location.hash === "#/project" ? "project" : "home";
}

export function navigate(route: StudioRoute): void {
    window.location.hash = route === "project" ? "#/project" : "#/";
}

export function onRouteChange(handler: (route: StudioRoute) => void): void {
    window.addEventListener("hashchange", () => handler(currentRoute()));
}
