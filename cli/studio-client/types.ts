export type StudioContext = {mode: "home"} | {mode: "project"; projectRoot: string};

export type RecentProjectEntry = {
    projectRoot: string;
    name: string;
    openedAt: string;
};

export type PokieGameManifest = {
    id: string;
    name: string;
    version: string;
    description?: string;
    author?: string;
};
