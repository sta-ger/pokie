import {createTheme} from "@mantine/core";

// Deliberately close to Mantine's own defaults -- the current app has no branding of its own (see
// style.css's own doc note: no color palette beyond `color-scheme: light dark`), so this is a toolchain
// foundation, not a visual redesign (requirement 8).
export const theme = createTheme({
    primaryColor: "blue",
    defaultRadius: "sm",
});
