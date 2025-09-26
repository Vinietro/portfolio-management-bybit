'use client';

import { useState, useEffect, useCallback } from 'react';
import { BinanceCredentials, PortfolioItem } from '../types';

interface PortfolioTableProps {
  credentials: BinanceCredentials;
  portfolio: PortfolioItem[];
  onPortfolioUpdate: (portfolio: PortfolioItem[]) => void;
  onCredentialsUpdate: (credentials: BinanceCredentials) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  onWalletBalancesUpdate?: (walletBalances: {
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
  }) => void;
}

export default function PortfolioTable({
  credentials,
  portfolio,
  onPortfolioUpdate,
  onCredentialsUpdate,
  setIsLoading,
  setError,
  onWalletBalancesUpdate
}: PortfolioTableProps) {
  const [totalBalance, setTotalBalance] = useState<number>(0);
  const [walletBalances, setWalletBalances] = useState<Record<string, Array<{
    asset: string;
    free: string;
    locked: string;
    usdValue: number;
    wallet: string;
    pnl?: number;
    pnlPercentage?: number;
  }>>>({
    spot: [],
    earn: []
  });
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  const [isRateLimited, setIsRateLimited] = useState<boolean>(false);

  const fetchBalances = useCallback(async () => {
    // Check if we're rate limited
    if (isRateLimited) {
      // Only check rate limiting cooldown if we've actually made a previous request
      if (lastFetchTime > 0) {
        const timeSinceLastFetch = Date.now() - lastFetchTime;
        if (timeSinceLastFetch < 60000) { // 1 minute cooldown
          return;
        } else {
          setIsRateLimited(false);
        }
      } else {
        setIsRateLimited(false);
      }
    }

    // Prevent too frequent requests (minimum 30 seconds between requests)
    // Only apply rate limiting if we've actually made a previous request
    if (lastFetchTime > 0) {
      const timeSinceLastFetch = Date.now() - lastFetchTime;
      if (timeSinceLastFetch < 30000) {
        return;
      }
    }

    setIsLoading(true);
    setError(null);
    setLastFetchTime(Date.now());

    try {
      const response = await fetch('/api/balances', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 429) {
          setIsRateLimited(true);
          setError(errorData.error || 'Rate limit exceeded. Please wait 1 minute before refreshing.');
          return;
        }
        throw new Error(errorData.error || 'Failed to fetch balances');
      }

      const data = await response.json();
      setTotalBalance(data.totalBalance);
      const newWalletBalances = data.walletBalances || { spot: [], earn: [] };
      setWalletBalances(newWalletBalances);
      
      // Notify parent component of wallet balances update
      if (onWalletBalancesUpdate) {
        onWalletBalancesUpdate(newWalletBalances);
      }
      
      // Update portfolio with current amounts
      const currentUsdtInEarn = data.walletBalances?.earn
        ?.filter((balance: { asset: string; usdValue: number }) => balance.asset === 'USDT')
        ?.reduce((sum: number, balance: { asset: string; usdValue: number }) => sum + balance.usdValue, 0) || 0;
      const availableBalance = data.totalBalance - currentUsdtInEarn;
      
      const updatedPortfolio = portfolio.map(item => {
        const currentAmount = data.balances[item.coin] || 0;
        const targetAmount = (availableBalance * item.targetPercent) / 100;
        const currentPercent = availableBalance > 0 ? (currentAmount / availableBalance) * 100 : 0;
        const difference = targetAmount - currentAmount;

        // Get PNL data for this coin from spot wallet
        const spotBalance = data.walletBalances?.spot?.find((b: { asset: string; pnl?: number; pnlPercentage?: number }) => b.asset === item.coin);
        const pnl = spotBalance?.pnl;
        const pnlPercentage = spotBalance?.pnlPercentage;

        return {
          ...item,
          currentAmount,
          targetAmount,
          currentPercent,
          difference,
          pnl,
          pnlPercentage
        };
      });

      onPortfolioUpdate(updatedPortfolio);
    } catch (error) {
      if (error instanceof Error && error.message.includes('rate limit')) {
        setIsRateLimited(true);
        setError('Rate limit exceeded. Please wait 1 minute before refreshing.');
      } else {
        setError('Failed to fetch portfolio data from Binance');
      }
    } finally {
      setIsLoading(false);
    }
  }, [setIsLoading, setError, credentials, portfolio, onPortfolioUpdate, isRateLimited, lastFetchTime, onWalletBalancesUpdate]);

  useEffect(() => {
    if (credentials) {
      fetchBalances();
    }
  }, [credentials, fetchBalances]);

  // Auto-refresh every 30 seconds when credentials are present
  useEffect(() => {
    if (!credentials) return;

    // Set up auto-refresh interval every 30 seconds
    const interval = setInterval(() => {
      // Don't auto-refresh if we're rate limited
      if (isRateLimited) {
        return;
      }
      
      // Don't auto-refresh if there's still an error preventing refresh
      const timeSinceLastFetch = Date.now() - lastFetchTime;
      if (lastFetchTime > 0 && timeSinceLastFetch < 30000) {
        return; // Still within 30-second cooldown, skip refresh
      }

      // Trigger refresh
      fetchBalances();
    }, 30000); // 30 seconds

    // Cleanup the interval when component unmounts or credentials change
    return () => clearInterval(interval);
  }, [credentials, isRateLimited, lastFetchTime, fetchBalances]);



  const getTotalTargetPercent = () => {
    const regularCoins = portfolio.filter(item => !item.isUsdtEarn);
    return regularCoins.reduce((sum, item) => sum + item.targetPercent, 0);
  };

  const getRemainingAllocation = () => {
    const usdtEarnPercent = credentials.usdtEarnTarget || 0;
    return Math.max(0, 100 - usdtEarnPercent);
  };

  const getUsdtEarnTargetAmount = () => {
    return (totalBalance * (credentials.usdtEarnTarget || 0)) / 100;
  };

  const getCurrentUsdtInEarn = () => {
    return walletBalances.earn
      .filter(balance => balance.asset === 'USDT')
      .reduce((sum, balance) => sum + balance.usdValue, 0);
  };

  const getUsdtEarnNeeded = () => {
    const targetAmount = getUsdtEarnTargetAmount();
    const currentUsdtInEarn = getCurrentUsdtInEarn();
    return Math.max(0, targetAmount - currentUsdtInEarn);
  };




  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num);
  };

  return (
    <div className="space-y-6">
      {/* Portfolio Overview and Earn Wallet Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left side - Portfolio Controls */}
        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Portfolio Overview</h3>
          <div className="space-y-3">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Total Balance: <span className="font-semibold text-green-600">{formatCurrency(totalBalance)}</span>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Available for Allocation: <span className="font-semibold text-blue-600">{formatCurrency(totalBalance - getCurrentUsdtInEarn())}</span>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Regular Allocation: <span className="font-semibold">{getTotalTargetPercent().toFixed(1)}%</span>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
              <span>USDT Earn:</span>
              <input
                type="number"
                value={credentials.usdtEarnTarget || ''}
                onChange={(e) => {
                  const value = parseFloat(e.target.value) || 0;
                  if (value >= 0 && value <= 100) {
                    const updatedCredentials = { ...credentials, usdtEarnTarget: value };
                    localStorage.setItem('binanceCredentials', JSON.stringify(updatedCredentials));
                    onCredentialsUpdate(updatedCredentials);
                  }
                }}
                className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0"
                step="0.1"
                min="0"
                max="100"
              />
              <span className="text-gray-500">%</span>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Remaining: <span className="font-semibold text-purple-600">{getRemainingAllocation().toFixed(1)}%</span>
            </div>
            {credentials.usdtEarnTarget && (
              <div className="text-sm text-gray-600 dark:text-gray-400">
                USDT Needed: <span className={`font-semibold ${getUsdtEarnNeeded() > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCurrency(getUsdtEarnNeeded())}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right side - Earn Wallet */}
        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-900 dark:text-white">Earn Wallet</h3>
            {credentials.usdtEarnTarget && (
              <button
                onClick={() => {
                  const newTarget = prompt('Enter new USDT Earn target (%):', credentials.usdtEarnTarget?.toString() || '0');
                  if (newTarget !== null) {
                    const targetValue = parseFloat(newTarget);
                    if (!isNaN(targetValue) && targetValue >= 0 && targetValue <= 100) {
                      const updatedCredentials = { ...credentials, usdtEarnTarget: targetValue };
                      localStorage.setItem('binanceCredentials', JSON.stringify(updatedCredentials));
                      onCredentialsUpdate(updatedCredentials);
                    } else {
                      alert('Please enter a valid percentage between 0 and 100');
                    }
                  }
                }}
                className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
              >
                Edit Target
              </button>
            )}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {walletBalances.earn.length > 0 ? (
              <div className="space-y-1">
                {walletBalances.earn.map((balance, index) => (
                  <div key={index} className="flex justify-between">
                    <span>{balance.asset}</span>
                    <span className="font-medium">{formatCurrency(balance.usdValue)}</span>
                  </div>
                ))}
                {/* Show USDT Earn target and difference */}
                {credentials.usdtEarnTarget && (
                  <>
                    <div className="border-t border-gray-200 dark:border-gray-600 pt-2 mt-2">
                      <div className="flex justify-between text-xs">
                        <span>Target %:</span>
                        <span className="font-medium">{credentials.usdtEarnTarget.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span>Target Amount:</span>
                        <span className="font-medium">{formatCurrency(getUsdtEarnTargetAmount())}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span>Current USDT:</span>
                        <span className="font-medium">
                          {formatCurrency(walletBalances.earn.filter(b => b.asset === 'USDT').reduce((sum, b) => sum + b.usdValue, 0))}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span>Current USDT %:</span>
                        <span className="font-medium">
                          {totalBalance > 0 ? ((walletBalances.earn.filter(b => b.asset === 'USDT').reduce((sum, b) => sum + b.usdValue, 0) / totalBalance) * 100).toFixed(1) : '0.0'}%
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span>USDT Difference:</span>
                        <span className={`font-medium ${
                          walletBalances.earn.filter(b => b.asset === 'USDT').reduce((sum, b) => sum + b.usdValue, 0) - getUsdtEarnTargetAmount() >= 0
                            ? 'text-green-600' 
                            : 'text-red-600'
                        }`}>
                          {formatCurrency(
                            walletBalances.earn.filter(b => b.asset === 'USDT').reduce((sum, b) => sum + b.usdValue, 0) - getUsdtEarnTargetAmount()
                          )}
                        </span>
                      </div>
                      <div className={`flex justify-between text-xs p-2 rounded ${
                        getUsdtEarnNeeded() > 0 ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                      }`}>
                        <span className="font-medium">USDT Needed:</span>
                        <span className={`font-bold ${
                          getUsdtEarnNeeded() > 0 ? 'text-red-600' : 'text-green-600'
                        }`}>
                          {formatCurrency(getUsdtEarnNeeded())}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <span className="text-gray-400">No balances</span>
                {credentials.usdtEarnTarget && (
                  <div className="border-t border-gray-200 dark:border-gray-600 pt-2 mt-2">
                    <div className="flex justify-between text-xs">
                      <span>Target %:</span>
                      <span className="font-medium">{credentials.usdtEarnTarget.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span>Target Amount:</span>
                      <span className="font-medium">{formatCurrency(getUsdtEarnTargetAmount())}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span>Current USDT:</span>
                      <span className="font-medium">{formatCurrency(0)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span>Current USDT %:</span>
                      <span className="font-medium">0.0%</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span>USDT Difference:</span>
                      <span className="text-red-600 font-medium">
                        {formatCurrency(-getUsdtEarnTargetAmount())}
                      </span>
                    </div>
                      <div className="flex justify-between text-xs p-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                        <span className="font-medium">USDT Needed:</span>
                        <span className="text-red-600 font-bold">
                          {formatCurrency(getUsdtEarnTargetAmount())}
                        </span>
                      </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
} 