export interface BuildableFromMap<A extends string | number | symbol, B = string> {
    fromMap(value: Record<A, B>): this;
}
