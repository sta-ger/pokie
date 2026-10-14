import type {GameSessionHandling} from "../../session/GameSessionHandling.js";
import {isSessionStateRestorable, resolveSessionStateSchema, type SessionStateSchema} from "../../session/SessionStateRestoring.js";
import {supportsBetModeSelecting} from "../../session/videoslot/betmode/supportsBetModeSelecting.js";
import type {ConvertableToSessionState} from "../../session/ConvertableToSessionState.js";
import {cloneSessionData} from "./cloneSessionData.js";

/** Process-local authority captured from a trusted constructed/primed object, never a repository record.
 * It validates live envelopes and completed results, but cannot authorize reconstruction.
 */
export type LiveSessionAuthority = {
    readonly schema: SessionStateSchema;
    readonly snapshotPolicy: LiveSnapshotPolicy;
    readonly capabilities: {readonly bets: readonly number[]; readonly modes?: readonly string[]};
};

export function captureLiveSessionAuthority(session: GameSessionHandling): LiveSessionAuthority {
    return cloneSessionData({
        schema: resolveSessionStateSchema(session),
        snapshotPolicy: captureSnapshotPolicy(session, (session as Partial<ConvertableToSessionState>).toSessionState?.()),
        capabilities: {bets: [...session.getAvailableBets()], ...(supportsBetModeSelecting(session) ? {modes: [...session.getAvailableBetModeIds()]} : {})},
    });
}

/** Each node describes only the snapshot emitted by trusted construction. A missing/opaque
 * custom child never relaxes a complete built-in sibling or authorizes durable restoration.
 */
export type LiveSnapshotPolicy = {
    readonly optional: boolean;
    readonly opaque: boolean;
    readonly partial: boolean;
    readonly opaqueRng: boolean;
    readonly modes?: readonly string[];
    readonly base?: LiveSnapshotPolicy;
};

function captureSnapshotPolicy(session: GameSessionHandling, snapshot: unknown): LiveSnapshotPolicy {
    const schema = resolveSessionStateSchema(session);
    const state = snapshot as {rngState?: unknown; reelStrips?: unknown} | undefined;
    return {
        optional: schema.kind === "custom" && snapshot === undefined,
        opaque: schema.kind === "custom",
        partial: schema.kind === "seeded-video-slot" && !isSessionStateRestorable(session) && state?.rngState === undefined && state?.reelStrips === undefined,
        opaqueRng: schema.kind === "seeded-video-slot" && state?.rngState !== undefined && !isSessionStateRestorable(session) &&
            (session as {getRandomStateCodec?: () => string}).getRandomStateCodec?.() !== "seeded",
        ...(supportsBetModeSelecting(session) ? {modes: [...session.getAvailableBetModeIds()]} : {}),
        // The built-in decorators own this protected composition field. Inspect only a trusted
        // constructed object, never a snapshot's base or a repository-provided collaborator.
        ...(("base" in schema) ?
            {base: captureSnapshotPolicy(trustedBaseSession(session), (snapshot as {base?: unknown} | undefined)?.base)} : {}),
    };
}

// Both public module formats own the same composition field, but have distinct constructors.
// This traversal receives only a trusted constructed session, never stored snapshot objects.
function trustedBaseSession(session: GameSessionHandling): GameSessionHandling {
    const base = Reflect.get(session, "baseSession") as GameSessionHandling | undefined;
    if (base === undefined || base === session || typeof base.getAvailableBets !== "function" || typeof base.play !== "function") {
        throw new Error("Trusted built-in composition requires its constructed base session.");
    }
    return base;
}
