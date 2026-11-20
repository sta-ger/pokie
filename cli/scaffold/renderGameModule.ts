import {PokieGameInfo} from "@fromstan/pokie";

export function renderGameModule(manifest: PokieGameInfo, className: string): string {
    return `import {PokieGame, PokieGameContext, PokieGameInfo, VideoSlotSessionSerializer, validateExecutableState} from "@fromstan/pokie";
import {create${className}Session} from "./${className}Session.js";

const manifest: PokieGameInfo = ${JSON.stringify(manifest, null, 4)};

export const ${className}Game: PokieGame = {
    getInfo() {
        return manifest;
    },
    getSessionStateSchema() {
        return {kind: "seeded-video-slot"};
    },
    getSessionCommandCapabilities() {
        return {bets: [1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 100]};
    },
    validateLiveSessionState(state: unknown, context?: PokieGameContext) {
        validateExecutableState(state, {kind: "seeded-video-slot"}, undefined, context?.seed === undefined);
    },
    createSession(context?: PokieGameContext) {
        return create${className}Session(context);
    },
    getSessionSerializer() {
        return new VideoSlotSessionSerializer();
    },
};
`;
}
