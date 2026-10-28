import {Text} from "@mantine/core";
import type {AdvancedModelValidationReport} from "../../../../../src/validation/AdvancedModelValidation.js";
import {AdvancedDisclosure} from "./AdvancedDisclosure";
import {IssueList} from "./IssueList";

export function AdvancedValidationPanel({report}: {report?: AdvancedModelValidationReport}) {
    if (!report) return null;
    return <div>
        <Text fw={600}>Declared model analysis: {report.status} — {report.verdict}</Text>
        <AdvancedDisclosure label="model analysis details">
            <Text size="sm">Termination: {report.termination}. Executable fidelity: {report.executableFidelity}.</Text>
            <IssueList title="Advanced checks" issues={report.checks.map(check => ({code: check.id, path: check.path, message: `${check.status}: ${check.message}`, details: check.evidence === undefined ? undefined : {evidence: check.evidence}}))} />
            <IssueList title="Analysis assumptions" issues={report.assumptions.map(message => ({message}))} />
            <IssueList title="Analysis limitations" issues={report.limitations.map(message => ({message}))} />
            <details><summary>Analysis budget and work</summary><pre>{JSON.stringify({limits: report.limits, work: report.work}, null, 2)}</pre></details>
        </AdvancedDisclosure>
    </div>;
}
