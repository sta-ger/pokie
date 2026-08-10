// The one place a caller-supplied outcome-library mode name (Play's session creation, Simulation's
// sampling request, Replay's reproduction request) is resolved against a bundle manifest's own real
// mode list, before anything downstream ever reads a bundle file. `requestedModeName` undefined means
// "no explicit choice was made" — this resolves to the manifest's own first mode, preserving every
// existing caller's behavior from before mode selection existed. A requested name that isn't one of
// `modes`' own `modeName`s fails loudly here, with every real mode named in the message, rather than
// letting the mismatch surface later as a raw ENOENT from OutcomeLibraryBundleReader trying to open a
// file that was never going to exist — the same "exact match, never a silent substitution" contract
// OutcomeLibraryBundleReader.readModeIndex already documents for itself.
export function resolveOutcomeLibraryModeName(modes: readonly {readonly modeName: string}[], requestedModeName: string | undefined): string {
    if (requestedModeName === undefined) {
        return modes[0].modeName;
    }
    const match = modes.find((mode) => mode.modeName === requestedModeName);
    if (match === undefined) {
        const available = modes.map((mode) => mode.modeName).join(", ");
        throw new Error(`"${requestedModeName}" is not a mode of this outcome library. Available modes: ${available}.`);
    }
    return match.modeName;
}
