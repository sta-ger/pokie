import {modals} from "@mantine/modals";
import {useCallback} from "react";

export type ConfirmControlIds = {
    confirm?: string;
    cancel?: string;
    /** A stable, product-owned operation name exposed on the confirmation controls. */
    operation?: string;
};

// Replaces confirmDangerousAction.ts's window.confirm() wrapper with a Mantine confirm modal (see
// requirement 4 -- modals are explicitly one of the Mantine components to use). Same 7 call sites, same
// message text, same gating semantics -- the only real change is that confirmation is now asynchronous
// (a modal callback) rather than a synchronous boolean return, so callers move the gated action into
// `onConfirm` instead of `if (!confirm) return`.
export function useConfirm(): (message: string, onConfirm: () => void, onCancel?: () => void, controlIds?: ConfirmControlIds) => void {
    return useCallback((message: string, onConfirm: () => void, onCancel?: () => void, controlIds?: ConfirmControlIds) => {
        // Every confirmation is an observable product transaction.  Callers
        // may supply a domain operation, while ordinary confirmations retain
        // a stable generic identity instead of disappearing behind a portal
        // with anonymous buttons.
        const operation = controlIds?.operation ?? "confirmation";
        modals.openConfirmModal({
            title: "Please confirm",
            children: message,
            labels: {confirm: "Confirm", cancel: "Cancel"},
            onConfirm,
            onCancel,
            // Confirmation is a real, observable part of a durable operation
            // rather than a timing-dependent portal detail.  Consumers that
            // need a stable identity expose the same operation on both modal
            // controls, allowing a keyboard workflow to read the rendered
            // lifecycle before it activates exactly one confirmation button.
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
        });
    }, []);
}
