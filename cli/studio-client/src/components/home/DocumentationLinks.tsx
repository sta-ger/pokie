import {Anchor, List, Title} from "@mantine/core";

const DOCS = "https://github.com/sta-ger/pokie/tree/develop/docs";
const EXAMPLES = "https://github.com/sta-ger/pokie-examples";

// Always visible below the Home tabs, regardless of which tab is active.
export function DocumentationLinks() {
    return (
        <div>
            <Title order={4} mb="xs">
                Documentation
            </Title>
            <List size="sm">
                <List.Item>
                    <Anchor href={DOCS} target="_blank" rel="noreferrer">
                        Documentation
                    </Anchor>
                </List.Item>
                <List.Item>
                    <Anchor href={`${DOCS}/getting-started.md`} target="_blank" rel="noreferrer">
                        Getting started
                    </Anchor>
                </List.Item>
                <List.Item>
                    <Anchor href={`${DOCS}/cli.md`} target="_blank" rel="noreferrer">
                        CLI reference
                    </Anchor>
                </List.Item>
                <List.Item>
                    <Anchor href={EXAMPLES} target="_blank" rel="noreferrer">
                        Example games
                    </Anchor>
                </List.Item>
            </List>
        </div>
    );
}
