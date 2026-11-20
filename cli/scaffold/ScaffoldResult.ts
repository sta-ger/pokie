import {PokieGameInfo} from "@fromstan/pokie";

export type ScaffoldResult = {
    projectRoot: string;
    manifest: PokieGameInfo;
    createdFiles: string[];
    updatedFiles: string[];
    skippedFiles: string[];
};
