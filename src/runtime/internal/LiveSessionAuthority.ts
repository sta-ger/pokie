import type {GameSessionHandling} from "../../session/GameSessionHandling.js";
import {isSessionStateRestorable, resolveSessionStateSchema, type SessionStateSchema} from "../../session/SessionStateRestoring.js";
import {supportsBetModeSelecting} from "../../session/videoslot/betmode/supportsBetModeSelecting.js";
import type {ConvertableToSessionState} from "../../session/ConvertableToSessionState.js";
import {AbstractVideoSlotSessionDecorator} from "../../session/videoslot/AbstractVideoSlotSessionDecorator.js";
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
        ...(supportsBetModeSelecting(session) ? {modes: [...session.getAvailableBetModeIds()]} : {}),
        // The built-in decorators own this protected composition field. Inspect only a trusted
        // constructed object, never a snapshot's base or a repository-provided collaborator.
        ...((schema.kind === "free-games" || schema.kind === "bet-modes") && session instanceof AbstractVideoSlotSessionDecorator ?
            {base: captureSnapshotPolicy(Reflect.get(session, "baseSession") as GameSessionHandling, (snapshot as {base?: unknown} | undefined)?.base)} : {}),
    };
}
