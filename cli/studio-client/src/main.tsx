import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./global.css";
import {MantineProvider} from "@mantine/core";
import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import {App} from "./App";
import {theme} from "./theme";

const container = document.getElementById("root");
if (container === null) {
    throw new Error("#root element not found");
}

createRoot(container).render(
    <StrictMode>
        <MantineProvider theme={theme} defaultColorScheme="auto">
            <App />
        </MantineProvider>
    </StrictMode>,
);
