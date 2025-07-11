export interface BinanceCredentials {
  apiKey: string;
  secretKey: string;
  futuresWalletTarget?: number; // Target percentage for futures wallet (0-100)
  usdcEarnTarget?: number; // Target percentage for USDC in Earn wallet (0-100)
}

export interface PortfolioItem {
  id: string;
  coin: string;
  targetPercent: number;
  currentAmount?: number;
  targetAmount?: number;
  currentPercent?: number;
  difference?: number;
  isUsdcEarn?: boolean; // Flag to identify USDC Earn allocation
}

export interface BinanceBalance {
  asset: string;
  free: string;
  locked: string;
}

export interface BinanceEarnBalance {
  asset: string;
  totalAmount: string;
  tierAnnualPercentageRate: string;
  latestAnnualPercentageRate: string;
  yesterdayRealTimeRewards: string;
  totalBonusRewards: string;
  totalRealTimeRewards: string;
  totalRewards: string;
}

export interface BinanceFuturesBalance {
  accountAlias: string;
  asset: string;
  balance: string;
  crossWalletBalance: string;
  crossUnPnl: string;
  availableBalance: string;
  maxWithdrawAmount: string;
}

export interface WalletBalance {
  asset: string;
  free: string;
  locked: string;
  usdValue: number;
  wallet: string;
} 