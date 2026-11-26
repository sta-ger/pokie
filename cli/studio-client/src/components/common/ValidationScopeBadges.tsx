import {Badge, Group, Text} from "@mantine/core";
import type {BlueprintValidationView} from "../../domain/interpret/BlueprintEditor";
import type {ProjectValidationView} from "../../domain/interpret/ProjectDashboard";
import {
    describeBlueprintValidationScopes,
    describeProjectValidationScopes,
    type ProjectMathStatus,
    type ValidationScopeBadge,
} from "../../domain/validationScope";

function BadgeRow({badges}: {badges: readonly ValidationScopeBadge[]}) {
    return (
        <Group gap="xs" align="center" wrap="wrap">
            {badges.map((badge) => (
                <Badge
                    key={badge.scope}
                    color={badge.color}
                    variant="light"
                    data-pokie-validation-scope={badge.scope}
                    title={badge.detail}
                >
                    {badge.label}
                </Badge>
            ))}
        </Group>
    );
}

function ScopeDetails({badges}: {badges: readonly ValidationScopeBadge[]}) {
    return (
        <Text size="xs" c="dimmed" mt={4}>
            {badges.map((badge) => badge.detail).join(" ")}
        </Text>
    );
}

export function BlueprintValidationScopeBadges({
    view,
    mathStatus,
}: {
    view: BlueprintValidationView;
    mathStatus: "idle" | "loading" | "ok" | "unavailable" | "error";
}) {
    const badges = describeBlueprintValidationScopes(view, mathStatus);
    return (
        <div data-pokie-validation-scopes>
            <BadgeRow badges={badges} />
            <ScopeDetails badges={badges} />
        </div>
    );
}

export function ProjectValidationScopeBadges({
    view,
    mathStatus,
}: {
    view: ProjectValidationView;
    mathStatus?: ProjectMathStatus;
}) {
    const badges = describeProjectValidationScopes(view, mathStatus);
    return (
        <div data-pokie-validation-scopes>
            <BadgeRow badges={badges} />
            <ScopeDetails badges={badges} />
        </div>
    );
}
