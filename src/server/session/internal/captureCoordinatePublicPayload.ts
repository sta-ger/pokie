import {ScreenProjection} from "../../../session/videoslot/coordinates/ScreenProjection.js";
import type {PokieSessionState} from "../PokieSessionState.js";

/** Built-in and custom serializers must agree with the declared viewport before publication. */
export function captureCoordinatePublicPayload(state: PokieSessionState, payload: Record<string, unknown>): Record<string, unknown> {
    if (!state.coordinates) return payload;
    for (const field of ["screen", "reelsSymbols"] as const) {
        if (payload[field] !== undefined && JSON.stringify(payload[field]) !== JSON.stringify(state.screen)) {
            throw new Error(`Serialized ${field} differs from the declared visible viewport.`);
        }
    }
    if (["geometry", "screenGeometry", "generatedScreen", "coordinates"].some(field => field in payload)) {
        throw new Error("Public serializers must not expose internal coordinate evidence; use a debug serializer.");
    }
    const projection = new ScreenProjection(state.coordinates.geometry);
    return {...payload, screen: state.screen, visibleRowCoverage: projection.getVisibleCoverage()};
}
