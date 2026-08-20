export const CLIENT_PRODUCT_NAME = "POKIE client";

export function describeClientGameTitle(gameName: string): string {
    return `${gameName} — ${CLIENT_PRODUCT_NAME}`;
}
