/**
 * Tradovate API Client
 *
 * Connects to Tradovate to fetch executed trades for prop firm accounts.
 * Supports both demo and live environments.
 */

// Tradovate API endpoints
const TRADOVATE_API = {
  demo: 'https://demo.tradovateapi.com/v1',
  live: 'https://live.tradovateapi.com/v1',
};

const TRADOVATE_AUTH = {
  demo: 'https://demo.tradovateapi.com/v1/auth/accesstokenrequest',
  live: 'https://live.tradovateapi.com/v1/auth/accesstokenrequest',
};

export interface TradovateCredentials {
  name: string;
  username: string;
  password: string;
  appId?: string;
  appVersion?: string;
  cid?: number; // Client ID for API access
  sec?: string; // Secret for API access
  deviceId?: string;
  environment: 'demo' | 'live';
}

export interface TradovateToken {
  accessToken: string;
  expirationTime: string;
  userId: number;
  userStatus: string;
  name: string;
}

export interface TradovateAccount {
  id: number;
  name: string;
  userId: number;
  accountType: string;
  active: boolean;
  clearingHouseId: number;
  riskCategoryId: number;
  autoLiqProfileId: number;
  marginAccountType: string;
  legalStatus: string;
  timestamp: string;
}

export interface TradovateFill {
  id: number;
  orderId: number;
  contractId: number;
  timestamp: string;
  tradeDate: { year: number; month: number; day: number };
  action: 'Buy' | 'Sell';
  qty: number;
  price: number;
  active: boolean;
  finallyPaired: number;
}

export interface TradovateOrder {
  id: number;
  accountId: number;
  contractId: number;
  timestamp: string;
  action: 'Buy' | 'Sell';
  ordStatus: string;
  executionProviderId: number;
  ocoId?: number;
  parentId?: number;
  linkedId?: number;
  admin: boolean;
}

export interface TradovatePosition {
  id: number;
  accountId: number;
  contractId: number;
  timestamp: string;
  tradeDate: { year: number; month: number; day: number };
  netPos: number;
  netPrice: number;
  bought: number;
  boughtValue: number;
  sold: number;
  soldValue: number;
  prevPos: number;
  prevPrice: number;
}

export interface TradovateContract {
  id: number;
  name: string;
  contractMaturityId: number;
  status: string;
  providerTickSize: number;
}

export interface TradovateTrade {
  // Parsed trade ready for import
  timestamp: string;
  instrument: string;
  direction: 'long' | 'short';
  entry_price: number;
  exit_price?: number;
  contracts: number;
  pnl?: number;
  commission?: number;
  status: 'open' | 'closed';
  tradovate_fill_id: number;
  tradovate_order_id: number;
  tradovate_account_id: number;
}

class TradovateClient {
  private credentials: TradovateCredentials;
  private token: TradovateToken | null = null;
  private baseUrl: string;

  constructor(credentials: TradovateCredentials) {
    this.credentials = credentials;
    this.baseUrl = TRADOVATE_API[credentials.environment];
  }

  /**
   * Authenticate with Tradovate and get access token
   */
  async authenticate(): Promise<TradovateToken> {
    const authUrl = TRADOVATE_AUTH[this.credentials.environment];

    const body: Record<string, string | number | undefined> = {
      name: this.credentials.username,
      password: this.credentials.password,
      appId: this.credentials.appId || 'PropTracker',
      appVersion: this.credentials.appVersion || '1.0',
      deviceId: this.credentials.deviceId || crypto.randomUUID(),
    };

    // Add API credentials if provided (for programmatic access)
    if (this.credentials.cid && this.credentials.sec) {
      body.cid = this.credentials.cid;
      body.sec = this.credentials.sec;
    }

    const response = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Tradovate auth failed: ${error}`);
    }

    this.token = await response.json();
    return this.token!;
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    if (!this.token) {
      await this.authenticate();
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token!.accessToken}`,
        ...options?.headers,
      },
    });

    if (response.status === 401) {
      // Token expired, re-authenticate
      await this.authenticate();
      return this.request(endpoint, options);
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Tradovate API error: ${error}`);
    }

    return response.json();
  }

  /**
   * Get all accounts for this user
   */
  async getAccounts(): Promise<TradovateAccount[]> {
    return this.request<TradovateAccount[]>('/account/list');
  }

  /**
   * Get fills (executed trades) for an account
   */
  async getFills(accountId: number): Promise<TradovateFill[]> {
    return this.request<TradovateFill[]>(`/fill/ldeps?masterid=${accountId}`);
  }

  /**
   * Get orders for an account
   */
  async getOrders(accountId: number): Promise<TradovateOrder[]> {
    return this.request<TradovateOrder[]>(`/order/ldeps?masterid=${accountId}`);
  }

  /**
   * Get current positions for an account
   */
  async getPositions(accountId: number): Promise<TradovatePosition[]> {
    return this.request<TradovatePosition[]>(`/position/ldeps?masterid=${accountId}`);
  }

  /**
   * Get contract details by ID
   */
  async getContract(contractId: number): Promise<TradovateContract> {
    return this.request<TradovateContract>(`/contract/item?id=${contractId}`);
  }

  /**
   * Get multiple contracts by IDs
   */
  async getContracts(contractIds: number[]): Promise<TradovateContract[]> {
    return this.request<TradovateContract[]>('/contract/items', {
      method: 'POST',
      body: JSON.stringify(contractIds),
    });
  }

  /**
   * Get cash balance for account
   */
  async getCashBalance(accountId: number): Promise<{ cashBalance: number; realizedPnL: number }> {
    const result = await this.request<{
      cashBalance: number;
      realizedPnL: number;
    }>(`/cashBalance/getcashbalancesnapshot`, {
      method: 'POST',
      body: JSON.stringify({ accountId }),
    });
    return result;
  }

  /**
   * Fetch and parse all trades for an account since a given date
   */
  async fetchTrades(accountId: number, sinceDate?: Date): Promise<TradovateTrade[]> {
    const [fills, orders] = await Promise.all([
      this.getFills(accountId),
      this.getOrders(accountId),
    ]);

    // Get unique contract IDs
    const contractIds = [...new Set(fills.map(f => f.contractId))];
    const contracts = contractIds.length > 0
      ? await this.getContracts(contractIds)
      : [];

    const contractMap = new Map(contracts.map(c => [c.id, c]));
    const orderMap = new Map(orders.map(o => [o.id, o]));

    // Filter by date if provided
    const filteredFills = sinceDate
      ? fills.filter(f => new Date(f.timestamp) >= sinceDate)
      : fills;

    // Convert fills to trades
    return filteredFills.map(fill => {
      const contract = contractMap.get(fill.contractId);
      const order = orderMap.get(fill.orderId);

      // Parse instrument from contract name (e.g., "MNQH5" -> "MNQ")
      const instrument = contract?.name?.replace(/[A-Z]\d+$/, '') || 'UNKNOWN';

      return {
        timestamp: fill.timestamp,
        instrument,
        direction: fill.action === 'Buy' ? 'long' : 'short',
        entry_price: fill.price,
        contracts: fill.qty,
        status: 'closed' as const, // Fills are always executed
        tradovate_fill_id: fill.id,
        tradovate_order_id: fill.orderId,
        tradovate_account_id: accountId,
      };
    });
  }
}

/**
 * Create a new Tradovate client instance
 */
export function createTradovateClient(credentials: TradovateCredentials): TradovateClient {
  return new TradovateClient(credentials);
}

/**
 * Test connection to Tradovate with given credentials
 */
export async function testTradovateConnection(
  credentials: TradovateCredentials
): Promise<{ success: boolean; accounts?: TradovateAccount[]; error?: string }> {
  try {
    const client = createTradovateClient(credentials);
    await client.authenticate();
    const accounts = await client.getAccounts();
    return { success: true, accounts };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Map contract name to standard instrument symbol
 */
export function parseInstrumentFromContract(contractName: string): string {
  // Remove expiration suffix (e.g., "MNQH5" -> "MNQ", "MESH5" -> "MES")
  const base = contractName.replace(/[A-Z]\d+$/, '');

  // Map common futures to standard names
  const mapping: Record<string, string> = {
    'MNQ': 'MNQ',
    'NQ': 'NQ',
    'MES': 'MES',
    'ES': 'ES',
    'M2K': 'M2K',
    'RTY': 'RTY',
    'MYM': 'MYM',
    'YM': 'YM',
    'MGC': 'MGC',
    'GC': 'GC',
    'MCL': 'MCL',
    'CL': 'CL',
    'ZN': 'ZN',
    'ZB': 'ZB',
    '6E': '6E',
    '6J': '6J',
  };

  return mapping[base] || base;
}

export default TradovateClient;
