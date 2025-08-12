'use client';

import { useState, useEffect } from 'react';
import { Wallet, Settings, RefreshCw, AlertCircle } from 'lucide-react';
import CredentialsForm from './components/CredentialsForm';
import PortfolioTable from './components/PortfolioTable';
import CoinListTable from './components/CoinListTable';
import FuturesPositionsTable from './components/FuturesPositionsTable';
import { BinanceCredentials, PortfolioItem } from './types';

export default function Home() {
  const [credentials, setCredentials] = useState<BinanceCredentials | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load saved credentials and portfolio from localStorage
    const savedCredentials = localStorage.getItem('binanceCredentials');
    const savedPortfolio = localStorage.getItem('portfolio');
    
    if (savedCredentials) {
      const parsedCredentials = JSON.parse(savedCredentials);
      // Ensure backward compatibility with existing saved credentials
      setCredentials({
        apiKey: parsedCredentials.apiKey,
        secretKey: parsedCredentials.secretKey,
        futuresWalletTarget: parsedCredentials.futuresWalletTarget,
        usdcEarnTarget: parsedCredentials.usdcEarnTarget
      });
    }
    
    if (savedPortfolio) {
      setPortfolio(JSON.parse(savedPortfolio));
    }
  }, []);

  const handleCredentialsSave = (creds: BinanceCredentials) => {
    setCredentials(creds);
    localStorage.setItem('binanceCredentials', JSON.stringify(creds));
    setError(null);
  };

  const handlePortfolioUpdate = (newPortfolio: PortfolioItem[]) => {
    setPortfolio(newPortfolio);
    localStorage.setItem('portfolio', JSON.stringify(newPortfolio));
  };

  const handleRefresh = async () => {
    if (!credentials) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // This will be handled by the PortfolioTable component
      // We just need to trigger a re-render
      setPortfolio([...portfolio]);
    } catch {
      setError('Failed to refresh portfolio data');
    } finally {
      setIsLoading(false);
    }
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
            {credentials && (
              <button
                onClick={handleRefresh}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            )}
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
                setIsLoading={setIsLoading}
                setError={setError}
              />
            </div>
            
            {/* Coin List and Futures Positions Side by Side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CoinListTable
                portfolio={portfolio}
                onPortfolioUpdate={handlePortfolioUpdate}
              />
              
              <FuturesPositionsTable
                credentials={credentials}
                setIsLoading={setIsLoading}
                setError={setError}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
