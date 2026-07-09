import {PokieGameManifest} from "pokie";

export type ScaffoldResult = {
    projectRoot: string;
    manifest: PokieGameManifest;
    createdFiles: string[];
    updatedFiles: string[];
    skippedFiles: string[];
};
