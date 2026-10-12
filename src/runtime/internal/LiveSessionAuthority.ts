import type {GameSessionHandling} from "../../session/GameSessionHandling.js";
import {isSessionStateRestorable, resolveSessionStateSchema, type SessionStateSchema} from "../../session/SessionStateRestoring.js";
import {supportsBetModeSelecting} from "../../session/videoslot/betmode/supportsBetModeSelecting.js";
import {cloneSessionData} from "./cloneSessionData.js";

/** Process-local authority captured from a trusted constructed/primed object, never a repository record.
 * It validates live envelopes and completed results, but cannot authorize reconstruction.
 */
export type LiveSessionAuthority = {
    readonly schema: SessionStateSchema;
    readonly partial: boolean;
    readonly capabilities: {readonly bets: readonly number[]; readonly modes?: readonly string[]};
};

export function captureLiveSessionAuthority(session: GameSessionHandling): LiveSessionAuthority {
    return cloneSessionData({
        schema: resolveSessionStateSchema(session),
        partial: !isSessionStateRestorable(session),
        capabilities: {bets: [...session.getAvailableBets()], ...(supportsBetModeSelecting(session) ? {modes: [...session.getAvailableBetModeIds()]} : {})},
    });
}
