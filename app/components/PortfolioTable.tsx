'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
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

  const fetchBalances = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/balances', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch balances');
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
    } catch {
      setError('Failed to fetch portfolio data from Binance');
    } finally {
      setIsLoading(false);
    }
  }, [setIsLoading, setError, credentials, portfolio, onPortfolioUpdate]);

  useEffect(() => {
    if (credentials) {
      fetchBalances();
    }
  }, [credentials]);

  const addCoin = () => {
    const newItem: PortfolioItem = {
      id: Date.now().toString(),
      coin: '',
      targetPercent: 0
    };
    onPortfolioUpdate([...portfolio, newItem]);
  };

  const removeCoin = (id: string) => {
    onPortfolioUpdate(portfolio.filter(item => item.id !== id));
  };

  const updateCoin = (id: string, field: keyof PortfolioItem, value: string | number) => {
    const updatedPortfolio = portfolio.map(item => {
      if (item.id === id) {
        return { ...item, [field]: value };
      }
      return item;
    });
    onPortfolioUpdate(updatedPortfolio);
  };

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





  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6
    }).format(num);
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
        <div className="flex items-center gap-4">
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
        <button
          onClick={addCoin}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Coin
        </button>
      </div>

      {/* Wallet Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Spot Wallet</h3>
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

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Coin</th>
              <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Target %</th>
              <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Target Amount</th>
              <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Current Amount</th>
              <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Current %</th>
              <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Difference</th>
              <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">PNL</th>
              <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Actions</th>
            </tr>
          </thead>
          <tbody>
            {portfolio.map((item) => (
              <tr key={item.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-slate-700">
                <td className="py-3 px-4">
                  <input
                    type="text"
                    value={item.coin}
                    onChange={(e) => updateCoin(item.id, 'coin', e.target.value.toUpperCase())}
                    className="w-full bg-transparent border-none focus:outline-none text-gray-900 dark:text-white"
                    placeholder="BTC"
                  />
                </td>
                <td className="py-3 px-4">
                  <input
                    type="number"
                    value={item.targetPercent}
                    onChange={(e) => updateCoin(item.id, 'targetPercent', parseFloat(e.target.value) || 0)}
                    className="w-20 bg-transparent border-none focus:outline-none text-gray-900 dark:text-white"
                    step="0.1"
                    min="0"
                    max="100"
                  />
                  <span className="text-gray-500">%</span>
                </td>
                <td className="py-3 px-4">
                  {item.targetAmount ? (
                    <span className="text-green-600 font-medium">
                      {formatNumber(item.targetAmount)}
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="py-3 px-4">
                  {item.currentAmount !== undefined ? (
                    <span className="font-medium">
                      {formatNumber(item.currentAmount)}
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="py-3 px-4">
                  {item.currentPercent !== undefined ? (
                    <span className="font-medium">
                      {item.currentPercent.toFixed(2)}%
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="py-3 px-4">
                  {item.difference !== undefined ? (
                    <div className="flex items-center gap-1">
                      {item.difference > 0 ? (
                        <TrendingUp className="h-4 w-4 text-green-500" />
                      ) : item.difference < 0 ? (
                        <TrendingDown className="h-4 w-4 text-red-500" />
                      ) : null}
                      <span className={`font-medium ${item.difference > 0 ? 'text-green-600' : item.difference < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                        {formatNumber(Math.abs(item.difference))}
                      </span>
                    </div>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="py-3 px-4">
                  {item.pnl !== undefined && item.pnlPercentage !== undefined ? (
                    <div className="flex flex-col">
                      <span className={`font-medium ${item.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {item.pnl >= 0 ? '+' : ''}{formatCurrency(item.pnl)}
                      </span>
                      <span className={`text-xs ${item.pnlPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {item.pnlPercentage >= 0 ? '+' : ''}{item.pnlPercentage.toFixed(2)}%
                      </span>
                    </div>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="py-3 px-4">
                  <button
                    onClick={() => removeCoin(item.id)}
                    className="text-red-500 hover:text-red-700 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {portfolio.length === 0 && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No coins added yet. Click &quot;Add Coin&quot; to start building your portfolio.</p>
        </div>
      )}
    </div>
  );
} 