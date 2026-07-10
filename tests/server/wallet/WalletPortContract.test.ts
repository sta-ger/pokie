import {InMemoryWallet, walletPortContractTests} from "pokie";

walletPortContractTests("InMemoryWallet", () => new InMemoryWallet());
