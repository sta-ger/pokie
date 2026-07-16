import {NavLink} from "@mantine/core";
import {useCloseNavbar} from "./AppShellLayout";

export type NavTabItem<T extends string> = {value: T; label: string};

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
            {items.map((item) => (
                <NavLink
                    key={item.value}
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
            ))}
        </nav>
    );
}
