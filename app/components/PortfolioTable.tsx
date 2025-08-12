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
}

export default function PortfolioTable({
  credentials,
  portfolio,
  onPortfolioUpdate,
  onCredentialsUpdate,
  setIsLoading,
  setError
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
    earn: [],
    futures: []
  });
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  const [isRateLimited, setIsRateLimited] = useState<boolean>(false);

  const fetchBalances = useCallback(async () => {
    // Check if we're rate limited
    if (isRateLimited) {
      const timeSinceLastFetch = Date.now() - lastFetchTime;
      if (timeSinceLastFetch < 60000) { // 1 minute cooldown
        const remainingTime = Math.ceil((60000 - timeSinceLastFetch) / 1000);
        setError(`Rate limited. Please wait ${remainingTime} seconds before refreshing.`);
        return;
      } else {
        setIsRateLimited(false);
      }
    }

    // Prevent too frequent requests (minimum 30 seconds between requests)
    const timeSinceLastFetch = Date.now() - lastFetchTime;
    if (timeSinceLastFetch < 30000) {
      const remainingTime = Math.ceil((30000 - timeSinceLastFetch) / 1000);
      setError(`Please wait at least 30 seconds between refreshes. ${remainingTime} seconds remaining.`);
      return;
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
      setWalletBalances(data.walletBalances || { spot: [], earn: [], futures: [] });
      
      // Update portfolio with current amounts
      const currentUsdcInEarn = data.walletBalances?.earn
        ?.filter((balance: { asset: string; usdValue: number }) => balance.asset === 'USDC')
        ?.reduce((sum: number, balance: { asset: string; usdValue: number }) => sum + balance.usdValue, 0) || 0;
      const availableBalance = data.totalBalance - currentUsdcInEarn;
      
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
  }, [setIsLoading, setError, credentials, portfolio, onPortfolioUpdate, isRateLimited, lastFetchTime]);

  useEffect(() => {
    if (credentials) {
      fetchBalances();
    }
  }, [credentials, fetchBalances]);



  const getTotalTargetPercent = () => {
    const regularCoins = portfolio.filter(item => !item.isUsdcEarn);
    return regularCoins.reduce((sum, item) => sum + item.targetPercent, 0);
  };

  const getRemainingAllocation = () => {
    const usdcEarnPercent = credentials.usdcEarnTarget || 0;
    const futuresPercent = credentials.futuresWalletTarget || 0;
    const totalReserved = usdcEarnPercent + futuresPercent;
    return Math.max(0, 100 - totalReserved);
  };

  const getUsdcEarnTargetAmount = () => {
    return (totalBalance * (credentials.usdcEarnTarget || 0)) / 100;
  };

  const getCurrentUsdcInEarn = () => {
    return walletBalances.earn
      .filter(balance => balance.asset === 'USDC')
      .reduce((sum, balance) => sum + balance.usdValue, 0);
  };

  const getUsdcEarnNeeded = () => {
    const targetAmount = getUsdcEarnTargetAmount();
    const currentUsdcInEarn = getCurrentUsdcInEarn();
    return Math.max(0, targetAmount - currentUsdcInEarn);
  };

  const getSpotWalletMetrics = () => {
    const totalSpotValue = walletBalances.spot.reduce((sum, balance) => sum + balance.usdValue, 0);
    const totalSpotPnl = walletBalances.spot.reduce((sum, balance) => sum + (balance.pnl || 0), 0);
    const totalSpotPnlPercentage = totalSpotValue > 0 ? (totalSpotPnl / totalSpotValue) * 100 : 0;
    const spotAssetsCount = walletBalances.spot.length;
    
    return {
      totalValue: totalSpotValue,
      totalPnl: totalSpotPnl,
      totalPnlPercentage: totalSpotPnlPercentage,
      assetsCount: spotAssetsCount
    };
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Total Balance: <span className="font-semibold text-green-600">{formatCurrency(totalBalance)}</span>
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Available for Allocation: <span className="font-semibold text-blue-600">{formatCurrency(totalBalance - getCurrentUsdcInEarn())}</span>
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Regular Allocation: <span className="font-semibold">{getTotalTargetPercent().toFixed(1)}%</span>
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
            <span>USDC Earn:</span>
            <input
              type="number"
              value={credentials.usdcEarnTarget || ''}
              onChange={(e) => {
                const value = parseFloat(e.target.value) || 0;
                if (value >= 0 && value <= 100) {
                  const updatedCredentials = { ...credentials, usdcEarnTarget: value };
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
          <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
            <span>Futures:</span>
            <input
              type="number"
              value={credentials.futuresWalletTarget || ''}
              onChange={(e) => {
                const value = parseFloat(e.target.value) || 0;
                if (value >= 0 && value <= 100) {
                  const updatedCredentials = { ...credentials, futuresWalletTarget: value };
                  localStorage.setItem('binanceCredentials', JSON.stringify(updatedCredentials));
                  onCredentialsUpdate(updatedCredentials);
                }
              }}
              className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
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
          {credentials.usdcEarnTarget && (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              USDC Needed: <span className={`font-semibold ${getUsdcEarnNeeded() > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatCurrency(getUsdcEarnNeeded())}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Wallet Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Spot Wallet</h3>
          
          {/* Spot Wallet Summary Cards */}
          {walletBalances.spot.length > 0 && (
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded p-2 border border-blue-200 dark:border-blue-800">
                <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">Total Value</div>
                <div className="text-sm font-bold text-blue-600">
                  {formatCurrency(getSpotWalletMetrics().totalValue)}
                </div>
              </div>
              <div className="bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded p-2 border border-green-200 dark:border-green-800">
                <div className="text-xs text-green-600 dark:text-green-400 font-medium">Total PNL</div>
                <div className={`text-sm font-bold ${getSpotWalletMetrics().totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {getSpotWalletMetrics().totalPnl >= 0 ? '+' : ''}{formatCurrency(getSpotWalletMetrics().totalPnl)}
                </div>
              </div>
              <div className="bg-gradient-to-r from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded p-2 border border-purple-200 dark:border-purple-800">
                <div className="text-xs text-purple-600 dark:text-purple-400 font-medium">PNL %</div>
                <div className={`text-sm font-bold ${getSpotWalletMetrics().totalPnlPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {getSpotWalletMetrics().totalPnlPercentage >= 0 ? '+' : ''}{getSpotWalletMetrics().totalPnlPercentage.toFixed(2)}%
                </div>
              </div>
              <div className="bg-gradient-to-r from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 rounded p-2 border border-orange-200 dark:border-orange-800">
                <div className="text-xs text-orange-600 dark:text-orange-400 font-medium">Assets</div>
                <div className="text-sm font-bold text-orange-600">
                  {getSpotWalletMetrics().assetsCount}
                </div>
              </div>
            </div>
          )}
          
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {walletBalances.spot.length > 0 ? (
              <div className="space-y-1">
                {walletBalances.spot.map((balance, index) => (
                  <div key={index} className="flex justify-between items-center">
                    <span>{balance.asset}</span>
                    <div className="flex flex-col items-end">
                      <span className="font-medium">{formatCurrency(balance.usdValue)}</span>
                      {balance.pnl !== undefined && balance.pnlPercentage !== undefined && (
                        <div className="flex items-center gap-1 text-xs">
                          <span className={`${balance.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {balance.pnl >= 0 ? '+' : ''}{formatCurrency(balance.pnl)}
                          </span>
                          <span className={`${balance.pnlPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ({balance.pnlPercentage >= 0 ? '+' : ''}{balance.pnlPercentage.toFixed(2)}%)
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-gray-400">No balances</span>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-900 dark:text-white">Earn Wallet</h3>
            {credentials.usdcEarnTarget && (
              <button
                onClick={() => {
                  const newTarget = prompt('Enter new USDC Earn target (%):', credentials.usdcEarnTarget?.toString() || '0');
                  if (newTarget !== null) {
                    const targetValue = parseFloat(newTarget);
                    if (!isNaN(targetValue) && targetValue >= 0 && targetValue <= 100) {
                      const updatedCredentials = { ...credentials, usdcEarnTarget: targetValue };
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
                {/* Show USDC Earn target and difference */}
                {credentials.usdcEarnTarget && (
                  <>
                    <div className="border-t border-gray-200 dark:border-gray-600 pt-2 mt-2">
                      <div className="flex justify-between text-xs">
                        <span>Target %:</span>
                        <span className="font-medium">{credentials.usdcEarnTarget.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span>Target Amount:</span>
                        <span className="font-medium">{formatCurrency(getUsdcEarnTargetAmount())}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span>Current USDC:</span>
                        <span className="font-medium">
                          {formatCurrency(walletBalances.earn.filter(b => b.asset === 'USDC').reduce((sum, b) => sum + b.usdValue, 0))}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span>Current USDC %:</span>
                        <span className="font-medium">
                          {totalBalance > 0 ? ((walletBalances.earn.filter(b => b.asset === 'USDC').reduce((sum, b) => sum + b.usdValue, 0) / totalBalance) * 100).toFixed(1) : '0.0'}%
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span>USDC Difference:</span>
                        <span className={`font-medium ${
                          walletBalances.earn.filter(b => b.asset === 'USDC').reduce((sum, b) => sum + b.usdValue, 0) - getUsdcEarnTargetAmount() >= 0
                            ? 'text-green-600' 
                            : 'text-red-600'
                        }`}>
                          {formatCurrency(
                            walletBalances.earn.filter(b => b.asset === 'USDC').reduce((sum, b) => sum + b.usdValue, 0) - getUsdcEarnTargetAmount()
                          )}
                        </span>
                      </div>
                      <div className={`flex justify-between text-xs p-2 rounded ${
                        getUsdcEarnNeeded() > 0 ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                      }`}>
                        <span className="font-medium">USDC Needed:</span>
                        <span className={`font-bold ${
                          getUsdcEarnNeeded() > 0 ? 'text-red-600' : 'text-green-600'
                        }`}>
                          {formatCurrency(getUsdcEarnNeeded())}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <span className="text-gray-400">No balances</span>
                {credentials.usdcEarnTarget && (
                  <div className="border-t border-gray-200 dark:border-gray-600 pt-2 mt-2">
                    <div className="flex justify-between text-xs">
                      <span>Target %:</span>
                      <span className="font-medium">{credentials.usdcEarnTarget.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span>Target Amount:</span>
                      <span className="font-medium">{formatCurrency(getUsdcEarnTargetAmount())}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span>Current USDC:</span>
                      <span className="font-medium">{formatCurrency(0)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span>Current USDC %:</span>
                      <span className="font-medium">0.0%</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span>USDC Difference:</span>
                      <span className="text-red-600 font-medium">
                        {formatCurrency(-getUsdcEarnTargetAmount())}
                      </span>
                    </div>
                      <div className="flex justify-between text-xs p-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                        <span className="font-medium">USDC Needed:</span>
                        <span className="text-red-600 font-bold">
                          {formatCurrency(getUsdcEarnTargetAmount())}
                        </span>
                      </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-900 dark:text-white">Futures Wallet</h3>
            {credentials.futuresWalletTarget !== undefined ? (
              <button
                onClick={() => {
                  const newTarget = prompt('Enter new futures wallet target (%):', credentials.futuresWalletTarget?.toString() || '0');
                  if (newTarget !== null) {
                    const targetValue = parseFloat(newTarget);
                    if (!isNaN(targetValue) && targetValue >= 0 && targetValue <= 100) {
                      const updatedCredentials = { ...credentials, futuresWalletTarget: targetValue };
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
            ) : (
              <button
                onClick={() => {
                  const newTarget = prompt('Enter futures wallet target (%):', '0');
                  if (newTarget !== null) {
                    const targetValue = parseFloat(newTarget);
                    if (!isNaN(targetValue) && targetValue >= 0 && targetValue <= 100) {
                      const updatedCredentials = { ...credentials, futuresWalletTarget: targetValue };
                      localStorage.setItem('binanceCredentials', JSON.stringify(updatedCredentials));
                      onCredentialsUpdate(updatedCredentials);
                    } else {
                      alert('Please enter a valid percentage between 0 and 100');
                    }
                  }
                }}
                className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
              >
                Set Target
              </button>
            )}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {walletBalances.futures.length > 0 ? (
              <div className="space-y-1">
                {walletBalances.futures.map((balance, index) => (
                  <div key={index} className="flex justify-between">
                    <span>{balance.asset}</span>
                    <span className="font-medium">{formatCurrency(balance.usdValue)}</span>
                  </div>
                ))}
                {/* Show futures wallet target and difference */}
                {credentials.futuresWalletTarget && (
                  <>
                    <div className="border-t border-gray-200 dark:border-gray-600 pt-2 mt-2">
                      <div className="flex justify-between text-xs">
                        <span>Target %:</span>
                        <span className="font-medium">{credentials.futuresWalletTarget.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span>Target Amount:</span>
                        <span className="font-medium">{formatCurrency(((totalBalance - getCurrentUsdcInEarn()) * credentials.futuresWalletTarget) / 100)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span>Current:</span>
                        <span className="font-medium">
                          {formatCurrency(walletBalances.futures.reduce((sum, b) => sum + b.usdValue, 0))}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span>Current %:</span>
                        <span className="font-medium">
                          {(totalBalance - getCurrentUsdcInEarn()) > 0 ? ((walletBalances.futures.reduce((sum, b) => sum + b.usdValue, 0) / (totalBalance - getCurrentUsdcInEarn())) * 100).toFixed(1) : '0.0'}%
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span>Difference:</span>
                        <span className={`font-medium ${
                          walletBalances.futures.reduce((sum, b) => sum + b.usdValue, 0) - (((totalBalance - getCurrentUsdcInEarn()) * credentials.futuresWalletTarget) / 100) >= 0
                            ? 'text-green-600' 
                            : 'text-red-600'
                        }`}>
                          {formatCurrency(
                            walletBalances.futures.reduce((sum, b) => sum + b.usdValue, 0) - (((totalBalance - getCurrentUsdcInEarn()) * credentials.futuresWalletTarget) / 100)
                          )}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <span className="text-gray-400">No balances</span>
                {credentials.futuresWalletTarget && (
                  <div className="border-t border-gray-200 dark:border-gray-600 pt-2 mt-2">
                    <div className="flex justify-between text-xs">
                      <span>Target %:</span>
                      <span className="font-medium">{credentials.futuresWalletTarget.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span>Target Amount:</span>
                      <span className="font-medium">{formatCurrency(((totalBalance - getCurrentUsdcInEarn()) * credentials.futuresWalletTarget) / 100)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span>Current:</span>
                      <span className="font-medium">{formatCurrency(0)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span>Current %:</span>
                      <span className="font-medium">0.0%</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span>Difference:</span>
                      <span className="text-red-600 font-medium">
                        {formatCurrency(-(((totalBalance - getCurrentUsdcInEarn()) * credentials.futuresWalletTarget) / 100))}
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