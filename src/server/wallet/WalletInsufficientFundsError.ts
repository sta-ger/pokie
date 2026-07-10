// Thrown by WalletPort.debit() when `amount` exceeds the current balance for `sessionId`. Not
// required by the WalletPort contract itself (a custom implementation may throw its own error
// type instead) — InMemoryWallet's own debit() throws this one.
export class WalletInsufficientFundsError extends Error {
    private readonly sessionId: string;
    private readonly amount: number;
    private readonly balance: number;

    constructor(sessionId: string, amount: number, balance: number) {
        super(`Cannot debit ${amount} for session "${sessionId}": balance is only ${balance}.`);
        this.sessionId = sessionId;
        this.amount = amount;
        this.balance = balance;
    }

    public getSessionId(): string {
        return this.sessionId;
    }

    public getAmount(): number {
        return this.amount;
    }

    public getBalance(): number {
        return this.balance;
    }
}
