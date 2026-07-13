// The one shared gate every hard-to-undo Studio action confirms through (stopping a running runtime,
// cancelling an in-flight simulation/replay, overwriting a blueprint, rebuilding an already-built
// package, leaving a project with work still running). Deliberately not a custom modal: the app has no
// focus-trap/overlay layer at all (see the stabilization-pass plan's own reasoning), and the browser's
// native confirm() is already keyboard-accessible with no new infrastructure required. `confirmImpl` is
// injectable so tests can supply a fake instead of driving the real browser dialog.
export function confirmDangerousAction(
    message: string,
    // eslint-disable-next-line no-alert -- the one deliberate use of the native dialog this whole app relies on; see file doc comment.
    confirmImpl: (message: string) => boolean = (m) => window.confirm(m),
): boolean {
    return confirmImpl(message);
}
