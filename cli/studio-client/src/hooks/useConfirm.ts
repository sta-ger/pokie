import {modals} from "@mantine/modals";
import {useCallback} from "react";

// Replaces confirmDangerousAction.ts's window.confirm() wrapper with a Mantine confirm modal (see
// requirement 4 -- modals are explicitly one of the Mantine components to use). Same 7 call sites, same
// message text, same gating semantics -- the only real change is that confirmation is now asynchronous
// (a modal callback) rather than a synchronous boolean return, so callers move the gated action into
// `onConfirm` instead of `if (!confirm) return`.
export function useConfirm(): (message: string, onConfirm: () => void) => void {
    return useCallback((message: string, onConfirm: () => void) => {
        modals.openConfirmModal({
            title: "Please confirm",
            children: message,
            labels: {confirm: "Confirm", cancel: "Cancel"},
            onConfirm,
        });
    }, []);
}
