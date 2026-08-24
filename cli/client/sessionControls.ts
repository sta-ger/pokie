// Session controls must be usable as soon as Player's DOM exists. In particular, a person who
// enters a deterministic seed while the initial unseeded connection is still pending must start
// that requested session, rather than accidentally spinning the initial session.
export type SessionControlElements = {
    sessionSeed: HTMLInputElement;
    sessionId: HTMLInputElement;
    startSessionButton: HTMLButtonElement;
    restoreSessionButton: HTMLButtonElement;
    status: HTMLElement;
};

export function readSessionControlValue(input: HTMLInputElement): string | undefined {
    const value = input.value.trim();
    return value.length > 0 ? value : undefined;
}

export function bindSessionControls(
    elements: SessionControlElements,
    onStartSession: (seed: string | undefined) => void,
    onRestoreSession: (sessionId: string) => void,
): void {
    elements.startSessionButton.onclick = () => {
        onStartSession(readSessionControlValue(elements.sessionSeed));
    };
    elements.restoreSessionButton.onclick = () => {
        const sessionId = readSessionControlValue(elements.sessionId);
        if (sessionId === undefined) {
            elements.status.textContent = "Enter a session ID to restore it.";
            return;
        }
        onRestoreSession(sessionId);
    };
}
