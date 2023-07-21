export interface ConvertableToMap<A extends string | number | symbol, B = string> {
    toMap(): Record<A, B>;
}
