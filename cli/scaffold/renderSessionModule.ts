export function renderSessionModule(className: string): string {
    return `import {VideoSlotConfig, VideoSlotSession} from "pokie";

export function create${className}Session(): VideoSlotSession {
    const config = new VideoSlotConfig();
    return new VideoSlotSession(config);
}
`;
}
