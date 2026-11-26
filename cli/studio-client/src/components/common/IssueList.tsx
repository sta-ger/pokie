import {List, Text} from "@mantine/core";

export type IssueListEntry = {code?: string; message: string; path?: string; suggestion?: string; details?: Record<string, unknown>};

// Shared by every errors/warnings/suggestions panel (Blueprint validate, project Validate, Build
// preview/result) -- one rendering for `{code, message}` validation issues.
export function IssueList({title, issues, showCode = true}: {title: string; issues: IssueListEntry[]; showCode?: boolean}) {
    if (issues.length === 0) {
        return null;
    }
    return (
        <div>
            <Text fw={600} size="sm" mb={4}>
                {title}
            </Text>
            <List size="sm" spacing={4} style={{overflowWrap: "anywhere"}}>
                {issues.map((issue, index) => (
                    <List.Item key={`${issue.code ?? "issue"}-${index}`}>
                        {issue.message}
                        {issue.path && <Text size="sm">Path: {issue.path}</Text>}
                        {issue.suggestion && <Text size="sm">{issue.suggestion}</Text>}
                        {issue.details && <details><summary>Evidence</summary><pre style={{whiteSpace: "pre-wrap"}}>{JSON.stringify(issue.details, null, 2)}</pre></details>}
                        {issue.code && showCode && (
                            <details>
                                <summary>Technical code</summary>
                                <Text size="xs">{issue.code}</Text>
                            </details>
                        )}
                    </List.Item>
                ))}
            </List>
        </div>
    );
}
