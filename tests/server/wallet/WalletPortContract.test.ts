import {InMemoryWallet} from "../../../src/server/wallet/InMemoryWallet.js";
import {walletPortContractTests} from "../../../src/server/wallet/walletPortContractTests.js";

walletPortContractTests("InMemoryWallet", () => new InMemoryWallet());
