import {List, Text} from "@mantine/core";

export type IssueListEntry = {code?: string; message: string};

// Shared by every errors/warnings/suggestions panel (Blueprint validate, project Validate, Build
// preview/result) -- one rendering for `{code, message}` validation issues.
export function IssueList({title, issues}: {title: string; issues: IssueListEntry[]}) {
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
                        {issue.code ? `${issue.code}: ${issue.message}` : issue.message}
                    </List.Item>
                ))}
            </List>
        </div>
    );
}
