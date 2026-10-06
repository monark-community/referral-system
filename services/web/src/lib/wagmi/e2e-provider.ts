import {
  createWalletClient,
  custom,
  getAddress,
  hexToNumber,
  type Address,
  type Hex,
} from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { hardhat } from 'wagmi/chains';

const HARDHAT_MNEMONIC = 'test test test test test test test test test test test junk';
const ACCOUNT_INDEX_KEY = 'reffinity:e2e-wallet-index';
const REJECT_METHOD_KEY = 'reffinity:e2e-wallet-reject-method';

type Listener = (...args: unknown[]) => void;
type WalletCall = {
  method: string;
  params?: unknown;
  result?: unknown;
  error?: { code?: number; message: string };
};

declare global {
  interface Window {
    __REFFINITY_E2E_WALLET__?: {
      calls: WalletCall[];
      clear(): void;
      request(args: { method: string; params?: unknown }): Promise<unknown>;
    };
  }
}

function selectedAccount() {
  const rawIndex = window.localStorage.getItem(ACCOUNT_INDEX_KEY) ?? '0';
  const addressIndex = Number.parseInt(rawIndex, 10);
  if (!Number.isInteger(addressIndex) || addressIndex < 0 || addressIndex > 19) {
    throw new Error(`Invalid E2E wallet account index: ${rawIndex}`);
  }
  return mnemonicToAccount(HARDHAT_MNEMONIC, { addressIndex });
}

function userRejectedError(method: string) {
  return Object.assign(new Error(`User rejected ${method}`), { code: 4001 });
}

class DeterministicE2EProvider {
  private readonly listeners = new Map<string, Set<Listener>>();
  private chainId = hardhat.id;
  private readonly rpcUrl: string;

  constructor(rpcUrl: string) {
    this.rpcUrl = rpcUrl;
    window.__REFFINITY_E2E_WALLET__ = {
      calls: [],
      clear: () => {
        if (window.__REFFINITY_E2E_WALLET__) window.__REFFINITY_E2E_WALLET__.calls = [];
      },
      request: (args) => this.request(args),
    };
  }

  on(event: string, listener: Listener) {
    const listeners = this.listeners.get(event) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  removeListener(event: string, listener: Listener) {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  private emit(event: string, ...args: unknown[]) {
    this.listeners.get(event)?.forEach((listener) => listener(...args));
  }

  private record(call: WalletCall) {
    window.__REFFINITY_E2E_WALLET__?.calls.push(call);
  }

  private async rpc(method: string, params: unknown[] = []) {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    });
    const payload = await response.json();
    if (!response.ok || payload.error) {
      throw Object.assign(new Error(payload.error?.message ?? `RPC ${response.status}`), payload.error);
    }
    return payload.result;
  }

  async request({ method, params }: { method: string; params?: unknown }): Promise<any> {
    const call: WalletCall = { method, params };
    try {
      if (window.localStorage.getItem(REJECT_METHOD_KEY) === method) {
        throw userRejectedError(method);
      }

      const account = selectedAccount();
      const rpcParams = Array.isArray(params) ? params : [];
      let result: unknown;

      switch (method) {
        case 'eth_accounts':
        case 'eth_requestAccounts':
          result = [getAddress(account.address)];
          break;
        case 'wallet_requestPermissions':
          result = [{ parentCapability: 'eth_accounts', caveats: [{ type: 'restrictReturnedAccounts', value: [getAddress(account.address)] }] }];
          break;
        case 'wallet_getPermissions':
          result = [{ parentCapability: 'eth_accounts' }];
          break;
        case 'eth_chainId':
          result = `0x${this.chainId.toString(16)}`;
          break;
        case 'net_version':
          result = String(this.chainId);
          break;
        case 'wallet_switchEthereumChain': {
          const requested = hexToNumber((rpcParams[0] as { chainId: Hex }).chainId);
          if (requested !== hardhat.id) {
            throw Object.assign(new Error(`Unrecognized chain ${requested}`), { code: 4902 });
          }
          this.chainId = requested;
          result = null;
          this.emit('chainChanged', `0x${requested.toString(16)}`);
          break;
        }
        case 'wallet_addEthereumChain':
          result = null;
          break;
        case 'personal_sign': {
          const message = rpcParams.find((value) => typeof value === 'string' && value.toLowerCase() !== account.address.toLowerCase()) as Hex;
          result = await account.signMessage({ message: { raw: message } });
          break;
        }
        case 'eth_signTypedData_v4': {
          const typedData = JSON.parse(rpcParams[1] as string);
          result = await account.signTypedData(typedData);
          break;
        }
        case 'eth_sendTransaction': {
          const transaction = rpcParams[0] as Record<string, Hex | Address | undefined>;
          const walletClient = createWalletClient({ account, chain: hardhat, transport: custom(this) });
          result = await walletClient.sendTransaction({
            account,
            chain: hardhat,
            to: transaction.to as Address | undefined,
            data: transaction.data,
            value: transaction.value ? BigInt(transaction.value) : undefined,
            gas: transaction.gas ? BigInt(transaction.gas) : undefined,
            gasPrice: transaction.gasPrice ? BigInt(transaction.gasPrice) : undefined,
            maxFeePerGas: transaction.maxFeePerGas ? BigInt(transaction.maxFeePerGas) : undefined,
            maxPriorityFeePerGas: transaction.maxPriorityFeePerGas ? BigInt(transaction.maxPriorityFeePerGas) : undefined,
            nonce: transaction.nonce ? Number(BigInt(transaction.nonce)) : undefined,
          } as any);
          break;
        }
        default:
          result = await this.rpc(method, rpcParams);
      }

      call.result = result;
      this.record(call);
      return result;
    } catch (error) {
      const rpcError = error as Error & { code?: number };
      call.error = { code: rpcError.code, message: rpcError.message };
      this.record(call);
      throw error;
    }
  }
}

let provider: DeterministicE2EProvider | undefined;

export function getE2EProvider(rpcUrl: string) {
  if (typeof window === 'undefined') return undefined;
  provider ??= new DeterministicE2EProvider(rpcUrl);
  return provider;
}
