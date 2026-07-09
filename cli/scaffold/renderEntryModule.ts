import {PokieGameManifest} from "pokie";

export function renderEntryModule(manifest: PokieGameManifest): string {
    return `import {PokieGame, VideoSlotConfig, VideoSlotSession} from "pokie";

const manifest = ${JSON.stringify(manifest, null, 4)};

const game: PokieGame = {
    getManifest() {
        return manifest;
    },
    createSession() {
        const config = new VideoSlotConfig();
        return new VideoSlotSession(config);
    },
};

export default game;
`;
}
