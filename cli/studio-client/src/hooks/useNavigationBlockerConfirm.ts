import {modals} from "@mantine/modals";
import {useEffect} from "react";
import {useBlocker} from "react-router-dom";

export type NavigationBlockerConfirmModal = {
    title: string;
    children: string;
    labels: {confirm: string; cancel: string};
    /** Stable public identities for a workflow that must survive a blocked route transition. */
    controlIds?: {confirm: string; cancel: string};
    /** Product-owned lifecycle name exposed by both rendered confirmation controls. */
    operation?: string;
};

// The shared "a pending router transition (browser Back/Forward, or any in-app navigate() call) needs
// to ask before it commits" mechanism -- react-router's useBlocker only tells you a transition is
// pending; resolving it (proceed()/reset()) is this hook's job, always through an explicit choice in an
// undismissable confirm modal (withCloseButton/closeOnEscape/closeOnClickOutside are all off below) --
// otherwise Escape/click-outside/the close button would dismiss the modal without running either
// proceed() or reset(), leaving blocker.state stuck at "blocked" forever. Shared by
// useDesignNavigationGuard (a dirty Home Design Game draft) and ProjectDashboardPage (a dirty
// Mechanics Editor draft) -- same predicate-driven useBlocker + modal shape; each caller supplies its
// own "what counts as leaving the guarded area" predicate and its own message. `onLeave` runs right
// before `blocker.proceed()`, for a caller that needs to clear its own dirty-state the instant the user
// actually confirms leaving (not before -- Cancel must never touch it).
export function useNavigationBlockerConfirm(
    shouldBlock: Parameters<typeof useBlocker>[0],
    confirmModal: NavigationBlockerConfirmModal,
    onLeave?: () => void,
) {
    const blocker = useBlocker(shouldBlock);

    useEffect(() => {
        if (blocker.state !== "blocked") {
            return;
        }
        // These are product-owned metadata for the two rendered controls,
        // not Mantine modal options.  Passing them through the modal spread
        // forwards unknown attributes into the portal DOM and makes an
        // otherwise valid navigation confirmation emit a React diagnostic.
        const {controlIds, operation: suppliedOperation, ...modalProps} = confirmModal;
        const operation = suppliedOperation ?? "navigation-blocker";
        modals.openConfirmModal({
            ...modalProps,
            withCloseButton: false,
            closeOnEscape: false,
            closeOnClickOutside: false,
            confirmProps: {
                id: controlIds?.confirm ?? `pokie-${operation}-confirm`,
                "data-pokie-confirmation": "confirm",
                "data-pokie-confirmation-operation": operation,
            },
            cancelProps: {
                id: controlIds?.cancel ?? `pokie-${operation}-dismiss`,
                "data-pokie-confirmation": "cancel",
                "data-pokie-confirmation-operation": operation,
            },
            onConfirm: () => {
                onLeave?.();
                blocker.proceed();
            },
            onCancel: () => blocker.reset(),
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [blocker]);

    return blocker;
}
