import crypto from "crypto";

// The one "sha256:<hex>" formatter every hash in this fairness contract shares (serverSeedHash, indexHash) —
// never a second, differently-derived digest convention. Same shape as certification's own internal
// sha256OfBytes — deliberately not imported from there: each bundle format's own "internal" is scoped to that
// format alone (see generate-barrels.js), never shared across formats.
export function sha256OfBytes(bytes: string | Buffer): string {
    return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}
