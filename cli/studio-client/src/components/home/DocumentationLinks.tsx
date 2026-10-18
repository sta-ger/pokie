import {Anchor, List, Title} from "@mantine/core";

// Always visible below the Home tabs, regardless of which tab is active -- matches the old
// index.html's #documentation section.
export function DocumentationLinks() {
    return (
        <div>
            <Title order={4} mb="xs">
                Documentation
            </Title>
            <List size="sm">
                <List.Item>
                    <Anchor href="https://pokie.fromstan.com/docs/" target="_blank" rel="noreferrer">
                        Public docs (deployment target)
                    </Anchor>
                </List.Item>
                <List.Item>
                    <Anchor href="https://pokie.fromstan.com/docs/getting-started/" target="_blank" rel="noreferrer">
                        Getting started
                    </Anchor>
                </List.Item>
                <List.Item>
                    <Anchor href="https://pokie.fromstan.com/docs/cli-api/" target="_blank" rel="noreferrer">
                        CLI reference
                    </Anchor>
                </List.Item>
                <List.Item>
                    <Anchor href="https://github.com/fromstan/pokie/blob/develop/docs/README.md" target="_blank" rel="noreferrer">
                        Source guides (available before site deployment)
                    </Anchor>
                </List.Item>
            </List>
        </div>
    );
}
