'use client';

import { Plus, Trash2, DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import { PortfolioItem } from '../types';

interface CoinListTableProps {
  portfolio: PortfolioItem[];
  onPortfolioUpdate: (portfolio: PortfolioItem[]) => void;
}

export default function CoinListTable({
  portfolio,
  onPortfolioUpdate
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
