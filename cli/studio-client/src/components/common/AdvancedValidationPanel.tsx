import {Text} from "@mantine/core";
import type {AdvancedModelValidationReport} from "../../../../../src/validation/AdvancedModelValidation.js";
import {AdvancedDisclosure} from "./AdvancedDisclosure";
import {IssueList} from "./IssueList";

function describeAnalysisStatus(status: AdvancedModelValidationReport["status"]): string {
    if (status === "budget-exhausted") return "not finished (analysis limit reached)";
    if (status === "complete") return "complete";
    return status;
}

function describeVerdict(verdict: AdvancedModelValidationReport["verdict"]): string {
    if (verdict === "proved-within-assumptions") return "all declared feature paths passed (within assumptions)";
    if (verdict === "violated") return "a declared check failed";
    return "not conclusive";
}

export function AdvancedValidationPanel({report}: {report?: AdvancedModelValidationReport}) {
    if (!report) return null;
    return <div>
        <Text fw={600}>Feature and accounting check: {describeAnalysisStatus(report.status)} — {describeVerdict(report.verdict)}</Text>
        <Text size="sm" c="dimmed">
            Optional check of feature termination and accounting. It does not prove RTP, payout probabilities or certification. Structural validation above is separate{report.status === "budget-exhausted" ? "; an unfinished check does not make this design invalid." : "."}
        </Text>
        <AdvancedDisclosure label="technical check details">
            <Text size="sm">Feature paths: {report.termination}. Runtime behavior: {report.executableFidelity}.</Text>
            <IssueList title="Checks" issues={report.checks.map(check => ({code: check.id, path: check.path, message: `${check.status}: ${check.message}`, details: check.evidence === undefined ? undefined : {evidence: check.evidence}}))} />
            <IssueList title="Assumptions" issues={report.assumptions.map(message => ({message}))} />
            <IssueList title="Limitations" issues={report.limitations.map(message => ({message}))} />
            <details><summary>Analysis limits and work</summary><pre>{JSON.stringify({limits: report.limits, work: report.work}, null, 2)}</pre></details>
        </AdvancedDisclosure>
    </div>;
}
