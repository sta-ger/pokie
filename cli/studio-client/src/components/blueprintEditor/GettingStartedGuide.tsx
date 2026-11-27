import {Alert, Anchor, List, Text} from "@mantine/core";
import {IconRoute} from "@tabler/icons-react";
import {Link} from "react-router-dom";

// A compact orientation card for the guided Design Game path. It deliberately names the three
// decisions a math author actually makes -- shape, math, proof -- instead of explaining Studio's
// implementation. The glossary is collapsed so it helps a first-time reader without pushing the
// starter form further down the page.
export function GettingStartedGuide() {
    return (
        <details className="studio-getting-started" style={{marginBottom: "var(--mantine-spacing-md)"}}>
            <summary style={{cursor: "pointer"}}>
                <Text span fw={600}>How this works</Text> — shape the game, check the math, then save and play.
            </summary>
            <Alert color="blue" variant="light" icon={<IconRoute size={18} />} title="Three steps from an idea to a testable game" mt="xs">
                <List type="ordered" size="sm" spacing={4}>
                    <List.Item>
                        <Text span fw={600}>Shape the game.</Text> Pick reels, rows, symbols, paylines, paytable and bets.
                    </List.Item>
                    <List.Item>
                        <Text span fw={600}>Check the math.</Text> Use exact math for a complete enumeration; use Simulation when the design is too large to enumerate.
                    </List.Item>
                    <List.Item>
                        <Text span fw={600}>Make it real.</Text> Saving the design stores it under your POKIE Projects folder, then Play,
                    Replay and Build/Export open in the workspace.
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
                            <Text span fw={600}>Exact or sampled?</Text> Exact math enumerates every outcome. Simulation samples rounds and reports an
                        estimate; Studio never presents a sample as exact. If a design is too large, Studio says so and points to an
                        outcome table or Simulation.
                        </List.Item>
                        <List.Item>
                            <Text span fw={600}>RTP</Text> is the long-run share returned to players. <Text span fw={600}>Hit frequency</Text> is
                        the share of rounds with any win. <Text span fw={600}>Volatility (std. deviation, bet units)</Text> is the spread of per-round payouts; higher
                        means bumpier. <Text span fw={600}>Max win</Text> can exceed the largest paytable entry when several lines win together.
                        </List.Item>
                        <List.Item>
                            <Text span fw={600}>For a math review</Text>, use Build/Export → <Text span fw={600}>PAR sheet (.xlsx)</Text>:
                        paytable, reels, exact RTP and win contributions in one workbook.
                        </List.Item>
                        <List.Item>
                            <Text span fw={600}>No code needed</Text> for design, exact math, simulation, play or PAR export. TypeScript and WASM
                        are only for developers shipping the game.
                        </List.Item>
                    </List>
                    <Text size="xs" c="dimmed" mt="xs">
                    More detail in the <Anchor component={Link} to="/docs/getting-started">Getting started guide</Anchor>.
                    </Text>
                </details>
            </Alert>
        </details>
    );
}
