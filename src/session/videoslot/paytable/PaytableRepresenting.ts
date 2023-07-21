import {
    AvailableBetsDescribing,
    BuildableFromMap,
    ConvertableToMap,
    PaytableSymbolsPayoutsDescribing,
    PaytableSymbolsPayoutsSetting,
} from "pokie";

export interface PaytableRepresenting
    extends ConvertableToMap<number, Record<string, Record<number, number>>>,
        BuildableFromMap<number, Record<string, Record<number, number>>>,
        AvailableBetsDescribing,
        PaytableSymbolsPayoutsDescribing,
        PaytableSymbolsPayoutsSetting {}
