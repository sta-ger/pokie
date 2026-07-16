import {createContext, useContext} from "react";
import type {GuardedAction} from "../hooks/useDesignNavigationGuard";

// Passthrough default -- runs `action` immediately, no modal. Used by every test that renders a single
// "open a project" component in isolation (RecentProjectsPanel.test.tsx, CreateProjectForm.test.tsx, ...)
// without HomePage's own provider above it; that's the same behavior useOpenProject had before this
// guard existed, so those tests don't need to know or care about it.
const passthrough: GuardedAction = (action) => action();

const DesignNavigationGuardContext = createContext<GuardedAction>(passthrough);

// Provided once by HomePage (the only place a dirty Design & Build draft can exist), wrapping every tab
// -- Recent Projects, Open Existing Project, Create/Init/Build-from-blueprint, and the guided/raw
// BlueprintBuildPanel instances all resolve `useOpenProject` through this same context, so there is
// exactly one guarded-action implementation in the whole app, not one per caller.
export const DesignNavigationGuardProvider = DesignNavigationGuardContext.Provider;

export function useGuardedAction(): GuardedAction {
    return useContext(DesignNavigationGuardContext);
}
