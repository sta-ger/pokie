import {modals} from "@mantine/modals";
import {useEffect} from "react";
import {useBlocker} from "react-router-dom";

export type NavigationBlockerConfirmModal = {
    title: string;
    children: string;
    labels: {confirm: string; cancel: string};
};

// The shared "a pending router transition (browser Back/Forward, or any in-app navigate() call) needs
// to ask before it commits" mechanism -- react-router's useBlocker only tells you a transition is
// pending; resolving it (proceed()/reset()) is this hook's job, always through an explicit choice in an
// undismissable confirm modal (withCloseButton/closeOnEscape/closeOnClickOutside are all off below) --
// otherwise Escape/click-outside/the close button would dismiss the modal without running either
// proceed() or reset(), leaving blocker.state stuck at "blocked" forever. Shared by
// useDesignNavigationGuard (a dirty Home Design & Build draft) and ProjectDashboardPage (a dirty
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
        modals.openConfirmModal({
            ...confirmModal,
            withCloseButton: false,
            closeOnEscape: false,
            closeOnClickOutside: false,
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
