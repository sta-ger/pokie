import type {OutcomeLibrarySelector} from "../outcomeLibrary/OutcomeLibrarySelector.js";
import {validateOutcomeLibrarySelector, type OutcomeLibrarySelectorInput} from "../outcomeLibrary/validateOutcomeLibrarySelector.js";

export type StartRuntimeRequestInput = {
    host?: unknown;
    port?: unknown;
    debug?: unknown;
    seed?: unknown;
    repositoryMode?: unknown;
    // The Outcome Libraries tab's own "Use in runtime" handoff -- the exact same selector shape
    // select()/compare() already accept (see OutcomeLibrarySelector), reused rather than a second
    // "how do I find a library" request shape. Resolving it into an actual WeightedOutcomeLibrary is
    // StudioRuntimeManager's job (via StudioOutcomeLibraryService.resolveLibrary()), not this pure
    // validator's -- this only checks the selector is shaped correctly.
    preGeneratedLibrarySelector?: unknown;
    // The hash already shown to the user for that library at Select/Inspect time -- same
    // "expectedLeftHash" snapshot-consistency contract StudioOutcomeLibraryService.compare() uses, so a
    // library that changed on disk since the handoff was offered is never silently started as if
    // nothing happened (see StudioRuntimeManager.startInternal()'s own doc comment).
    preGeneratedLibraryExpectedHash?: unknown;
};

export type ValidatedStartRuntimeRequest = {
    host?: string;
    port?: number;
    debug: boolean;
    seed?: string | number;
    repositoryMode: "memory" | "file";
    preGeneratedLibrarySelector?: OutcomeLibrarySelector;
    preGeneratedLibraryExpectedHash?: string;
};

// The one place a POST /api/project/runtime/start (or .../restart) body is turned into a trusted
// request — throws a plain, client-safe Error (StudioServer catches this and maps it to 400) for
// anything malformed. Every field is optional: an empty body is a valid "start with defaults" request
// (host/port left to PokieDevServer's own defaults, memory-mode sessions, no seed, no pre-generated
// library).
//
// "debug" defaults to *on* here — the opposite of PokieDevServer's own conservative `?debug=1` opt-in
// (see that class's own doc comment). This is Studio's own capture policy, not PokieDevServer's: Studio
// is exclusively a local dev/inspection tool, so a session started through it should surface full
// round/session detail (screen, wins, before/after state, debug/RNG data — see
// StudioRuntimeManager.buildSessionView()) without the user first having to discover and check a box.
// A caller that genuinely wants the leaner public-only view can still pass `debug: false` explicitly.
// This is deliberately *not* PokieDevServer's own default (see docs/cli.md "pokie serve"/"pokie dev"),
// which stays off unless a request opts in — a production deployment must not accidentally persist or
// transmit audit/debug-only data it never asked for.
export function validateStartRuntimeRequest(input: StartRuntimeRequestInput): ValidatedStartRuntimeRequest {
    const {host, port, debug, seed, repositoryMode, preGeneratedLibrarySelector, preGeneratedLibraryExpectedHash} = input;

    if (host !== undefined && (typeof host !== "string" || host.trim().length === 0)) {
        throw new Error('"host" must be a non-empty string when given.');
    }
    if (port !== undefined && (typeof port !== "number" || !Number.isInteger(port) || port < 0)) {
        throw new Error('"port" must be a non-negative integer when given (0 lets the OS assign a free port).');
    }
    if (debug !== undefined && typeof debug !== "boolean") {
        throw new Error('"debug" must be a boolean when given.');
    }
    if (seed !== undefined && typeof seed !== "string" && typeof seed !== "number") {
        throw new Error('"seed" must be a string or number when given.');
    }
    if (repositoryMode !== undefined && repositoryMode !== "memory" && repositoryMode !== "file") {
        throw new Error('"repositoryMode" must be "memory" or "file" when given.');
    }
    if (preGeneratedLibraryExpectedHash !== undefined && typeof preGeneratedLibraryExpectedHash !== "string") {
        throw new Error('"preGeneratedLibraryExpectedHash" must be a string when given.');
    }

    return {
        host: host as string | undefined,
        port: port as number | undefined,
        debug: debug !== false,
        seed: seed as string | number | undefined,
        repositoryMode: (repositoryMode as "memory" | "file" | undefined) ?? "memory",
        preGeneratedLibrarySelector:
            preGeneratedLibrarySelector !== undefined
                ? validateOutcomeLibrarySelector(preGeneratedLibrarySelector as OutcomeLibrarySelectorInput, "preGeneratedLibrarySelector")
                : undefined,
        preGeneratedLibraryExpectedHash: preGeneratedLibraryExpectedHash as string | undefined,
    };
}
