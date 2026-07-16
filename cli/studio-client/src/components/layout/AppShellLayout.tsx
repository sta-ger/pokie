import {AppShell, Burger, Group, Title} from "@mantine/core";
import {useDisclosure} from "@mantine/hooks";
import type {ReactNode} from "react";

// Pure structural shell -- knows nothing about routing or tabs, just header/navbar/main slots. Each
// page (HomePage, ProjectDashboardPage) supplies its own `navbar` content, since which tabs exist and
// which one is active is local page state today, exactly as it was in the old app (tab selection never
// changes the URL) -- see the plan's routing decision.
export function AppShellLayout({
    navbar,
    headerRight,
    children,
}: {
    navbar: ReactNode;
    headerRight?: ReactNode;
    children: ReactNode;
}) {
    const [opened, {toggle}] = useDisclosure();

    return (
        <AppShell header={{height: 60}} navbar={{width: 260, breakpoint: "sm", collapsed: {mobile: !opened}}} padding="md">
            <AppShell.Header>
                <Group h="100%" px="md" justify="space-between">
                    <Group>
                        <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Toggle navigation" />
                        <Title order={3}>POKIE Studio</Title>
                    </Group>
                    {headerRight}
                </Group>
            </AppShell.Header>
            <AppShell.Navbar p="md">{navbar}</AppShell.Navbar>
            <AppShell.Main>{children}</AppShell.Main>
        </AppShell>
    );
}
