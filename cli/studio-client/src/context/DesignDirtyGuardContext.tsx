import {createContext, useContext} from "react";

// Lets useOpenProject (the one existing choke point every "leave Home, go to a project" action already
// funnels through -- Recent Projects, Open by path, and every flow's "Open in Studio" button) confirm
// before navigating away while Home's Design & Build blueprint has unsaved edits. HomePage provides this,
// computed from the guided BlueprintEditorPage instance's own onDirtyChange; absent (the default) outside
// Home, where there's nothing to guard, navigation just proceeds -- same optional-context pattern as
// AppShellLayout's NavbarCloseContext.
//
// Takes both `proceed` and `cancel` (not just a fire-and-forget `proceed`) because a caller (see
// useOpenProject) may already have set its own loading state before calling this -- if the user declines
// to leave, `cancel` must still be called so that loading state gets cleared instead of hanging forever.
export type DesignDirtyGuard = (proceed: () => void, cancel: () => void) => void;

const DesignDirtyGuardContext = createContext<DesignDirtyGuard | undefined>(undefined);

export const DesignDirtyGuardProvider = DesignDirtyGuardContext.Provider;

export function useDesignDirtyGuard(): DesignDirtyGuard | undefined {
    return useContext(DesignDirtyGuardContext);
}
