import type {OutcomeLibraryBundleModeInput} from "./OutcomeLibraryBundleModeInput.js";
import type {OutcomeLibraryBundleWriteResult} from "./OutcomeLibraryBundleWriteResult.js";

export interface OutcomeLibraryBundleWriting<T extends string | number = string> {
    writeToDirectory(modes: readonly OutcomeLibraryBundleModeInput<T>[], outDir: string): Promise<OutcomeLibraryBundleWriteResult>;
}
