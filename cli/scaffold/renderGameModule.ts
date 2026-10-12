import {PokieGameManifest} from "@fromstan/pokie";

export function renderGameModule(manifest: PokieGameManifest, className: string): string {
    return `import {PokieGame, PokieGameContext, PokieGameManifest, VideoSlotSessionSerializer, validateExecutableState} from "@fromstan/pokie";
import {create${className}Session} from "./${className}Session.js";

const manifest: PokieGameManifest = ${JSON.stringify(manifest, null, 4)};

export const ${className}Game: PokieGame = {
    getManifest() {
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
