import {createTheme} from "@mantine/core";

// Shared task, section and supporting-text scale for both Home and saved projects.
export const theme = createTheme({
    // Match the built public docs/gallery/playground's navy, cream and copper identity.
    primaryColor: "copper",
    primaryShade: {light: 8, dark: 3},
    colors: {
        copper: ["#fff2eb", "#f9e1d2", "#f0bfa4", "#e69b78", "#dc7653", "#c75a34", "#ae4722", "#9d3c1c", "#8b3214", "#6e250e"],
        gray: ["#faf9f6", "#f7f5ee", "#e8e9df", "#d5d6cf", "#b9c1bc", "#869591", "#64736f", "#52636a", "#294552", "#172d3b"],
    },
    defaultRadius: "md",
    fontFamily: "system-ui, sans-serif",
    black: "#172d3b",
    fontSizes: {xs: "0.75rem", sm: "0.875rem", md: "0.9375rem", lg: "1rem", xl: "1.125rem"},
    lineHeights: {xs: "1.5", sm: "1.55", md: "1.55", lg: "1.5", xl: "1.4"},
    headings: {
        fontFamily: "Georgia, serif",
        fontWeight: "600",
        sizes: {
            h1: {fontSize: "2rem", lineHeight: "1.2"},
            h2: {fontSize: "1.7rem", lineHeight: "1.2"},
            h3: {fontSize: "1.25rem", lineHeight: "1.4"},
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
