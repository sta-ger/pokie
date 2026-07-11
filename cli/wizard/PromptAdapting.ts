// Abstraction over "ask a question, get an answer" so GameBlueprintWizard doesn't depend on Node's
// readline (or any other I/O) directly. See ReadlinePromptAdapter for the real terminal
// implementation; tests use a canned in-memory implementation instead.
export interface PromptAdapting {
    // Resolves with the answer as typed (not trimmed), or null if the user cancelled (Ctrl+C / the
    // input stream ending before an answer was given).
    ask(question: string): Promise<string | null>;

    // Releases whatever I/O resource this adapter holds (e.g. closes the readline interface). Safe
    // to call once after the last ask(), whether the wizard completed or was cancelled.
    close(): void;
}
