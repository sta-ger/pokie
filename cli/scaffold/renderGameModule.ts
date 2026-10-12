import {PokieGameManifest} from "@fromstan/pokie";

export function renderGameModule(manifest: PokieGameManifest, className: string): string {
    return `import {PokieGame, PokieGameContext, PokieGameManifest, VideoSlotSessionSerializer} from "@fromstan/pokie";
import {create${className}Session} from "./${className}Session.js";

const manifest: PokieGameManifest = ${JSON.stringify(manifest, null, 4)};

export const ${className}Game: PokieGame = {
    getManifest() {
        return manifest;
    },
    getSessionStateSchema() {
        return {kind: "seeded-video-slot"};
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
