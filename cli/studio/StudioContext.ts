// The two Studio modes described in docs/cli.md: a global Home (project creation/selection) and a
// project-scoped Project view. Project is a stub today (see StudioServer) — this type is what a
// future `pokie .` will resolve straight into via StudioContextResolving.
export type StudioContext = {mode: "home"} | {mode: "project"; projectRoot: string};
