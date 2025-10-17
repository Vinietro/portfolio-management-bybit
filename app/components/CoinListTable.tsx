'use client';

import { useState, useEffect, useCallback } from 'react';
import { DollarSign, LogOut } from 'lucide-react';
import { PortfolioItem, BingXCredentials } from '../types';

interface CoinListTableProps {
  credentials: BingXCredentials;
  portfolio: PortfolioItem[];
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  onDisconnect?: () => void;
}

export default function CoinListTable({
  credentials,
  portfolio,
  setIsLoading,
  setError,
  onDisconnect
}: CoinListTableProps) {
  const [positionStatuses, setPositionStatuses] = useState<{[symbol: string]: {symbol: string; is_open: boolean; last_transaction_type?: string}}>({});

  const fetchPositionStatus = useCallback(async () => {
    if (!credentials?.apiKey) return;
    
    try {
      const response = await fetch(`/api/position-status?apiKey=${credentials.apiKey}`);
      const data = await response.json();
      
      if (data.success && data.data) {
        const statusMap: {[symbol: string]: {symbol: string; is_open: boolean; last_transaction_type?: string}} = {};
        data.data.forEach((status: {symbol: string; is_open: boolean; last_transaction_type?: string}) => {
          statusMap[status.symbol] = status;
        });
        setPositionStatuses(statusMap);
      }
    } catch (error) {
      console.error('Error fetching position status:', error);
    }
  }, [credentials?.apiKey]);

  useEffect(() => {
    fetchPositionStatus();
  }, [credentials?.apiKey, fetchPositionStatus]);


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

  const handleDisconnect = async () => {
    const message = 'Are you sure you want to disconnect your API key from this application? This will remove your credentials from the database and you will need to re-enter them to use the application again.';
    
    if (!confirm(message)) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get device ID from localStorage, or generate if not exists
      let deviceId = localStorage.getItem('portfolio_device_id');
      if (!deviceId) {
        // Generate a new device ID using crypto random
        deviceId = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
        localStorage.setItem('portfolio_device_id', deviceId);
      }
      
      const response = await fetch(`/api/sync/credentials?deviceId=${encodeURIComponent(deviceId)}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to disconnect credentials');
      }

      // Clear local storage
      localStorage.removeItem('bingxCredentials');
      
      // Call the disconnect callback if provided
      if (onDisconnect) {
        onDisconnect();
      } else {
        // Fallback: reload page
        window.location.reload();
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to disconnect credentials';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <DollarSign className="h-6 w-6 text-green-600" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Portfolio Allocation
          </h2>
        </div>
        <button
          onClick={handleDisconnect}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-700 bg-red-100 dark:bg-red-900/20 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/30 cursor-pointer transition-colors rounded-md"
          title="Disconnect API key from database"
        >
          <LogOut className="h-4 w-4" />
          Disconnect
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Coin</th>
              <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Allocation %</th>
              <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Allocation Amount</th>
              <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Current Amount</th>
              <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Current %</th>
              <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Position Status</th>
              <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Acumulated PNL</th>
            </tr>
          </thead>
          <tbody>
            {portfolio.map((item) => {
              // Normalize coin name to match the format stored in position_status database
              const coinAssetName = item.coin.includes('USDT') ? item.coin.substring(0, item.coin.indexOf('USDT')) : item.coin;
              const positionStatus = positionStatuses[coinAssetName] || positionStatuses[item.coin];
              
              return (
              <tr key={item.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-slate-700">
                <td className="py-3 px-4">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {item.coin}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {item.targetPercent.toFixed(2)}%
                  </span>
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
                  {positionStatus ? (
                    <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${
                      positionStatus.is_open 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' 
                        : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                    }`}>
                      {positionStatus.is_open ? 'Open' : 'Closed'}
                    </span>
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
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {portfolio.length === 0 && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Setting up default portfolio...</p>
        </div>
      )}
    </div>
  );
}
