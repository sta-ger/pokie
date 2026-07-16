import {NavLink, Text} from "@mantine/core";
import {useCloseNavbar} from "./AppShellLayout";

// `section` is purely a visual grouping label (e.g. "Advanced") -- omitting it (every call site did,
// before the Project Dashboard's task-oriented nav redesign) renders exactly as before, a flat list.
export type NavTabItem<T extends string> = {value: T; label: string; section?: string};

// Vertical tab list rendered into AppShellLayout's navbar slot -- preserves aria-current="page" on the
// active item, same affordance the old .tab[aria-current="page"] convention provided. Rendered as real
// <button>s (not Mantine NavLink's default hrefless <a>, which isn't keyboard-focusable) so the nav is
// reachable by keyboard -- there's no distinct URL per tab to navigate to, so a button is also the more
// correct ARIA choice than a link here.
//
// Selecting a section also closes the mobile navbar drawer (a no-op on desktop, where it's never
// collapsed) and returns focus to the Burger that opened it.
export function NavTabs<T extends string>({items, active, onSelect}: {items: NavTabItem<T>[]; active: T; onSelect: (value: T) => void}) {
    const closeNavbar = useCloseNavbar();

    return (
        <nav aria-label="Sections">
            {items.map((item, index) => (
                <div key={item.value}>
                    {item.section !== undefined && item.section !== items[index - 1]?.section && (
                        <Text size="xs" tt="uppercase" c="dimmed" fw={700} mt="sm" mb={4} px="xs">
                            {item.section}
                        </Text>
                    )}
                    <NavLink
                        component="button"
                        type="button"
                        label={item.label}
                        active={item.value === active}
                        aria-current={item.value === active ? "page" : undefined}
                        onClick={() => {
                            onSelect(item.value);
                            closeNavbar();
                        }}
                    />
                </div>
            ))}
        </nav>
    );
}
