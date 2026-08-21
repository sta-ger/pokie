import {createContext, useContext} from "react";
import type {DesignNavigationGuard, GuardedAction} from "../hooks/useDesignNavigationGuard";

// Passthrough default -- runs `action` immediately, no modal. Used by every test that renders a single
// "open a project" component in isolation (ProjectsPanel.test.tsx, ...) without HomePage's own provider
// above it; that's the same behavior useOpenProject had before this guard existed, so those tests don't
// need to know or care about it.
const passthrough: GuardedAction = (action) => action();
const passthroughGuard: DesignNavigationGuard = {guardedAction: passthrough, allowNextNavigation: () => undefined};

const DesignNavigationGuardContext = createContext<DesignNavigationGuard>(passthroughGuard);

// Provided once by HomePage (the only place a dirty Design Game draft can exist), wrapping every tab --
// Projects (registry list's own Open action) and the guided BlueprintBuildPanel instance all resolve
// `useOpenProject` through this same context, so there is exactly one guarded-action implementation in
// the whole app, not one per caller.
export const DesignNavigationGuardProvider = DesignNavigationGuardContext.Provider;

export function useGuardedAction(): GuardedAction {
    return useContext(DesignNavigationGuardContext).guardedAction;
}

// A successful Design Game save has already made its draft safe to leave. The editor calls this
// immediately before its own Workspace navigation, before Home has had a chance to render the clean
// dirty-state callback; without this one-transition allowance, the router sees stale dirty state and
// blocks the just-saved project from opening.
export function useAllowNextDesignNavigation(): () => void {
    return useContext(DesignNavigationGuardContext).allowNextNavigation;
}
