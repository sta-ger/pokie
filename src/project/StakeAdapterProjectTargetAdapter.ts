import {isRecognizedStakeEngineExportDirectory} from "../stakeengine/isRecognizedStakeEngineExportDirectory.js";
import type {ProjectTargetTypeAdapter} from "./ProjectTargetTypeAdapter.js";

// Recognizes a Stake Engine export directory (its own book of rounds/events) — see ProjectType.ts's own
// "stakeAdapter" doc comment. Reuses isRecognizedStakeEngineExportDirectory, the same check
// assertSafeToReplaceStakeEngineExportDirectory itself uses, rather than a second definition of "what makes a
// directory a Stake Engine export" here.
export class StakeAdapterProjectTargetAdapter implements ProjectTargetTypeAdapter {
    public readonly type = "stakeAdapter";
    public readonly targetKind = "directory";

    public recognize(resolvedPath: string): Promise<string | undefined> {
        if (!isRecognizedStakeEngineExportDirectory(resolvedPath)) {
            return Promise.resolve(undefined);
        }
        return Promise.resolve('recognized Stake Engine export manifest ("pokie-manifest.json")');
    }
}
