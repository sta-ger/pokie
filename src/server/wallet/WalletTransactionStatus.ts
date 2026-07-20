// What WalletTransactionInspecting.getTransactionStatus() reports for one (sessionId, transactionId):
// "applied" — currently in effect (a debit/credit that hasn't been reversed); "reversed" — was applied,
// then reverse() compensated it; "absent" — this wallet has no record of that transactionId ever having
// been applied, whether because it never was or because this wallet has no memory of it at all (e.g. a
// process restart against a non-durable implementation).
export type WalletTransactionStatus = "applied" | "reversed" | "absent";
