import type {ExternalExportModeInput} from "./ExternalExportModeInput.js";
import type {ExternalExportTarget} from "./ExternalExportTarget.js";

// What ExternalExportCompatibilityValidator checks: one target's own requirements/capabilities against a
// specific deployment's content. There is no separate "current pokie version" field — a minPokieVersion
// requirement is checked against the content's own provenance.pokieVersion (the pokie release that actually
// built the RoundRecords being deployed), the same way every other provenance fact used here is read off the
// content itself rather than passed in out of band.
export type ExternalExportCompatibilityContext<T extends string | number = string> = {
    readonly target: ExternalExportTarget<T>;
    readonly modes: readonly ExternalExportModeInput<T>[];
};
