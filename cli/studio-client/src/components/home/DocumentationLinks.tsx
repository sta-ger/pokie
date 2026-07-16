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
                    <Anchor href="https://github.com/sta-ger/pokie/blob/master/docs/README.md" target="_blank" rel="noreferrer">
                        Docs index
                    </Anchor>
                </List.Item>
                <List.Item>
                    <Anchor href="https://github.com/sta-ger/pokie/blob/master/docs/getting-started.md" target="_blank" rel="noreferrer">
                        Getting started
                    </Anchor>
                </List.Item>
                <List.Item>
                    <Anchor href="https://github.com/sta-ger/pokie/blob/master/docs/cli.md" target="_blank" rel="noreferrer">
                        CLI reference
                    </Anchor>
                </List.Item>
            </List>
        </div>
    );
}
