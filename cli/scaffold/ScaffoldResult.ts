import {PokieGameInfo} from "@fromstan/pokie";

export type ScaffoldResult = {
    projectRoot: string;
    info: PokieGameInfo;
    createdFiles: string[];
    updatedFiles: string[];
    skippedFiles: string[];
};
