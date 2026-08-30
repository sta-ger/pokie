import type {RecentProjectEntry} from "../RecentProjectEntry.js";

// GET /api/home/recent-projects's own DTO — the stored RecentProjectEntry plus whether the project's
// directory/package.json can still be found on disk right now (see StudioHomeService.listRecentProjects).
// A missing project is never silently removed from the underlying repository — only flagged here — so
// a transient filesystem hiccup (e.g. a removable drive not mounted yet) can't quietly drop history.
// For WASM files, existence alone is not availability: its sidecar is part of
// the inspection contract. `unavailableReason` therefore preserves the
// resolver's exact repair guidance when a previously compatible sidecar has
// become missing, malformed, or incompatible.
export type StudioHomeRecentProjectView = RecentProjectEntry & {
    readonly missing: boolean;
    readonly availability: "available" | "missing" | "unavailable";
    readonly unavailableReason?: string;
};
