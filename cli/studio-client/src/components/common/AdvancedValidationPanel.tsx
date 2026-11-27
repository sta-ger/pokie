import {Alert, Text} from "@mantine/core";
import type {AdvancedModelValidationReport} from "../../../../../src/validation/AdvancedModelValidation.js";
import {AdvancedDisclosure} from "./AdvancedDisclosure";
import {IssueList} from "./IssueList";

function describeAnalysisStatus(status: AdvancedModelValidationReport["status"]): string {
    if (status === "budget-exhausted") return "not finished (too many outcomes to check)";
    if (status === "counterexample") return "not every possible round is proven to end";
    if (status === "complete") return "complete";
    return status;
}

function describeVerdict(verdict: AdvancedModelValidationReport["verdict"], hasTerminationViolation: boolean): string {
    if (verdict === "proved-within-assumptions") return "all declared feature paths passed (within assumptions)";
    if (verdict === "violated") return hasTerminationViolation ? "a possible feature path may not end" : "not all declared feature checks passed";
    return "not conclusive";
}

function statusColor(status: AdvancedModelValidationReport["status"]): "red" | "yellow" | "blue" {
    if (status === "invalid" || status === "failed") return "red";
    if (status === "counterexample" || status === "budget-exhausted" || status === "cancelled") return "yellow";
    return "blue";
}

export function AdvancedValidationPanel({report}: {report?: AdvancedModelValidationReport}) {
    if (!report) return null;
    const freeGamesTermination = report.checks.find((check) => check.id === "termination.free-games" && check.status === "violation");
    return (
        <Alert color={statusColor(report.status)} variant="light" title={`Feature check: ${describeAnalysisStatus(report.status)} — ${describeVerdict(report.verdict, freeGamesTermination !== undefined)}`}>
            <Text size="sm" c="dimmed">
                Optional check of feature termination and accounting; it does not prove RTP, payout probabilities or certification. The design check is separate.
            </Text>
            {freeGamesTermination !== undefined && (
                <Text size="sm" mt={4}>
                    Free games retrigger additively without a hard cap. This warns that not every possible round is proven to end; it is not a design-check error.
                </Text>
            )}
            <AdvancedDisclosure label="feature check details">
                <Text size="sm">
                    {report.status === "budget-exhausted" ? "An unfinished optional check does not make this design invalid. " : ""}
                    Feature-path coverage: {report.termination}. Runtime rule set: {report.executableFidelity}.
                </Text>
                {freeGamesTermination !== undefined && (
                    <Text size="sm" mt={4}>
                        The check requires every possible round to end within the declared feature limit. A retrigger factor below 1
                        keeps the average finite and means a round ends with probability 1, but it does not put a hard limit on one round.
                        POKIE&apos;s authored free games are additive and uncapped, so treat the exact total RTP as an expected-value result.
                        A bounded feature with a hard free-games limit would make every round finite; the current authored schema does not provide one.
                    </Text>
                )}
                <IssueList title="Checks" issues={report.checks.map(check => ({code: check.id, path: check.path, message: `${check.status}: ${check.message}`, details: check.evidence === undefined ? undefined : {evidence: check.evidence}}))} />
                <IssueList title="Assumptions" issues={report.assumptions.map(message => ({message}))} />
                <IssueList title="Limitations" issues={report.limitations.map(message => ({message}))} />
                <details><summary>Analysis limits and work</summary><pre>{JSON.stringify({limits: report.limits, work: report.work}, null, 2)}</pre></details>
            </AdvancedDisclosure>
        </Alert>
    );
}
