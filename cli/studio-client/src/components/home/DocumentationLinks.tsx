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
                    <Anchor href="/help/docs/" target="_blank" rel="noreferrer">
                        Public docs (included locally)
                    </Anchor>
                </List.Item>
                <List.Item>
                    <Anchor href="/help/docs/getting-started/" target="_blank" rel="noreferrer">
                        Getting started
                    </Anchor>
                </List.Item>
                <List.Item>
                    <Anchor href="/help/docs/cli-api/" target="_blank" rel="noreferrer">
                        CLI reference
                    </Anchor>
                </List.Item>
                <List.Item>
                    <Anchor href="/help/" target="_blank" rel="noreferrer">
                        FromStan / POKIE — examples and boundaries
                    </Anchor>
                </List.Item>
            </List>
        </div>
    );
}
