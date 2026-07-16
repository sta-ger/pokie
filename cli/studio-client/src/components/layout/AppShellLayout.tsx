import {Anchor, AppShell, Breadcrumbs, Burger, Group, Text, Title} from "@mantine/core";
import {useDisclosure} from "@mantine/hooks";
import {createContext, useContext, useEffect, useRef, type ReactNode} from "react";

export type StudioBreadcrumb = {label: string; onClick?: () => void};

// Lets NavTabs (rendered as the `navbar` prop, already-constructed JSX from whichever page owns it)
// close the mobile navbar drawer after a selection, without AppShellLayout needing to know anything
// about tabs -- and without NavTabs needing the `opened`/`close` state threaded through as props.
// Calling it while the navbar isn't collapsed (desktop) is a harmless no-op.
const NavbarCloseContext = createContext<() => void>(() => undefined);

export function useCloseNavbar(): () => void {
    return useContext(NavbarCloseContext);
}

// Pure structural shell -- knows nothing about routing or tabs, just header/navbar/main slots. Each
// page (HomePage, ProjectDashboardPage) supplies its own `navbar` content, since which tabs exist and
// which one is active is local page state today, exactly as it was in the old app (tab selection never
// changes the URL) -- see the plan's routing decision.
//
// Mobile nav behavior: selecting a section (via NavbarCloseContext, consumed by NavTabs) or pressing
// Escape while the drawer is open both close it and return focus to the Burger that opened it -- the
// standard dismissible-overlay pattern, so keyboard users never lose their place once the drawer closes.
export function AppShellLayout({
    navbar,
    headerRight,
    breadcrumbs = [],
    children,
}: {
    navbar: ReactNode;
    headerRight?: ReactNode;
    breadcrumbs?: StudioBreadcrumb[];
    children: ReactNode;
}) {
    const [opened, {toggle, close}] = useDisclosure();
    const burgerRef = useRef<HTMLButtonElement>(null);

    const closeAndFocusBurger = (): void => {
        close();
        burgerRef.current?.focus();
    };

    useEffect(() => {
        if (!opened) {
            return undefined;
        }
        const handleKeyDown = (event: KeyboardEvent): void => {
            if (event.key === "Escape") {
                closeAndFocusBurger();
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opened]);

    return (
        <AppShell header={{height: 60}} navbar={{width: 260, breakpoint: "sm", collapsed: {mobile: !opened}}} padding="md">
            <AppShell.Header>
                <Group h="100%" px="md" justify="space-between" wrap="nowrap">
                    <Group wrap="nowrap">
                        <Burger ref={burgerRef} opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Toggle navigation" />
                        {breadcrumbs.length === 0 ? (
                            <Anchor href="#/" underline="never" c="inherit">
                                <Title order={3}>POKIE Studio</Title>
                            </Anchor>
                        ) : (
                            <Breadcrumbs>
                                <Anchor href="#/" underline="hover" size="sm" fw={700}>
                                    POKIE Studio
                                </Anchor>
                                {breadcrumbs.map((crumb, index) =>
                                    crumb.onClick ? (
                                        <Anchor key={index} component="button" type="button" onClick={crumb.onClick} underline="hover" size="sm">
                                            {crumb.label}
                                        </Anchor>
                                    ) : (
                                        <Text key={index} size="sm" c="dimmed">
                                            {crumb.label}
                                        </Text>
                                    ),
                                )}
                            </Breadcrumbs>
                        )}
                    </Group>
                    {headerRight}
                </Group>
            </AppShell.Header>
            <AppShell.Navbar p="md">
                <NavbarCloseContext.Provider value={closeAndFocusBurger}>{navbar}</NavbarCloseContext.Provider>
            </AppShell.Navbar>
            <AppShell.Main>{children}</AppShell.Main>
        </AppShell>
    );
}
