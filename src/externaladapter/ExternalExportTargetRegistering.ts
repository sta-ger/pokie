import type {ExternalExportTarget} from "./ExternalExportTarget.js";

export interface ExternalExportTargetRegistering<T extends string | number = string> {
    register(target: ExternalExportTarget<T>): void;
    has(id: string): boolean;
    get(id: string): ExternalExportTarget<T> | undefined;
    list(): readonly ExternalExportTarget<T>[];
}
