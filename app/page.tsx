'use client';

import { useState, useEffect } from 'react';
import { Wallet, Settings, AlertCircle } from 'lucide-react';
import CredentialsForm from './components/CredentialsForm';
import PortfolioTable from './components/PortfolioTable';
import CoinListTable from './components/CoinListTable';
import { BinanceCredentials, PortfolioItem } from './types';
import { SyncManager } from './lib/sync';

export default function Home() {
  const [credentials, setCredentials] = useState<BinanceCredentials | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletBalances, setWalletBalances] = useState<{
    spot: Array<{
      asset: string;
      free: string;
      locked: string;
      usdValue: number;
      wallet: string;
      pnl?: number;
      pnlPercentage?: number;
    }>;
    earn: Array<{
      asset: string;
      free: string;
      locked: string;
      usdValue: number;
      wallet: string;
    }>;
  }>({ spot: [], earn: [] });
  const [, setDefaultCoinsLoading] = useState(true);


  useEffect(() => {
    // Load credentials from localStorage
    const savedCredentials = localStorage.getItem('binanceCredentials');
    
    if (savedCredentials) {
      const parsedCredentials = JSON.parse(savedCredentials);
      setCredentials({
        apiKey: parsedCredentials.apiKey,
        secretKey: parsedCredentials.secretKey,
        usdtEarnTarget: parsedCredentials.usdtEarnTarget || parsedCredentials.usdcEarnTarget
      });
    }
    
    // Always load default portfolio - never use user-specific portfolios
    loadDefaultCoins().catch(error => {
      console.error('Default coins loading failed:', error);
    });
  }, []);

  const loadDefaultCoins = async () => {
    try {
      setDefaultCoinsLoading(true);
      const response = await fetch('/api/default-coins');
      const data = await response.json();
      
      if (response.ok && data?.coins?.length && data.coins.length > 0) {
        // Create portfolio items from default coins data
        const defaultPortfolioItems: PortfolioItem[] = data.coins.map((coinData: { coin: string; targetPercent: number }) => ({
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          coin: coinData.coin.trim(),
          targetPercent: coinData.targetPercent
        }));
        
        setPortfolio(defaultPortfolioItems);
      } else {
        console.error('Failed to load default coins:', data);
      }
    } catch (error) {
      console.error('Failed to load default coins:', error);
    } finally {
      setDefaultCoinsLoading(false);
    }
  };


  const handleCredentialsSave = async (creds: BinanceCredentials) => {
    // Save to localStorage first  
    setCredentials(creds);
    localStorage.setItem('binanceCredentials', JSON.stringify(creds));
    setError(null);
    
    // Save to database in background (non-blocking)
    try {
      const syncManager = new SyncManager();
      const syncResult = await syncManager.syncCredentials(creds as unknown as Record<string, unknown>);
      
      if (!syncResult.success) {
        console.error('Failed to sync credentials to database:', syncResult.error);
        // This is logged but doesn't prevent successful login
      } else {
        console.log('Credentials synced to database successfully');
      }
    } catch (error) {
      console.error('Error syncing credentials to database:', error);
      // Failed database sync doesn't prevent successful login
    }
  };

  const handlePortfolioUpdate = async (newPortfolio: PortfolioItem[]) => {
    // Accept valid portfolio calculations 
    if (newPortfolio && Array.isArray(newPortfolio) && newPortfolio.length > 0) {
      setPortfolio(newPortfolio);
    }
  };

  const handleWalletBalancesUpdate = (newWalletBalances: typeof walletBalances) => {
    setWalletBalances(newWalletBalances);
  };

  const handleDisconnect = () => {
    setCredentials(null);
    localStorage.removeItem('binanceCredentials');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="px-4 py-8 w-full">
                <header className="mb-8">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Wallet className="h-8 w-8 text-blue-600" />
                      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                        Portfolio Manager
                      </h1>
                    </div>
                  </div>
                </header>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle className="h-5 w-5" />
            {error}
          </div>
        )}

        {!credentials ? (
          <div className="max-w-md mx-auto">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
              <div className="flex items-center gap-3 mb-6">
                <Settings className="h-6 w-6 text-blue-600" />
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Binance API Setup
                </h2>
              </div>
              <CredentialsForm onSave={handleCredentialsSave} />
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Portfolio Overview Card */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Portfolio Overview
                </h2>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Connected to Binance
                </div>
              </div>
              <PortfolioTable
                credentials={credentials}
                portfolio={portfolio}
                onPortfolioUpdate={handlePortfolioUpdate}
                onCredentialsUpdate={handleCredentialsSave}
                isLoading={isLoading}
                setIsLoading={setIsLoading}
                setError={setError}
                onWalletBalancesUpdate={handleWalletBalancesUpdate}
              />
            </div>
            
            {/* Coin List */}
            <div className="grid grid-cols-1 gap-6">
              <CoinListTable
                credentials={credentials}
                portfolio={portfolio}
                setIsLoading={setIsLoading}
                setError={setError}
                onDisconnect={handleDisconnect}
                walletBalances={walletBalances}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
