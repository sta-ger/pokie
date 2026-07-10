import type {CascadeResult} from "./CascadeResult.js";

// Optional, feature-detected capability (same pattern as ConvertableToSessionState): a custom
// session that wires CascadingSpinResolver into its own play() and keeps the resulting
// CascadeResult implements this one method to become compatible with CascadeSessionSerializer. No
// built-in "cascade session" class exists in this framework — CascadingSpinResolver is a reusable
// utility a session composes itself; this interface is the entire integration surface a session
// needs for its cascade result to be serializable.
export interface CascadeResultProviding<T extends string | number | symbol = string> {
    getCascadeResult(): CascadeResult<T>;
}
