import {Anchor, Badge, Button, Group, Paper, SimpleGrid, Stack, Text} from "@mantine/core";
import {PageSection} from "../common/PageSection";

/**
 * The first thing a new author sees before the full editor. The compact row is the whole decision:
 * starter, Ways/Clusters, PAR import, existing project. The longer descriptions stay available under
 * one disclosure instead of pushing the editable sections below the fold.
 */
export function StartingPointPanel({
    onStartLine,
    onStartWays,
    onStartClusters,
    onImportPar,
    onOpenProject,
    onMoreStarts,
}: {
    onStartLine: () => void;
    onStartWays: () => void;
    onStartClusters: () => void;
    onImportPar: () => void;
    onOpenProject: () => void;
    onMoreStarts: () => void;
}) {
    return (
        <PageSection legend="Choose a starting point">
            <Text size="sm" c="dimmed" mb="sm">
                The ready-to-edit starter (5×3, four symbols, three lines) is already loaded. Use it, switch
                the win model, or bring in a PAR sheet or existing project.
            </Text>
            <Group gap="xs" wrap="wrap" data-pokie-starting-point-actions>
                <Button variant="light" onClick={onStartLine}>Use the starter</Button>
                <Button variant="default" onClick={onStartWays}>Ways</Button>
                <Badge size="xs" color="yellow" variant="light" data-pokie-structural-demo="ways">structural demo</Badge>
                <Button variant="default" onClick={onStartClusters}>Clusters</Button>
                <Badge size="xs" color="yellow" variant="light" data-pokie-structural-demo="clusters">structural demo</Badge>
                <Button variant="default" onClick={onImportPar}>Open PAR import</Button>
                <Button variant="default" onClick={onOpenProject}>Open Projects</Button>
                <Anchor component="button" type="button" size="xs" onClick={onMoreStarts}>
                    Blank or generated template
                </Anchor>
            </Group>
            <Text size="xs" c="dimmed" mt="xs">
                The starter is already loaded; use this to reset after experimenting. A game design is the
                editable source; saving creates a Studio project.
            </Text>
            <details style={{marginTop: "var(--mantine-spacing-sm)"}}>
                <summary style={{cursor: "pointer"}}>
                    <Text span size="sm">Compare the three starting paths</Text>
                </summary>
                <SimpleGrid cols={{base: 1, sm: 3}} spacing="sm" mt="sm">
                    <Paper withBorder p="sm" radius="md">
                        <Stack gap="xs">
                            <Text fw={600}>New slot</Text>
                            <Text size="xs" c="dimmed">
                                Start from the ready-to-edit 5×3 starter: four symbols, three paylines and a
                                working paytable. <strong>Lines</strong> is the balanced demo. <strong>Ways</strong>{" "}
                                and <strong>Clusters</strong> keep that same paytable and are structural demos only
                                until you retune the math.
                            </Text>
                        </Stack>
                    </Paper>
                    <Paper withBorder p="sm" radius="md">
                        <Stack gap="xs">
                            <Text fw={600}>Import a PAR sheet</Text>
                            <Text size="xs" c="dimmed">
                                A PAR sheet is the standard slot-math spreadsheet (.xlsx): paytable, reels and RTP
                                in one exchange file. Bring one into the draft, compare its math first, then apply
                                it only when you choose.
                            </Text>
                        </Stack>
                    </Paper>
                    <Paper withBorder p="sm" radius="md">
                        <Stack gap="xs">
                            <Text fw={600}>Open an existing game</Text>
                            <Text size="xs" c="dimmed">
                                Continue a saved game design, or add a game package, an outcome table or a PAR
                                workbook from your computer.
                            </Text>
                        </Stack>
                    </Paper>
                </SimpleGrid>
            </details>
        </PageSection>
    );
}
