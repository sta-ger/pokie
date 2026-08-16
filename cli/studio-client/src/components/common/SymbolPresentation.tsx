import {useEffect, useState} from "react";
import {useStudioApi} from "../../context/StudioApiProvider";

export type SymbolArtwork = Record<string, string>;

function asArtwork(value: unknown): SymbolArtwork {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

// Project artwork is intentionally optional: non-Blueprint projects and a missing/corrupt file still
// present the symbol's real id.  The image endpoint independently verifies that a requested reference
// belongs to the active Blueprint, so this client-side map is presentation metadata, not authorization.
export function useActiveSymbolArtwork(): SymbolArtwork {
    const fetchImpl = useStudioApi();
    const [artwork, setArtwork] = useState<SymbolArtwork>({});
    useEffect(() => {
        let active = true;
        try {
            Promise.resolve(fetchImpl("/api/project/symbol-artwork"))
                .then(async (response) => response.ok ? asArtwork((await response.json() as {artwork?: unknown}).artwork) : {})
                .then((next) => { if (active) setArtwork(next); })
                .catch(() => { if (active) setArtwork({}); });
        } catch {
            // Some test/embedded fetch implementations reject synchronously; absence is still safe.
            if (active) setArtwork({});
        }
        return () => { active = false; };
    }, [fetchImpl]);
    return artwork;
}

export function symbolArtworkFromBlueprint(blueprint: Record<string, unknown>): SymbolArtwork {
    return asArtwork(blueprint.symbolArtwork);
}

export function SymbolPresentation({symbolId, artwork, size = 28}: {symbolId: string; artwork?: SymbolArtwork; size?: number}) {
    const activeArtwork = useActiveSymbolArtwork();
    const [failedReference, setFailedReference] = useState<string>();
    const reference = artwork?.[symbolId] ?? activeArtwork[symbolId];
    if (reference === undefined || reference === failedReference) return <>{symbolId}</>;
    // Artwork can contain an older label (for example, after a symbol is renamed). Keep the canonical
    // Blueprint id visible beside it, so View Mode always exposes the persisted model rather than making
    // the artwork's pixels appear to be its authoritative value.
    return <><img src={`/api/project/symbol-artwork?path=${encodeURIComponent(reference)}`} alt={symbolId} width={size} height={size} style={{objectFit: "contain", verticalAlign: "middle"}} onError={() => setFailedReference(reference)} /> {symbolId}</>;
}
