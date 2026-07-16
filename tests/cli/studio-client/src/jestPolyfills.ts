import {TextDecoder, TextEncoder} from "node:util";

// jest-environment-jsdom doesn't provide TextEncoder/TextDecoder globals, but react-router needs them
// at import time. Node's implementations are structurally compatible for our purposes (string<->bytes).
if (typeof globalThis.TextEncoder === "undefined") {
    globalThis.TextEncoder = TextEncoder as unknown as typeof globalThis.TextEncoder;
}
if (typeof globalThis.TextDecoder === "undefined") {
    globalThis.TextDecoder = TextDecoder as unknown as typeof globalThis.TextDecoder;
}

// jsdom has no layout engine, so it never provides ResizeObserver, but several Mantine components
// (SegmentedControl, Tabs' FloatingIndicator, ...) call it unconditionally on mount.
if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class ResizeObserver {
        public observe(): void {
            return undefined;
        }
        public unobserve(): void {
            return undefined;
        }
        public disconnect(): void {
            return undefined;
        }
    };
}
