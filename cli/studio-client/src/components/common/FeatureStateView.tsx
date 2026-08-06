import {List, Text} from "@mantine/core";
import type {RoundArtifactFeatureEvent} from "../../api/types";
import {AdvancedDisclosure} from "./AdvancedDisclosure";
import {CodeBlock} from "./CodeBlock";

// The shared "what feature state changed this step" presentation -- straight from a step's own
// RoundArtifactFeatureEvent list, never re-derived. Each event's own free-form `data` payload (per-game,
// e.g. a multiplier/scatter/ways/cluster feature's own detail) is real, game-provided content, but its
// shape isn't part of any contract this client understands -- shown collapsed behind Advanced details,
// same "closed by default" convention as artifact.debug, rather than either dropped or dumped inline.
export function FeatureStateView({events}: {events: readonly RoundArtifactFeatureEvent[]}) {
    if (events.length === 0) {
        return null;
    }

    const eventsWithData = events.filter((event) => event.data !== undefined);

    return (
        <div>
            <Text size="sm" fw={600} mt="sm">
                Feature events
            </Text>
            <List size="sm">
                {events.map((event, index) => (
                    <List.Item key={index}>{event.type}</List.Item>
                ))}
            </List>
            {eventsWithData.length > 0 && (
                <AdvancedDisclosure detail="feature event data">
                    {eventsWithData.map((event, index) => (
                        <div key={index}>
                            <Text size="sm" fw={600} mb={4}>
                                {event.type}
                            </Text>
                            <CodeBlock>{JSON.stringify(event.data, null, 2)}</CodeBlock>
                        </div>
                    ))}
                </AdvancedDisclosure>
            )}
        </div>
    );
}
