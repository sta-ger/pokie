import crypto from "crypto";
import fs from "fs";
import {RoundArtifactValidator} from "../../../artifact/RoundArtifactValidator.js";
import {toCanonicalJson} from "../../../json/toCanonicalJson.js";
import {isPositiveSafeInteger} from "../../../pregenerated/internal/isPositiveSafeInteger.js";
import type {ValidationIssue} from "../../../validation/ValidationIssue.js";
import type {WeightedOutcomeInput} from "../../buildWeightedOutcomeLibrary.js";
import {compareIds} from "../../internal/compareIds.js";
import type {OutcomeLibraryBundleIndexEntry} from "../OutcomeLibraryBundleModeIndex.js";

// A single outcome's provenance/betMode/stake — compared against the mode's first outcome to enforce that
// every outcome describes the same underlying, paid round of the same game/config. Mirrors
// buildWeightedOutcomeLibrary's own OutcomeHomogeneityKey exactly (same fields, same reasoning).
type OutcomeHomogeneityKey = {
    gameId: string;
    gameVersion: string;
    configHash: string | undefined;
    pokieVersion: string;
    betMode: string;
    stake: number;
};

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function homogeneityKeyOf<T extends string | number>(outcome: WeightedOutcomeInput<T>): OutcomeHomogeneityKey {
    return {
        gameId: outcome.artifact.provenance.game.id,
        gameVersion: outcome.artifact.provenance.game.version,
        configHash: outcome.artifact.provenance.configHash,
        pokieVersion: outcome.artifact.provenance.pokieVersion,
        betMode: outcome.artifact.betMode,
        stake: outcome.artifact.stake,
    };
}

export type StreamModeOutcomesResult<T extends string | number> = {
    readonly issues: readonly ValidationIssue[];
    // Present if and only if "issues" contains no error — the same all-or-nothing contract as every other
    // builder/exporter in this codebase.
    readonly built?: {
        readonly entries: readonly OutcomeLibraryBundleIndexEntry[];
        readonly totalWeight: number;
        readonly libraryHash: string;
        readonly firstOutcome: WeightedOutcomeInput<T>;
    };
};

// Consumes "outcomes" exactly once, in arrival order, in a single pass: validates each one (mirroring
// buildWeightedOutcomeLibrary's own checks — id/weight validity, duplicate/sorted-order id, per-artifact
// RoundArtifactValidator, payoutMultiplier/stake validity, cross-outcome homogeneity — necessarily duplicated
// here rather than reused, since buildWeightedOutcomeLibrary's own array-based implementation requires every
// outcome up front, which is exactly what streaming exists to avoid), writes its canonical-JSON line directly to
// "filePath" (never holding more than one outcome in memory at a time), and feeds that same line's exact bytes
// into a running SHA-256 that reproduces computeWeightedOutcomeLibraryHash's own result exactly (verified by a
// dedicated cross-check test) — computed online, in this same pass, since (unlike the exact analyzer statistics
// in computeOnlineWeightedOutcomeLibraryAnalysis) a hash never needs to know the total weight up front. Each
// entry's own "recordHash" is a separate, per-record SHA-256 of exactly that line's own bytes (the same bytes
// its byteOffset/byteLength describe) — what lets a later byte-range read (readAndVerifyOutcomeAtByteRange)
// verify the record found there hasn't been tampered with in place, even if its id/weight happen to be
// unchanged.
//
// Never throws for a validation problem — collects every issue found (mirroring WeightedOutcomeLibraryValidator's
// own "report everything, not just the first problem" style) and keeps consuming/writing so a caller sees every
// problem in one run; "built" is only returned once the whole source has been consumed with zero errors.
export async function streamModeOutcomesToTempFile<T extends string | number>(
    modeName: string,
    libraryId: string,
    outcomes: Iterable<WeightedOutcomeInput<T>> | AsyncIterable<WeightedOutcomeInput<T>>,
    schemaVersion: number,
    filePath: string,
): Promise<StreamModeOutcomesResult<T>> {
    const issues: ValidationIssue[] = [];
    const roundArtifactValidator = new RoundArtifactValidator<T>();
    const hash = crypto.createHash("sha256");
    hash.update(`{"libraryId":${JSON.stringify(libraryId)},"outcomes":[`);

    const entries: OutcomeLibraryBundleIndexEntry[] = [];
    const seenIds = new Set<string>();
    let previousId: string | undefined;
    let alreadyReportedUnsorted = false;
    let reference: OutcomeHomogeneityKey | undefined;
    let firstOutcome: WeightedOutcomeInput<T> | undefined;
    let offset = 0;
    let hashedCount = 0;
    let totalWeight = 0;

    const fd = fs.openSync(filePath, "w");
    try {
        for await (const outcome of outcomes) {
            if (!isNonEmptyString(outcome.id)) {
                issues.push({
                    code: "outcome-library-bundle-write-outcome-id-invalid",
                    severity: "error",
                    message: `mode "${modeName}": an outcome has an invalid id, got ${JSON.stringify(outcome.id)}.`,
                    details: {modeName},
                });
                continue;
            }

            if (seenIds.has(outcome.id)) {
                issues.push({
                    code: "outcome-library-bundle-write-duplicate-outcome-id",
                    severity: "error",
                    message: `mode "${modeName}": outcome id "${outcome.id}" is used by more than one outcome.`,
                    details: {modeName, id: outcome.id},
                });
                continue;
            }
            seenIds.add(outcome.id);

            if (!alreadyReportedUnsorted && previousId !== undefined && compareIds(previousId, outcome.id) >= 0) {
                issues.push({
                    code: "outcome-library-bundle-write-outcomes-not-sorted",
                    severity: "error",
                    message: `mode "${modeName}": outcomes must arrive in strictly increasing canonical id order — "${outcome.id}" does not come after "${previousId}".`,
                    details: {modeName, id: outcome.id},
                });
                alreadyReportedUnsorted = true;
            }
            previousId = outcome.id;

            if (!isPositiveSafeInteger(outcome.weight)) {
                issues.push({
                    code: "outcome-library-bundle-write-weight-invalid",
                    severity: "error",
                    message: `mode "${modeName}": outcome "${outcome.id}" has an invalid weight (${outcome.weight}); must be a positive safe integer — this bundle format's own weighted-draw path (see OutcomeLibraryBundleReader.drawOutcome) requires exact integer weights, the same requirement WeightedOutcomeSelector has toward a WeightedOutcomeLibrary.`,
                    details: {modeName, id: outcome.id},
                });
                continue;
            }

            if (!Number.isFinite(outcome.artifact.payoutMultiplier) || outcome.artifact.payoutMultiplier < 0) {
                issues.push({
                    code: "outcome-library-bundle-write-payout-multiplier-invalid",
                    severity: "error",
                    message: `mode "${modeName}": outcome "${outcome.id}" has an invalid artifact.payoutMultiplier (${outcome.artifact.payoutMultiplier}); must be a finite number >= 0.`,
                    details: {modeName, id: outcome.id},
                });
                continue;
            }
            if (!Number.isFinite(outcome.artifact.stake) || outcome.artifact.stake <= 0) {
                issues.push({
                    code: "outcome-library-bundle-write-stake-invalid",
                    severity: "error",
                    message: `mode "${modeName}": outcome "${outcome.id}" has an invalid artifact.stake (${outcome.artifact.stake}); must be a finite number > 0.`,
                    details: {modeName, id: outcome.id},
                });
                continue;
            }

            const artifactIssues = roundArtifactValidator.validate(outcome.artifact);
            if (artifactIssues.length > 0) {
                issues.push({
                    code: "outcome-library-bundle-write-artifact-invalid",
                    severity: "error",
                    message: `mode "${modeName}": outcome "${outcome.id}" has an invalid artifact: ${artifactIssues.map((issue) => issue.code).join(", ")}.`,
                    details: {modeName, id: outcome.id},
                });
                continue;
            }

            const current = homogeneityKeyOf(outcome);
            if (reference === undefined) {
                reference = current;
                firstOutcome = outcome;
            } else if (
                current.gameId !== reference.gameId ||
                current.gameVersion !== reference.gameVersion ||
                current.configHash !== reference.configHash ||
                current.pokieVersion !== reference.pokieVersion
            ) {
                issues.push({
                    code: "outcome-library-bundle-write-inconsistent-provenance",
                    severity: "error",
                    message: `mode "${modeName}": outcome "${outcome.id}" has different provenance (game id/version, configHash, or pokieVersion) than this mode's other outcomes.`,
                    details: {modeName, id: outcome.id},
                });
                continue;
            } else if (current.betMode !== reference.betMode) {
                issues.push({
                    code: "outcome-library-bundle-write-inconsistent-bet-mode",
                    severity: "error",
                    message: `mode "${modeName}": outcome "${outcome.id}" has betMode "${current.betMode}", expected "${reference.betMode}".`,
                    details: {modeName, id: outcome.id},
                });
                continue;
            } else if (current.stake !== reference.stake) {
                issues.push({
                    code: "outcome-library-bundle-write-inconsistent-stake",
                    severity: "error",
                    message: `mode "${modeName}": outcome "${outcome.id}" has stake ${current.stake}, expected ${reference.stake}.`,
                    details: {modeName, id: outcome.id},
                });
                continue;
            }

            const line = JSON.stringify(toCanonicalJson(outcome));
            const lineBuffer = Buffer.from(line, "utf-8");
            fs.writeSync(fd, lineBuffer);
            fs.writeSync(fd, "\n");
            const recordHash = `sha256:${crypto.createHash("sha256").update(lineBuffer).digest("hex")}`;
            entries.push({id: outcome.id, weight: outcome.weight, byteOffset: offset, byteLength: lineBuffer.byteLength, recordHash});
            offset += lineBuffer.byteLength + 1;

            if (hashedCount > 0) {
                hash.update(",");
            }
            hash.update(lineBuffer);
            hashedCount++;

            totalWeight += outcome.weight;
        }
    } finally {
        fs.closeSync(fd);
    }

    if (entries.length === 0) {
        issues.push({
            code: "outcome-library-bundle-write-outcomes-empty",
            severity: "error",
            message: `mode "${modeName}": at least one outcome is required.`,
            details: {modeName},
        });
        return {issues};
    }
    if (!Number.isSafeInteger(totalWeight)) {
        issues.push({
            code: "outcome-library-bundle-write-total-weight-overflow",
            severity: "error",
            message: `mode "${modeName}": the sum of all outcome weights (${totalWeight}) overflows a safe integer.`,
            details: {modeName},
        });
    }

    if (issues.some((issue) => issue.severity === "error")) {
        return {issues};
    }

    hash.update(`],"schemaVersion":${JSON.stringify(schemaVersion)}}`);
    const libraryHash = `sha256:${hash.digest("hex")}`;

    // Unreachable: reference/firstOutcome are always set together with the first entry ever pushed, and
    // entries.length === 0 already returned above.
    if (firstOutcome === undefined) {
        throw new Error(`mode "${modeName}": no outcome was accepted despite entries being non-empty — this should be unreachable.`);
    }

    return {issues, built: {entries, totalWeight, libraryHash, firstOutcome}};
}
