export interface BingXCredentials {
  apiKey: string;
  secretKey: string;
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
  positionStatus?: 'open' | 'closed' | 'unknown';
}

export interface BingXBalance {
  asset: string;
  free: string;
  locked: string;
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
