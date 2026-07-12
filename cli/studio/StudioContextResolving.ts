import type {StudioContext} from "./StudioContext.js";

export interface StudioContextResolving {
    resolve(projectRoot?: string): StudioContext;
}
