export interface BinanceCredentials {
  apiKey: string;
  secretKey: string;
  futuresWalletTarget?: number; // Target percentage for futures wallet (0-100)
  usdtEarnTarget?: number; // Target percentage for USDT in Earn wallet (0-100)
}

export interface PortfolioItem {
  id: string;
  coin: string;
  targetPercent: number;
  currentAmount?: number;
  targetAmount?: number;
  currentPercent?: number;
  difference?: number;
  pnl?: number;
  pnlPercentage?: number;
  isUsdtEarn?: boolean; // Flag to identify USDT Earn allocation
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

export interface PnlData {
  asset: string;
  totalQuantity: number;
  averagePrice: number;
  currentPrice: number;
  totalValue: number;
  totalCost: number;
  pnl: number;
  pnlPercentage: number;
}

export interface FuturesPosition {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  markPrice: string;
  unRealizedProfit: string;
  liquidationPrice: string;
  leverage: string;
  marginType: string;
  isolatedMargin: string;
  isAutoAddMargin: string;
  positionSide: string;
  notional: string;
  isolatedWallet: string;
  updateTime: number;
  isolated: boolean;
  adlQuantile: number;
  side: 'LONG' | 'SHORT';
  size: number;
  entryValue: number;
  currentValue: number;
  pnl: number;
  pnlPercentage: number;
  roe: number;
} 