import {useCallback, useRef} from "react";

// Tags every in-flight async request (from any number of independent call sites sharing one instance
// of this hook) with a monotonically increasing number -- whichever request was issued *last* is the
// only one ever allowed to act on its own response, regardless of which one's response actually
// arrives first. Needed even when two concurrent requests share the exact same parameters: comparing
// a response's remembered parameters against what's current can't tell two identical-parameter
// requests apart, so only issue order (this counter) can.
// `next`/`isLatest` are useCallback-wrapped (never exposing the backing ref's `.current` directly) so a
// caller can safely be handed straight to something invoked during render (e.g. Mantine's
// `form.onSubmit(handler)`) without tripping the react-hooks/refs rule against reading/writing a ref
// during render.
export function useRequestSequence(): {next: () => number; isLatest: (seq: number) => boolean} {
    const latestRef = useRef(0);

    const next = useCallback((): number => ++latestRef.current, []);
    const isLatest = useCallback((seq: number): boolean => seq === latestRef.current, []);

    return {next, isLatest};
}
