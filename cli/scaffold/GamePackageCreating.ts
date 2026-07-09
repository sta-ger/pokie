import {ScaffoldResult} from "./ScaffoldResult.js";

export interface GamePackageCreating {
    create(parentDir: string, name: string): ScaffoldResult;
}
