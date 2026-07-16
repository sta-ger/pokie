import {ModalsProvider} from "@mantine/modals";
import {Notifications} from "@mantine/notifications";
import {StudioApiProvider} from "./context/StudioApiProvider";
import {StudioRoutes} from "./routes";

export function App() {
    return (
        <StudioApiProvider>
            <ModalsProvider>
                <Notifications />
                <StudioRoutes />
            </ModalsProvider>
        </StudioApiProvider>
    );
}
