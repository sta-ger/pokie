import {Alert, Anchor, List, Text} from "@mantine/core";
import {IconRoute} from "@tabler/icons-react";

const GETTING_STARTED_URL = "https://github.com/sta-ger/pokie/tree/develop/docs/getting-started.md";

// A compact orientation card for the guided Design Game path. It deliberately names the three
// decisions a math author actually makes -- shape, math, proof -- instead of explaining Studio's
// implementation. The glossary is collapsed so it helps a first-time reader without pushing the
// starter form further down the page.
export function GettingStartedGuide() {
    return (
        <Alert color="blue" variant="light" icon={<IconRoute size={18} />} title="Three steps from an idea to a testable game" mb="md">
            <List type="ordered" size="sm" spacing={4}>
                <List.Item>
                    <Text span fw={600}>Shape the game.</Text> Pick reels, rows, symbols, paylines, paytable and bets.
                </List.Item>
                <List.Item>
                    <Text span fw={600}>Check the math.</Text> Use exact math for a complete enumeration; use Simulation when the design is too large to enumerate.
                </List.Item>
                <List.Item>
                    <Text span fw={600}>Make it real.</Text> Create game saves the design, then Play, Replay and Build/Export open in the workspace.
                </List.Item>
            </List>
            <details>
                <summary>New to slot math? Paylines, wilds and scatters in one minute</summary>
                <List size="sm" spacing={4} mt="xs">
                    <List.Item>
                        <Text span fw={600}>Payline</Text> is one fixed path across the reels; three matching symbols on that path pay.
                    </List.Item>
                    <List.Item>
                        <Text span fw={600}>Wild</Text> substitutes for other symbols on a line. <Text span fw={600}>Scatter</Text> usually pays anywhere and can trigger free games.
                    </List.Item>
                    <List.Item>
                        <Text span fw={600}>RTP</Text> is the long-run share returned to players; <Text span fw={600}>volatility</Text> describes how bumpy the ride is.
                    </List.Item>
                </List>
                <Text size="xs" c="dimmed" mt="xs">
                    More detail in the <Anchor href={GETTING_STARTED_URL} target="_blank" rel="noreferrer">Getting started guide</Anchor>.
                </Text>
            </details>
        </Alert>
    );
}
