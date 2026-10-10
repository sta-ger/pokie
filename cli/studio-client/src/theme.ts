import {createTheme} from "@mantine/core";

// Shared task, section and supporting-text scale for both Home and saved projects.
export const theme = createTheme({
    primaryColor: "indigo",
    defaultRadius: "md",
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
    black: "#243044",
    fontSizes: {xs: "0.75rem", sm: "0.8125rem", md: "0.875rem", lg: "1rem", xl: "1.125rem"},
    lineHeights: {xs: "1.5", sm: "1.55", md: "1.55", lg: "1.5", xl: "1.4"},
    headings: {
        fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
        fontWeight: "600",
        sizes: {
            h1: {fontSize: "1.75rem", lineHeight: "1.25"},
            h2: {fontSize: "1.5rem", lineHeight: "1.3"},
            h3: {fontSize: "1.1875rem", lineHeight: "1.4"},
            h4: {fontSize: "1rem", lineHeight: "1.4"},
        },
    },
    components: {
        Button: {defaultProps: {radius: "md"}},
        Paper: {defaultProps: {radius: "md", withBorder: true}},
        InputWrapper: {styles: {label: {fontWeight: 500}, description: {lineHeight: 1.5}}},
        NavLink: {styles: {root: {borderRadius: "var(--mantine-radius-md)", marginBlock: 2}, label: {fontWeight: 500}}},
    },
});
