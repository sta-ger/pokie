// Plain-language names for durable Studio jobs. The raw operation id stays available to tests and
// machine-readable selectors; this is the only string a person should have to read in a heading.
const JOB_OPERATION_LABELS: Record<string, string> = {
    "project-open-materialization": "Opening project",
    "outcome-library-generation": "Building exact outcome table",
    "artifact-build": "Building game output",
    "design-build": "Building game output",
    "design-par-import": "Importing PAR sheet",
    "design-par-export": "Exporting PAR sheet",
    deployment: "Deploying game",
    certification: "Building certification pack",
    optimization: "Optimizing math",
    simulation: "Running simulation",
    replay: "Replaying round",
    "browser-play": "Playing round",
    "play-session": "Playing round",
};

export function describeJobOperation(operation: string): string {
    const known = JOB_OPERATION_LABELS[operation];
    if (known !== undefined) return known;
    if (operation.startsWith("play-")) return "Playing round";
    const words = operation.replace(/[-_]+/g, " ").trim();
    return words.length === 0 ? operation : words.charAt(0).toUpperCase() + words.slice(1);
}

// Backend diagnostics are precise and useful in an audit log. In the main card they read like a
// stack trace, so map the few shapes a math author can actually act on and keep the raw text in a
// technical-detail disclosure.
export function describeJobDiagnostic(message: string): string {
    if ((/ENOTDIR/i).test(message)) {
        return "The selected path isn't a project folder. Choose the folder that contains package.json, or a .blueprint.json game design.";
    }
    if ((/ENOENT/i).test(message) && (/(?:package\.json|blueprint\.json|project)/i).test(message)) {
        return "The selected project source is missing or has moved. Check that the folder or file still exists, then choose it again.";
    }
    if ((/EACCES|EPERM/i).test(message)) {
        return "The selected project source can't be read. Check its folder permissions, then try again.";
    }
    if ((/replay incomplete; retained verified execution prefix/i).test(message)) {
        return "The replay stopped before the end. The part that was verified is retained for inspection.";
    }
    if ((/deliveries\[\d+\]\.disposition\.walletPayout|wallet payout differs from executed domain settlement/i).test(message)) {
        return "The replay did not match the recorded round: the wallet payout differs from the recorded settlement. The design may have changed since this round was recorded.";
    }
    if ((/audit-execution-mismatch|deliveries\[\d+\]/i).test(message)) {
        return "The replay did not match the recorded round. The design may have changed since this round was recorded.";
    }
    if ((/audit-identity|different game configuration|config(?:uration)? hash|model differs/i).test(message)) {
        return "The round was recorded with a different game configuration. Open the design/version that produced it, or record a new round against the current design.";
    }
    if ((/not resumable after restart|cannot resume after restart/i).test(message)) {
        return "Studio restarted before this operation finished. Run it again to continue.";
    }
    // "Outcome Library" is the API/persistence name. The main UI deliberately says outcome table; keep
    // that one vocabulary in the human summary while the raw message remains under Technical detail.
    return message.replace(/\bOutcome Library\b/g, "outcome table");
}

export function describeJobRecoveryReason(reason: string): string {
    return describeJobDiagnostic(reason);
}
