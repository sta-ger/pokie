import type {SlotGameNameStyle} from "./SlotGameNameStyle.js";
import type {SlotGameNameTheme} from "./SlotGameNameTheme.js";
import type {SlotGameNameVocabulary} from "./SlotGameNameVocabulary.js";

// Every field is optional -- omit all of them for a fully random, themed 2-3 word name; supply any
// subset to steer the pick without losing determinism for whatever you leave to `seed`.
export type SlotGameNameRequest = {
    seed?: number;
    theme?: SlotGameNameTheme;
    style?: SlotGameNameStyle;
    wordCount?: 2 | 3;
    // Case-insensitive title matches this call must never produce -- e.g. names already taken.
    exclusions?: readonly string[];
    // Fully replaces the resolved theme/style word pools when given (see SlotGameNameVocabulary).
    vocabulary?: SlotGameNameVocabulary;
};
