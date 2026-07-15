import crypto from "crypto";

// Deterministically maps an arbitrary caller-supplied string (a modeName or outcome id — never assumed to be
// path-safe; a mode/outcome id is caller-controlled data, not something this SDK should trust as a path
// fragment) to a filesystem-safe path segment: the sha256 hex digest of its UTF-8 bytes, which by construction
// contains only `[0-9a-f]` and can therefore never itself be ".." or contain a path separator, however hostile
// the input. Deterministic — the same input always encodes to the same segment, so regenerating the same
// content reproduces byte-identical output — and collision risk is a genuine sha256 collision, not something
// this SDK defends against further. See LocalJsonExternalArtifactGenerator, which stores the original raw
// modeName/outcome id in index.json precisely because this encoding is one-way.
export function encodeLocalExternalDeploymentPathSegment(raw: string): string {
    return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}
