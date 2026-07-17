import {randomUUID} from "node:crypto";
import {ReadableStream} from "node:stream/web";
import {TextDecoder, TextEncoder} from "node:util";
import {MessageChannel, MessagePort} from "node:worker_threads";

// jsdom's Crypto implementation doesn't provide randomUUID() (only getRandomValues()) in the
// jest-environment-jsdom version this project pins -- the Runtime tab calls crypto.randomUUID() to
// generate a silent per-spin idempotency key. Node's own crypto.randomUUID() is a real, spec-compliant
// UUID v4 generator, not a mock, same "structurally compatible" reasoning as the TextEncoder/TextDecoder
// polyfills below.
if (typeof globalThis.crypto?.randomUUID !== "function") {
    globalThis.crypto.randomUUID = randomUUID as typeof globalThis.crypto.randomUUID;
}

// jest-environment-jsdom doesn't provide TextEncoder/TextDecoder globals, but react-router needs them
// at import time. Node's implementations are structurally compatible for our purposes (string<->bytes).
if (typeof globalThis.TextEncoder === "undefined") {
    globalThis.TextEncoder = TextEncoder as unknown as typeof globalThis.TextEncoder;
}
if (typeof globalThis.TextDecoder === "undefined") {
    globalThis.TextDecoder = TextDecoder as unknown as typeof globalThis.TextDecoder;
}
if (typeof globalThis.ReadableStream === "undefined") {
    globalThis.ReadableStream = ReadableStream as unknown as typeof globalThis.ReadableStream;
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

// react-router's data router (createHashRouter/createMemoryRouter + RouterProvider -- needed for
// useBlocker, see useDesignNavigationGuard) builds Fetch API Request objects internally on every
// navigation, even with zero loaders/actions defined. jsdom doesn't provide these globals; `undici` is
// what Node's own built-in fetch is implemented on top of, so it's a faithful, real polyfill rather than
// a mock. Loaded via require() (not a top-level import) so it only evaluates *after* the TextEncoder/
// TextDecoder/ReadableStream polyfills above have already run -- undici's own module body needs them at
// load time, and import statements are hoisted ahead of this file's own top-level code, which would
// otherwise run undici's load-time code before the polyfills above ever executed.
if (typeof globalThis.Request === "undefined") {
    // undici's webidl setup also references MessagePort/MessageChannel at load time, but only to
    // register a type-converter entry -- it never actually needs a *working* implementation. Crucially,
    // these must NOT stay on globalThis afterwards: react-dom's scheduler feature-detects
    // `MessageChannel` and, if present, switches its internal task scheduling to use it -- Node's
    // worker_threads MessagePort keeps the event loop alive in a way that hangs Jest on exit (a real,
    // reproduced hang, not a hypothetical). So these are provided only for the synchronous duration of
    // the require() call below, then removed before react-dom itself ever loads/feature-detects.
    globalThis.MessagePort = MessagePort as unknown as typeof globalThis.MessagePort;
    globalThis.MessageChannel = MessageChannel as unknown as typeof globalThis.MessageChannel;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const {Request, Response, Headers, fetch} = require("undici") as typeof import("undici");
    Object.assign(globalThis, {Request, Response, Headers, fetch});
    Reflect.deleteProperty(globalThis, "MessagePort");
    Reflect.deleteProperty(globalThis, "MessageChannel");
}
