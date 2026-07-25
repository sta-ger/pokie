// Word pool a `SlotGameNamePattern` draws from. Supplying one on `SlotGameNameRequest` fully replaces
// the theme/style pools `SlotGameNameGenerator` would otherwise resolve -- the only way to guarantee
// every generated word comes from a caller-supplied list.
export interface SlotGameNameVocabulary {
    readonly adjectives: readonly string[];
    readonly nouns: readonly string[];
}
