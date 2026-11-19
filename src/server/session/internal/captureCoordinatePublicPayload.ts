import {ScreenProjection} from "../../../session/videoslot/coordinates/ScreenProjection.js";
import type {PokieSessionState} from "../PokieSessionState.js";

/** Built-in and custom serializers must agree with the declared viewport before publication. */
export function captureCoordinatePublicPayload(state: PokieSessionState, payload: object): Record<string, unknown> {
    const record = payload as Record<string, unknown>;
    if (!state.coordinates) return record;
    for (const field of ["screen", "reelsSymbols"] as const) {
        if (record[field] !== undefined && JSON.stringify(record[field]) !== JSON.stringify(state.screen)) {
            throw new Error(`Serialized ${field} differs from the declared visible viewport.`);
        }
    }
    if (["geometry", "screenGeometry", "generatedScreen", "coordinates"].some(field => field in record)) {
        throw new Error("Public serializers must not expose internal coordinate evidence; use a debug serializer.");
    }
    const projection = new ScreenProjection(state.coordinates.geometry);
    return {...record, screen: state.screen, visibleRowCoverage: projection.getVisibleCoverage()};
}
