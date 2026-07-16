import {modals} from "@mantine/modals";
import {useEffect, useRef} from "react";
import {useBlocker} from "react-router-dom";

const CONFIRM_MODAL = {
    title: "Unsaved changes",
    children: "You have unsaved changes in Design & Build. Leave and lose them?",
    labels: {confirm: "Leave", cancel: "Stay"},
};

// The one centralized mechanism guarding a dirty Design & Build draft against every way of leaving
// Home -- browser Back/Forward, a direct navigation to /project/*, a manual hash edit, and (separately,
// via the native `beforeunload` event, not this modal) a reload or tab close. `useBlocker` intercepts
// history transitions at the router level: a Back press and an in-app navigate() call (e.g. from
// useOpenProject, which no longer knows anything about dirty state) are both just "history transitions"
// to a data router, blocked uniformly by one predicate. A *manually edited* hash (typed in the address
// bar, or any `location.hash = ...` from outside the router) is a separate case: the browser still fires
// `popstate`, but the entry it creates carries no `history.state.idx` marker -- only entries created
// through the router's own `pushState` calls do -- and react-router's blocker can't compute a safe
// "how many steps back" delta for an entry it never tracked, so it silently lets these through
// unblocked (verified: `history.state` is `null` after a raw hash edit, vs `{idx: N}` for every
// router-tracked transition). The second effect below is the fallback for exactly that gap.
export function useDesignNavigationGuard(isDirty: boolean): void {
    const blocker = useBlocker(({currentLocation, nextLocation}) => {
        const leavingHome = currentLocation.pathname.startsWith("/home/") && !nextLocation.pathname.startsWith("/home/");
        return isDirty && leavingHome;
    });

    useEffect(() => {
        if (blocker.state !== "blocked") {
            return;
        }
        modals.openConfirmModal({
            ...CONFIRM_MODAL,
            // blocker.proceed() resumes the exact transition that was blocked -- not a new navigate()
            // call -- so confirming performs the original navigation exactly once. blocker.reset() leaves
            // the router at currentLocation (URL unchanged); nothing in Home ever unmounted while
            // blocked, so the draft and focus are untouched for free.
            onConfirm: () => blocker.proceed(),
            onCancel: () => blocker.reset(),
        });
    }, [blocker]);

    // Fallback for untracked hash edits (see the doc comment above) -- the *only* transitions this can
    // ever see are ones `useBlocker` above didn't already intercept, since a blocked in-app/Back-Forward
    // transition never touches `window.location.hash` in the first place.
    const bypassNextRef = useRef(false);
    useEffect(() => {
        if (!isDirty) {
            return undefined;
        }
        const handleHashChange = (event: HashChangeEvent): void => {
            if (bypassNextRef.current) {
                bypassNextRef.current = false;
                return;
            }
            if (window.history.state?.idx !== undefined) {
                return;
            }
            const newHash = new URL(event.newURL).hash;
            const newPath = newHash.replace(/^#/, "");
            if (newPath.startsWith("/home/")) {
                return;
            }
            const oldHash = new URL(event.oldURL).hash;
            // Revert the address bar back immediately -- mirrors what the blocker does for transitions
            // it can track -- then ask the same way.
            bypassNextRef.current = true;
            window.location.hash = oldHash;
            modals.openConfirmModal({
                ...CONFIRM_MODAL,
                onConfirm: () => {
                    bypassNextRef.current = true;
                    window.location.hash = newHash;
                },
                onCancel: () => undefined,
            });
        };
        window.addEventListener("hashchange", handleHashChange);
        return () => window.removeEventListener("hashchange", handleHashChange);
    }, [isDirty]);

    useEffect(() => {
        if (!isDirty) {
            return undefined;
        }
        const handleBeforeUnload = (event: BeforeUnloadEvent): void => {
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [isDirty]);
}
