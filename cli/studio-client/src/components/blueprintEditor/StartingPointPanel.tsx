import {Anchor, Badge, Button, Group, Paper, SimpleGrid, Stack, Text} from "@mantine/core";
import {PageSection} from "../common/PageSection";

/**
 * The first thing a new author sees before the full editor: three honest entry points instead of a
 * wall of fields. It is purely a launcher -- every action either focuses the already-mounted starter
 * draft, opens the existing PAR import panel, or leaves for Projects. Nothing here mutates the draft.
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
                Pick the shortest path. The starter below is already valid and playable, and every choice stays editable.
            </Text>
            <SimpleGrid cols={{base: 1, sm: 3}} spacing="sm">
                <Paper withBorder p="sm" radius="md">
                    <Stack gap="xs">
                        <Text fw={600}>New slot</Text>
                        <Text size="xs" c="dimmed">
                            Start from the ready-to-edit 5×3 starter: four symbols, three paylines and a working
                            paytable. <strong>Lines</strong> is the balanced demo. <strong>Ways</strong> and
                            <strong> Clusters</strong> keep that same paytable and are structural demos only until
                            you retune the math.
                        </Text>
                        <Button variant="light" mt="xs" onClick={onStartLine}>Use the starter</Button>
                        <Text size="xs" c="dimmed">The starter is already loaded; use this to reset after experimenting.</Text>
                        <Group gap="sm" wrap="wrap">
                            <Anchor component="button" type="button" size="xs" onClick={onStartWays}>Ways</Anchor>
                            <Badge size="xs" color="yellow" variant="light" data-pokie-structural-demo="ways">structural demo</Badge>
                        </Group>
                        <Group gap="sm" wrap="wrap">
                            <Anchor component="button" type="button" size="xs" onClick={onStartClusters}>Clusters</Anchor>
                            <Badge size="xs" color="yellow" variant="light" data-pokie-structural-demo="clusters">structural demo</Badge>
                        </Group>
                    </Stack>
                </Paper>
                <Paper withBorder p="sm" radius="md">
                    <Stack gap="xs">
                        <Text fw={600}>Import a PAR sheet</Text>
                        <Text size="xs" c="dimmed">
                            A PAR sheet is the standard slot-math spreadsheet (.xlsx): paytable, reels and RTP in one
                            exchange file. Bring one into the draft, compare its math first, then apply it only when
                            you choose.
                        </Text>
                        <Button variant="light" mt="xs" onClick={onImportPar}>Open PAR import</Button>
                        <Text size="xs" c="dimmed">
                            Opens the import panel below; choose the workbook there.
                        </Text>
                    </Stack>
                </Paper>
                <Paper withBorder p="sm" radius="md">
                    <Stack gap="xs">
                        <Text fw={600}>Open an existing game</Text>
                        <Text size="xs" c="dimmed">
                            Continue a game design you already saved, or add a game package, an outcome table or a PAR workbook from your computer.
                        </Text>
                        <Button variant="light" mt="xs" onClick={onOpenProject}>Open Projects</Button>
                    </Stack>
                </Paper>
            </SimpleGrid>
            <Text size="sm" mt="sm">
                Need a blank design or a generated template instead?{" "}
                <Anchor component="button" type="button" onClick={onMoreStarts}>Blank or generated template</Anchor>.
            </Text>
            <Text size="xs" c="dimmed" mt={4}>
                A game design is the editable source. Saving it creates a Studio project; Game design is the saved design&apos;s editable view.
            </Text>
        </PageSection>
    );
}
