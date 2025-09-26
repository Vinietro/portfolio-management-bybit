'use client';

import { Plus, Trash2, DollarSign, TrendingUp, TrendingDown, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { PortfolioItem, BinanceCredentials } from '../types';

interface CoinListTableProps {
  credentials: BinanceCredentials;
  portfolio: PortfolioItem[];
  onPortfolioUpdate: (portfolio: PortfolioItem[]) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  walletBalances?: {
    spot: Array<{
      asset: string;
      free: string;
      locked: string;
      usdValue: number;
      wallet: string;
    }>;
    earn: Array<{
      asset: string;
      free: string;
      locked: string;
      usdValue: number;
      wallet: string;
    }>;
  };
}

export default function CoinListTable({
  credentials,
  portfolio,
  onPortfolioUpdate,
  setIsLoading,
  setError,
  walletBalances
}: CoinListTableProps) {
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

  const handleBuyToTarget = async (item: PortfolioItem) => {
    if (!item.coin || !item.difference || item.difference <= 0) {
      setError('Cannot buy: Coin name is missing or already at/above target.');
      return;
    }
    
    const amountToBuy = item.difference;
    const message = `Buy ${amountToBuy.toFixed(6)} ${item.coin} to reach your target allocation?\n\nThis will place a market buy order on Binance using your current balance.`;
    
    if (!confirm(message)) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/trading', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey: credentials.apiKey,
          secretKey: credentials.secretKey,
          symbol: item.coin,
          side: 'BUY',
          quantity: amountToBuy, // This will be converted to USD amount in the API
          type: 'MARKET'
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to execute buy order');
      }

      alert(`Buy order executed successfully!\n\nOrder Details:\n- Symbol: ${data.symbol}\n- Quantity: ${data.quantity.toFixed(6)} ${data.symbol}\n- Price: ${data.price.toFixed(2)} USDT\n- Total Value: ${data.totalValue.toFixed(2)} USDT`);
      
      // Refresh portfolio data after successful trade
      window.location.reload();
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to execute buy order';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSellAll = async (item: PortfolioItem) => {
    if (!item.coin) {
      setError('Cannot sell: Coin name is missing.');
      return;
    }

    // Get actual coin quantity from wallet balances
    const spotBalance = walletBalances?.spot?.find(b => b.asset === item.coin);
    const actualCoinQuantity = spotBalance ? parseFloat(spotBalance.free) + parseFloat(spotBalance.locked) : 0;

    if (actualCoinQuantity <= 0) {
      setError(`Cannot sell: No ${item.coin} balance found in your wallet.`);
      return;
    }
    
    const message = `Sell entire position of ${actualCoinQuantity.toFixed(6)} ${item.coin}?\n\nThis will place a market sell order on Binance.`;
    
    if (!confirm(message)) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/trading', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey: credentials.apiKey,
          secretKey: credentials.secretKey,
          symbol: item.coin,
          side: 'SELL',
          quantity: actualCoinQuantity,
          type: 'MARKET'
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Check if it's a balance error and show detailed information
        if (data.availableBalance !== undefined && data.requestedQuantity !== undefined) {
          throw new Error(`Insufficient ${data.symbol} balance. Available: ${data.availableBalance.toFixed(6)} ${data.symbol}, Requested: ${data.requestedQuantity.toFixed(6)} ${data.symbol}. Please check your actual balance in Binance.`);
        }
        throw new Error(data.error || 'Failed to execute sell order');
      }

      alert(`Sell order executed successfully!\n\nOrder Details:\n- Symbol: ${data.symbol}\n- Quantity: ${data.quantity.toFixed(6)} ${data.symbol}\n- Price: ${data.price.toFixed(2)} USDT\n- Total Value: ${data.totalValue.toFixed(2)} USDT`);
      
      // Refresh portfolio data after successful trade
      window.location.reload();
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to execute sell order';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
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
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <DollarSign className="h-6 w-6 text-green-600" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Portfolio Allocation
          </h2>
        </div>
        <button
          onClick={addCoin}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Coin
        </button>
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
              <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Open PNL</th>
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
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleBuyToTarget(item)}
                      disabled={!item.coin || !item.difference || item.difference <= 0}
                      className="text-green-500 hover:text-green-700 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                      title="Buy remaining amount to reach target"
                    >
                      <ArrowUpCircle className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleSellAll(item)}
                      disabled={(() => {
                        if (!item.coin) return true;
                        const spotBalance = walletBalances?.spot?.find(b => b.asset === item.coin);
                        const actualCoinQuantity = spotBalance ? parseFloat(spotBalance.free) + parseFloat(spotBalance.locked) : 0;
                        return actualCoinQuantity <= 0;
                      })()}
                      className="text-red-500 hover:text-red-700 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                      title="Sell entire position"
                    >
                      <ArrowDownCircle className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => removeCoin(item.id)}
                      disabled={false}
                      className="text-red-500 hover:text-red-700 transition-colors"
                      title="Remove coin from portfolio"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
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
