export interface BinanceCredentials {
  apiKey: string;
  secretKey: string;
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
  positionStatus?: 'open' | 'closed' | 'unknown';
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
