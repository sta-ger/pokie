// Tone axis of a generated name -- contributes the adjective(s), independent of `SlotGameNameTheme`
// (which contributes the noun). See SlotGameNameGenerator for how the two combine.
export type SlotGameNameStyle = "classic" | "bold" | "elegant" | "playful";

export const ALL_SLOT_GAME_NAME_STYLES: readonly SlotGameNameStyle[] = ["classic", "bold", "elegant", "playful"];
