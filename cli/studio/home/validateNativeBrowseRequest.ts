import type {StudioNativePickerFileFilter, StudioNativePickerKind} from "./StudioNativePickerService.js";

export type NativeBrowseRequestInput = {kind?: unknown; startPath?: unknown; fileFilters?: unknown};

export type ValidatedNativeBrowseRequest = {kind: StudioNativePickerKind; startPath?: string; fileFilters?: StudioNativePickerFileFilter[]};

export function validateNativeBrowseRequest(input: NativeBrowseRequestInput): ValidatedNativeBrowseRequest {
    const {kind, startPath, fileFilters} = input;
    if (kind !== "directory" && kind !== "file") {
        throw new Error('"kind" must be either "directory" or "file".');
    }
    if (startPath !== undefined && typeof startPath !== "string") {
        throw new Error('"startPath" must be a string when given.');
    }
    if (fileFilters !== undefined && !isValidFileFilters(fileFilters)) {
        throw new Error('"fileFilters" must be an array of {name, extensions} entries when given.');
    }
    return {
        kind,
        startPath: startPath && startPath.trim().length > 0 ? startPath : undefined,
        fileFilters: fileFilters as StudioNativePickerFileFilter[] | undefined,
    };
}

function isValidFileFilters(value: unknown): value is StudioNativePickerFileFilter[] {
    return (
        Array.isArray(value) &&
        value.every(
            (entry) =>
                typeof entry === "object" &&
                entry !== null &&
                typeof (entry as {name?: unknown}).name === "string" &&
                Array.isArray((entry as {extensions?: unknown}).extensions) &&
                (entry as {extensions: unknown[]}).extensions.every((ext) => typeof ext === "string"),
        )
    );
}
