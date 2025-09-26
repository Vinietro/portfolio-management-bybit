'use client';

import { useState, useEffect } from 'react';
import { Wallet, Settings, AlertCircle, Cloud, CloudOff } from 'lucide-react';
import CredentialsForm from './components/CredentialsForm';
import PortfolioTable from './components/PortfolioTable';
import CoinListTable from './components/CoinListTable';
import { BinanceCredentials, PortfolioItem } from './types';
import { syncManager } from './lib/sync';

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
  const [isOnline, setIsOnline] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [defaultCoinsLoading, setDefaultCoinsLoading] = useState(true);


  useEffect(() => {
    // Check online status
    const checkOnlineStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', checkOnlineStatus);
    window.addEventListener('offline', checkOnlineStatus);
    checkOnlineStatus();

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

    // Sync with cloud if online
    if (navigator.onLine) {
      syncFromCloud();
    }

    return () => {
      window.removeEventListener('online', checkOnlineStatus);
      window.removeEventListener('offline', checkOnlineStatus);
    };
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

  const syncFromCloud = async () => {
    setSyncStatus('syncing');
    try {
      // Sync credentials only - no portfolio syncing
      const credentialsResult = await syncManager.fetchCredentials();
      if (credentialsResult.success && credentialsResult.data) {
        setCredentials(credentialsResult.data as BinanceCredentials);
        localStorage.setItem('binanceCredentials', JSON.stringify(credentialsResult.data));
      }

      // Portfolio is always the global default - no cloud sync needed
      
      setSyncStatus('success');
    } catch (error) {
      console.error('Sync error:', error);
      setSyncStatus('error');
    }
  };

  const handleCredentialsSave = async (creds: BinanceCredentials) => {
    setCredentials(creds);
    localStorage.setItem('binanceCredentials', JSON.stringify(creds));
    setError(null);

    // Sync to cloud if online
    if (isOnline) {
      try {
        await syncManager.syncCredentials(creds as unknown as Record<string, unknown>);
      } catch (error) {
        console.error('Failed to sync credentials:', error);
      }
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
                      {/* Sync Status Indicator */}
                      <div className="flex items-center gap-2 ml-4">
                        {isOnline ? (
                          <div className="flex items-center gap-1 text-green-600">
                            {syncStatus === 'syncing' ? (
                              <>
                                <Cloud className="h-4 w-4 animate-pulse" />
                                <span className="text-xs">Syncing...</span>
                              </>
                            ) : syncStatus === 'success' ? (
                              <>
                                <Cloud className="h-4 w-4" />
                                <span className="text-xs">Synced</span>
                              </>
                            ) : (
                              <>
                                <Cloud className="h-4 w-4" />
                                <span className="text-xs">Online</span>
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-gray-500">
                            <CloudOff className="h-4 w-4" />
                            <span className="text-xs">Offline</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {credentials && (
                        <button
                          onClick={syncFromCloud}
                          disabled={!isOnline || syncStatus === 'syncing'}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
                          title="Sync with cloud"
                        >
                          <Cloud className="h-4 w-4" />
                          <span className="text-sm">Sync</span>
                        </button>
                      )}
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
                walletBalances={walletBalances}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
