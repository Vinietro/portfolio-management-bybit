export interface BinanceCredentials {
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
}

export interface BinanceBalance {
  asset: string;
  free: string;
  locked: string;
} 