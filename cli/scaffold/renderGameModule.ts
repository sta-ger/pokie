import {PokieGameManifest} from "pokie";

export function renderGameModule(manifest: PokieGameManifest, className: string): string {
    return `import {PokieGame, PokieGameContext, PokieGameManifest, VideoSlotSessionSerializer} from "pokie";
import {create${className}Session} from "./${className}Session.js";

const manifest: PokieGameManifest = ${JSON.stringify(manifest, null, 4)};

export const ${className}Game: PokieGame = {
    getManifest() {
        return manifest;
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
