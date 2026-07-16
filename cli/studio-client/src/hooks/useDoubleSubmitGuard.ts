import {useCallback, useRef} from "react";

// Prevents a handler from re-entering while a previous invocation's async work is still in flight.
// Checked synchronously at the very top of the wrapped call, independent of whether a `disabled`/
// `loading` prop has actually been re-rendered onto the button yet -- a fast double-click (or Enter
// racing a click) can otherwise fire the handler twice before React commits the state update that
// would disable it. `begin()` returns false (and does nothing) if a previous call hasn't `end()`ed yet;
// callers must always call `end()` once their async work settles (success, failure, or otherwise),
// typically from a `.finally()`.
export function useDoubleSubmitGuard(): {begin: () => boolean; end: () => void; isBlocked: () => boolean} {
    const inFlightRef = useRef(false);

    const begin = useCallback((): boolean => {
        if (inFlightRef.current) {
            return false;
        }
        inFlightRef.current = true;
        return true;
    }, []);

    const end = useCallback((): void => {
        inFlightRef.current = false;
    }, []);

    const isBlocked = useCallback((): boolean => inFlightRef.current, []);

    return {begin, end, isBlocked};
}
