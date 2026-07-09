import {PokieGameManifest} from "pokie";

export function renderGameModule(manifest: PokieGameManifest, className: string): string {
    return `import {PokieGame, PokieGameManifest} from "pokie";
import {create${className}Session} from "./${className}Session.js";

const manifest: PokieGameManifest = ${JSON.stringify(manifest, null, 4)};

export const ${className}Game: PokieGame = {
    getManifest() {
        return manifest;
    },
    createSession() {
        return create${className}Session();
    },
};
`;
}
