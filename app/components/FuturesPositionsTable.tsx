'use client';

import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, AlertTriangle, Zap, RefreshCw } from 'lucide-react';
import { BinanceCredentials, FuturesPosition } from '../types';

interface FuturesPositionsTableProps {
  credentials: BinanceCredentials;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export default function FuturesPositionsTable({
  credentials,
  setIsLoading,
  setError
}: FuturesPositionsTableProps) {
  const [positions, setPositions] = useState<FuturesPosition[]>([]);
  const [totalPnl, setTotalPnl] = useState<number>(0);
  const [totalNotional, setTotalNotional] = useState<number>(0);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  const [isRateLimited, setIsRateLimited] = useState<boolean>(false);

  const fetchFuturesPositions = useCallback(async () => {
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
      const response = await fetch('/api/futures-positions', {
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
        throw new Error(errorData.error || 'Failed to fetch futures positions');
      }

      const data = await response.json();
      setPositions(data.positions || []);
      setTotalPnl(data.totalPnl || 0);
      setTotalNotional(data.totalNotional || 0);
    } catch (error) {
      if (error instanceof Error && error.message.includes('rate limit')) {
        setIsRateLimited(true);
        setError('Rate limit exceeded. Please wait 1 minute before refreshing.');
      } else {
        setError('Failed to fetch futures positions from Binance');
      }
    } finally {
      setIsLoading(false);
    }
  }, [credentials, setError, setIsLoading, isRateLimited, lastFetchTime]);

  const handleRefresh = () => {
    fetchFuturesPositions();
  };

  useEffect(() => {
    if (credentials) {
      fetchFuturesPositions();
    }
  }, [credentials, fetchFuturesPositions]);

  const formatNumber = (num: number, decimals: number = 2) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
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

  const formatPercentage = (num: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num) + '%';
  };

  const getLiquidationRisk = (position: FuturesPosition) => {
    const markPrice = parseFloat(position.markPrice);
    const liquidationPrice = parseFloat(position.liquidationPrice);
    
    if (position.side === 'LONG') {
      const distance = ((markPrice - liquidationPrice) / markPrice) * 100;
      if (distance < 10) return 'high';
      if (distance < 25) return 'medium';
      return 'low';
    } else {
      const distance = ((liquidationPrice - markPrice) / markPrice) * 100;
      if (distance < 10) return 'high';
      if (distance < 25) return 'medium';
      return 'low';
    }
  };

  const getAdlRisk = (position: FuturesPosition) => {
    if (position.adlQuantile <= 1) return 'none';
    if (position.adlQuantile <= 2) return 'low';
    if (position.adlQuantile <= 3) return 'medium';
    return 'high';
  };

  const getLiquidationDistance = (position: FuturesPosition) => {
    const markPrice = parseFloat(position.markPrice);
    const liquidationPrice = parseFloat(position.liquidationPrice);
    
    if (position.side === 'LONG') {
      return ((markPrice - liquidationPrice) / markPrice) * 100;
    } else {
      return ((liquidationPrice - markPrice) / markPrice) * 100;
    }
  };

  if (positions.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
        <div className="flex items-center gap-3 mb-6">
          <Zap className="h-6 w-6 text-orange-600" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Futures Positions
          </h2>
        </div>
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No open futures positions found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Zap className="h-6 w-6 text-orange-600" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Futures Positions
          </h2>
        </div>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 px-3 py-1 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
          <div className="text-sm text-green-600 dark:text-green-400 font-medium">Total PNL</div>
          <div className={`text-2xl font-bold ${totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(totalPnl)}
          </div>
        </div>
        <div className="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
          <div className="text-sm text-blue-600 dark:text-blue-400 font-medium">Total Notional</div>
          <div className="text-2xl font-bold text-blue-600">
            {formatCurrency(totalNotional)}
          </div>
        </div>
        <div className="bg-gradient-to-r from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
          <div className="text-sm text-purple-600 dark:text-purple-400 font-medium">Open Positions</div>
          <div className="text-2xl font-bold text-purple-600">
            {positions.length}
          </div>
        </div>
        <div className="bg-gradient-to-r from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
          <div className="text-sm text-orange-600 dark:text-orange-400 font-medium">Avg ROE</div>
          <div className="text-2xl font-bold text-orange-600">
            {positions.length > 0 
              ? formatPercentage(positions.reduce((sum, pos) => sum + pos.roe, 0) / positions.length)
              : '0.00%'
            }
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Symbol</th>
              <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Side</th>
              <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Size</th>
              <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Entry Price</th>
              <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Mark Price</th>
              <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">PNL</th>
              <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">ROE</th>
              <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Leverage</th>
              <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Margin</th>
              <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Liquidation</th>
              <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Risk</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((position, index) => {
              const liquidationRisk = getLiquidationRisk(position);
              const liquidationDistance = getLiquidationDistance(position);
              
              return (
                <tr key={index} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-slate-700">
                  <td className="py-3 px-4 font-medium text-gray-900 dark:text-white">
                    {position.symbol}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      position.side === 'LONG' 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' 
                        : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                    }`}>
                      {position.side}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-900 dark:text-white">
                    {formatNumber(position.size, 4)}
                  </td>
                  <td className="py-3 px-4 text-gray-900 dark:text-white">
                    {formatCurrency(parseFloat(position.entryPrice))}
                  </td>
                  <td className="py-3 px-4 text-gray-900 dark:text-white">
                    {formatCurrency(parseFloat(position.markPrice))}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1">
                      {position.pnl >= 0 ? (
                        <TrendingUp className="h-4 w-4 text-green-500" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-red-500" />
                      )}
                      <div className="flex flex-col">
                        <span className={`font-medium ${position.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {position.pnl >= 0 ? '+' : ''}{formatCurrency(position.pnl)}
                        </span>
                        <span className={`text-xs ${position.pnlPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {position.pnlPercentage >= 0 ? '+' : ''}{formatPercentage(position.pnlPercentage)}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`font-medium ${position.roe >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {position.roe >= 0 ? '+' : ''}{formatPercentage(position.roe)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-900 dark:text-white">
                    {position.leverage}x
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      position.marginType === 'isolated' 
                        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' 
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                    }`}>
                      {position.marginType.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-900 dark:text-white">
                    {formatCurrency(parseFloat(position.liquidationPrice))}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-500 dark:text-gray-400">Liq:</span>
                        <span className={`px-1 py-0.5 rounded text-xs font-medium ${
                          liquidationRisk === 'high' 
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                            : liquidationRisk === 'medium'
                            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                            : 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                        }`}>
                          {liquidationRisk.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-500 dark:text-gray-400">ADL:</span>
                        <span className={`px-1 py-0.5 rounded text-xs font-medium ${
                          getAdlRisk(position) === 'high' 
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                            : getAdlRisk(position) === 'medium'
                            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                            : getAdlRisk(position) === 'low'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
                        }`}>
                          {getAdlRisk(position).toUpperCase()}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatPercentage(liquidationDistance)}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
