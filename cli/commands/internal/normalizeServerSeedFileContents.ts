// Shared by "pokie fairness seed-commit"/"reveal": the one normalization rule both subcommands apply to a
// server-seed text file's raw contents, so a seed committed via one and revealed via the other always
// normalizes identically — a mismatch here would otherwise surface as a spurious "revealed serverSeed doesn't
// match its commitment" failure with no discoverable cause. Strips AT MOST ONE terminal line ending (`\r\n` or
// `\n` — whichever a text editor appended when the file was saved) and nothing else: a leading space, intentional
// trailing spaces before that final line ending, a second/earlier line ending anywhere else in the file — all of
// it is preserved exactly as typed, since any of it could be a deliberate part of the secret. Deliberately NOT
// `.trim()`, which would silently strip all of that too, not just one editor-appended newline.
//
// Throws RangeError if the normalized result is empty (the file held nothing but its own trailing line ending,
// or was empty outright) rather than ever building a commitment/proof around an empty secret.
export function normalizeServerSeedFileContents(rawFileContents: string): string {
    let withoutTerminalLineEnding = rawFileContents;
    if (withoutTerminalLineEnding.endsWith("\r\n")) {
        withoutTerminalLineEnding = withoutTerminalLineEnding.slice(0, -2);
    } else if (withoutTerminalLineEnding.endsWith("\n")) {
        withoutTerminalLineEnding = withoutTerminalLineEnding.slice(0, -1);
    }

    if (withoutTerminalLineEnding.length === 0) {
        throw new RangeError("a server seed file must contain at least one character besides its own trailing line ending.");
    }

    return withoutTerminalLineEnding;
}
