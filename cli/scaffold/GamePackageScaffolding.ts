import {ScaffoldResult} from "./ScaffoldResult.js";

export interface GamePackageScaffolding {
    scaffold(projectRoot: string): ScaffoldResult;
}
