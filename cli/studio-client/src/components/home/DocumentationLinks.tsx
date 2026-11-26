import {Anchor, List, Title} from "@mantine/core";
import {Link} from "react-router-dom";

const EXAMPLES = "https://github.com/sta-ger/pokie-examples";

// Always visible below the Home tabs, regardless of which tab is active. The guides are bundled from
// this installation and open inside Studio; only the separate examples repository is external.
export function DocumentationLinks() {
    return (
        <div>
            <Title order={4} mb="xs">
                Documentation
            </Title>
            <List size="sm">
                <List.Item>
                    <Anchor component={Link} to="/docs/README">
                        Documentation
                    </Anchor>
                </List.Item>
                <List.Item>
                    <Anchor component={Link} to="/docs/getting-started">
                        Getting started
                    </Anchor>
                </List.Item>
                <List.Item>
                    <Anchor component={Link} to="/docs/glossary">
                        Glossary
                    </Anchor>
                </List.Item>
                <List.Item>
                    <Anchor component={Link} to="/docs/cli">
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
