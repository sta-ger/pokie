import {modals} from "@mantine/modals";
import {useCallback, useEffect, useRef} from "react";
import {useBlocker} from "react-router-dom";

const CONFIRM_MODAL = {
    title: "Unsaved changes",
    children: "You have unsaved changes in Design & Build. Leave and lose them?",
    labels: {confirm: "Leave", cancel: "Stay"},
};

// A caller-supplied side effect (e.g. useOpenProject's "call the API, then navigate") that must run
// after the user has confirmed leaving a dirty Design & Build draft -- never before. Resolves without
// running `action` at all if the user cancels; the not-dirty case skips the modal and runs `action`
// immediately.
export type GuardedAction = (action: () => Promise<void>) => Promise<void>;

// The one centralized mechanism guarding a dirty Design & Build draft against every way of leaving
// Home. Two distinct kinds of exit need two distinct strategies:
//
// 1. Transitions the router already knows about *before* they commit -- browser Back/Forward and any
//    in-app `navigate()` call are both just "history transitions" to a data router, blocked uniformly by
//    `useBlocker`'s predicate below.
// 2. A caller-initiated action that has its own side effect *before* the navigate() call it eventually
//    makes (useOpenProject: call the API, then navigate to /project) -- blocking only the navigate()
//    call is too late, since the API call already ran. `guardedAction` (returned below) is the fix: it
//    shows the same confirm modal *before* running the side effect at all, and only on Confirm does it
//    (a) run the side effect and (b) let the navigate() call inside it through unblocked via
//    `suppressNextBlockRef` -- otherwise useBlocker would immediately block that same navigate() call a
//    second time, asking twice for one user decision.
//
// A *manually edited* hash (typed in the address bar, or any `location.hash = ...` from outside the
// router) is a third case, handled by the second effect further down: the browser still fires
// `popstate`, but the entry it creates carries no `history.state.idx` marker -- only entries created
// through the router's own `pushState` calls do -- and react-router's blocker can't compute a safe
// "how many steps back" delta for an entry it never tracked, so it silently lets these through
// unblocked (verified: `history.state` is `null` after a raw hash edit, vs `{idx: N}` for every
// router-tracked transition).
export function useDesignNavigationGuard(isDirty: boolean): GuardedAction {
    // Consumed by the blocker predicate to let exactly one subsequent navigate() through unblocked --
    // set right before guardedAction's confirmed side effect runs, since that side effect's own eventual
    // navigate() call must not be blocked a second time. Reset by the predicate itself on the transition
    // it lets through, or explicitly in guardedAction's catch below if the side effect fails *before*
    // ever reaching its navigate() call -- otherwise the flag would stay stuck `true` and silently let
    // some later, unrelated navigation bypass the guard.
    const suppressNextBlockRef = useRef(false);

    const blocker = useBlocker(({currentLocation, nextLocation}) => {
        const leavingHome = currentLocation.pathname.startsWith("/home/") && !nextLocation.pathname.startsWith("/home/");
        if (!isDirty || !leavingHome) {
            return false;
        }
        if (suppressNextBlockRef.current) {
            suppressNextBlockRef.current = false;
            return false;
        }
        return true;
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

    const guardedAction = useCallback<GuardedAction>(
        (action) => {
            if (!isDirty) {
                return action();
            }
            return new Promise<void>((resolve, reject) => {
                modals.openConfirmModal({
                    ...CONFIRM_MODAL,
                    onConfirm: () => {
                        suppressNextBlockRef.current = true;
                        action()
                            .then(resolve)
                            .catch((error: unknown) => {
                                suppressNextBlockRef.current = false;
                                reject(error);
                            });
                    },
                    // Cancel never runs `action` at all -- no API call, no navigation.
                    onCancel: () => resolve(),
                });
            });
        },
        [isDirty],
    );

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

    return guardedAction;
}
