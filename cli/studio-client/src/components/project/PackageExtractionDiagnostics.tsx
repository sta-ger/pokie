import {Text} from "@mantine/core";
import type {PackageBlueprintExtractionResult} from "../../api/types";

export function PackageExtractionDiagnostics({extraction}: {extraction?: PackageBlueprintExtractionResult}) {
    if (!extraction) return null;
    return (
        <div aria-label="Package extraction evidence">
            <Text fw={600}>
                Package model: {extraction.status} ({extraction.source.kind})
            </Text>
            {extraction.diagnostics.map((issue, index) => (
                <Text key={index} size="sm" c="orange">
                    {issue.path}: {issue.code}: {issue.message}
                </Text>
            ))}
            {extraction.comparisonLimits.map((limit, index) => (
                <Text key={index} size="sm">
                    {limit}
                </Text>
            ))}
            {extraction.fields
                .filter((field) => field.status !== "exact")
                .map((field, index) => (
                    <Text key={index} size="sm" c="dimmed">
                        {field.path}: {field.status} — {field.authority}
                    </Text>
                ))}
        </div>
    );
}
