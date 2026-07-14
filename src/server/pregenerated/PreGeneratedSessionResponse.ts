import type {PreGeneratedRoundInternalView} from "../../pregenerated/PreGeneratedRoundInternalView.js";

// The pre-generated-session counterpart to PokieDevSessionResponse: public fields always present,
// `internal` only when a request explicitly opts in (see PokieDevServer's public/internal split, same
// `?debug=1` convention as the live spin path).
export type PreGeneratedSessionResponse = {
    sessionId: string;
    game: {id: string; name: string; version: string};
    credits: number;
    internal?: PreGeneratedRoundInternalView;
} & Record<string, unknown>;
