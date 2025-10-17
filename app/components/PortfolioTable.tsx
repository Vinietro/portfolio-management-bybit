'use client';

import { useState, useEffect, useCallback } from 'react';
import { BingXCredentials, PortfolioItem } from '../types';

interface PortfolioTableProps {
  credentials: BingXCredentials;
  portfolio: PortfolioItem[];
  onPortfolioUpdate: (portfolio: PortfolioItem[]) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export default function PortfolioTable({
  credentials,
  portfolio,
  onPortfolioUpdate,
  isLoading,
  setIsLoading,
  setError
}: PortfolioTableProps) {
  const [totalBalance, setTotalBalance] = useState<number>(0);
  const [availableForAllocation, setAvailableForAllocation] = useState<number>(0);
  const [pnlData, setPnlData] = useState<{
    totalPNL: number;
    totalPNLPercentage: number;
    breakdown: Array<{
      symbol: string;
      entryValue: number;
      exitValue: number;
      realizedPNL: number;
      pnlPercentage: number;
    }>;
  } | null>(null);
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
      
      // Calculate allocation logic - use full balance for allocation
      const totalBalanceFromApi = data.totalBalance;
      
      // Available for Allocation = Total Balance
      const availableBalanceForCalculation = totalBalanceFromApi;
      setAvailableForAllocation(availableBalanceForCalculation);
      
      // Calculate portfolio data if valid coins exist
      if (portfolio && portfolio.length > 0) {
        console.log('📊 PortfolioTable: Processing portfolio with', portfolio.length, 'coins');
        console.log('Total Balance:', totalBalanceFromApi, 'Available:', availableBalanceForCalculation);
        
        // Normalize portfolio percentages to ensure they sum to 100%
        const normalizedPortfolio = normalizePortfolioPercentages(portfolio);
        
        const updatedPortfolio = normalizedPortfolio.map(item => {
          // Normalize coin name: ENAUSDT -> ENA
          const coinAssetName = item.coin.includes('USDT') ? item.coin.substring(0, item.coin.indexOf('USDT')) : item.coin;
          const currentAmount = data.balances[coinAssetName] || 0;
          // TARGET AMOUNT: Available for Allocation * Coin Percent
          const targetAmount = (availableBalanceForCalculation * item.targetPercent) / 100;
          // CURRENT PERCENT: Relative to available for allocation
          const currentPercent = availableBalanceForCalculation > 0 ? (currentAmount / availableBalanceForCalculation) * 100 : 0;
          const difference = targetAmount - currentAmount;

          // Get PNL from trading transactions (database history) 
          let pnl = 0;
          let pnlPercentage = 0;
          if (pnlData) {
            const pnlItem = pnlData.breakdown.find((pnlDataItem: { symbol: string; realizedPNL: number; pnlPercentage: number }) => 
              pnlDataItem.symbol === coinAssetName
            );
            if (pnlItem) {
              pnl = pnlItem.realizedPNL;
              pnlPercentage = pnlItem.pnlPercentage;
            }
          }

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

        console.log('🔄 PortfolioTable: Updating with calculated balances', updatedPortfolio.length);
        onPortfolioUpdate(updatedPortfolio);
      } else {
        console.log('🚫 PortfolioTable: Skipping balance calc - no portfolio coins available');
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('rate limit')) {
        setIsRateLimited(true);
        setError('Rate limit exceeded. Please wait 1 minute before refreshing.');
      } else {
        setError('Failed to fetch portfolio data from BingX');
      }
      
      // FALLBACK: Ensure allocation data is always displayed, even when API call fails
      if (portfolio && portfolio.length > 0) {
        console.log('🔄 PortfolioTable: API failed - triggering fallback allocation calculation');
        
        const defaultTotalBalance = 10000; // Fallback balance assumption when API fails  
        const availableBalanceForCalculation = defaultTotalBalance;
        setAvailableForAllocation(availableBalanceForCalculation);
        
        const updatedPortfolio = portfolio.map(item => {
          const currentAmount = 0; // Default for "API unavailable" fallback  
          const targetAmount = (availableBalanceForCalculation * item.targetPercent) / 100;
          const currentPercent = 0; // Default when no live balance data
          const difference = targetAmount - currentAmount;

          return {
            ...item,
            currentAmount,
            targetAmount,
            currentPercent,
            difference,
            pnl: 0,
            pnlPercentage: 0
          };
        });
        
        console.log('🔄 PortfolioTable: Updated portfolio with fallback allocation after API failure:', updatedPortfolio.length);
        onPortfolioUpdate(updatedPortfolio);
      }
    } finally {
      setIsLoading(false);
    }
  }, [setIsLoading, setError, credentials, portfolio, onPortfolioUpdate, isRateLimited, lastFetchTime, pnlData]);

  const fetchPnlData = useCallback(async () => {
    if (!credentials?.apiKey) return;
    
    try {
      const response = await fetch('/api/pnl-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: credentials.apiKey })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setPnlData(data.pnlData);
        }
      }
    } catch (error) {
      console.error('Failed to fetch P&L data:', error);
    }
  }, [credentials]);

  useEffect(() => {
    if (portfolio && portfolio.length > 0) {
      console.log('🚀 PortfolioTable: Portfolio condition met with', portfolio.length, 'coins - processing allocation calculations');
      if (credentials) {
        console.log('📈 PortfolioTable: Credentials available, fetching balance data from BingX API');
        fetchBalances();
      } else {
        console.log('📊 PortfolioTable: No credentials, calculating basic allocation targets without API data');
        
        // Ensure core allocation data shows even without credentials/API access  
        const defaultTotalBalance = 10000; // Conservative default for allocation display
        const availableBalanceForCalculation = defaultTotalBalance;
        setAvailableForAllocation(availableBalanceForCalculation);
        
        const updatedPortfolio = portfolio.map(item => {
          const currentAmount = 0; // Default to show "BUY X COIN" instructions  
          const targetAmount = (availableBalanceForCalculation * item.targetPercent) / 100;
          const currentPercent = 0; // Default when no live balance data available
          const difference = targetAmount - currentAmount;

          return {
            ...item,
            currentAmount,
            targetAmount, 
            currentPercent,
            difference,
            pnl: 0,
            pnlPercentage: 0
          };
        });
        
        console.log('🔄 PortfolioTable: Updated portfolio with basic allocation targets:', updatedPortfolio.length);
        onPortfolioUpdate(updatedPortfolio);
      }
    }
  }, [credentials, portfolio, fetchBalances, onPortfolioUpdate]);

  useEffect(() => {
    if (credentials?.apiKey) {
      fetchPnlData();
    }
  }, [credentials, fetchPnlData]);

  // Add PNL when data is loaded (avoid circular deps)
  useEffect(() => {
    if (pnlData) {
      fetchBalances(); 
      // Simply re-run balance fetch which will include the new PNL inside its logic  
    }
  }, [pnlData, fetchBalances]);


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
    return portfolio.reduce((sum, item) => sum + item.targetPercent, 0);
  };

  // Function to normalize portfolio percentages to ensure they sum to 100%
  const normalizePortfolioPercentages = (portfolio: PortfolioItem[]): PortfolioItem[] => {
    const totalPercent = portfolio.reduce((sum, item) => sum + item.targetPercent, 0);
    
    if (totalPercent === 0) return portfolio;
    
    // If total is not 100%, normalize all percentages proportionally
    if (totalPercent !== 100) {
      return portfolio.map(item => ({
        ...item,
        targetPercent: (item.targetPercent / totalPercent) * 100
      }));
    }
    
    return portfolio;
  };




  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num);
  };

  const testBalanceAPI = async () => {
    if (!credentials?.apiKey || !credentials?.secretKey) {
      setError('No credentials available for testing');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/test-balance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey: credentials.apiKey,
          secretKey: credentials.secretKey
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        console.log('🧪 Balance API Test Results:', data);
        alert(`Balance API Test Complete!\n\nCheck the browser console for detailed results.\n\nFutures Balance: ${data.results.futures?.ok ? 'OK' : 'Failed'}\nSpot Balance: ${data.results.spot?.ok ? 'OK' : 'Failed'}\nFutures Prices: ${data.results.futuresPrices?.ok ? 'OK' : 'Failed'}\nSpot Prices: ${data.results.spotPrices?.ok ? 'OK' : 'Failed'}`);
      } else {
        throw new Error(data.error || 'Test failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to test balance API';
      setError(errorMessage);
      console.error('Balance API test error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const checkDatabaseStatus = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/database-status');
      const data = await response.json();
      
      if (response.ok) {
        console.log('🗄️ Database Status:', data);
        
        if (data.success) {
          const { tables, data: dbData } = data.database;
          const status = data.database.status;
          
          let message = `Database Status: ${status === 'healthy' ? '✅ Healthy' : '⚠️ Needs Initialization'}\n\n`;
          message += `Tables:\n`;
          message += `✅ Existing: ${tables.existing.join(', ')}\n`;
          if (tables.missing.length > 0) {
            message += `❌ Missing: ${tables.missing.join(', ')}\n`;
          }
          message += `\nData:\n`;
          message += `📊 Trading Transactions: ${dbData.trading_transactions}\n`;
          message += `🪙 Default Coins: ${dbData.default_coins.count} (${dbData.default_coins.total_percentage}% total)\n`;
          
          if (status === 'needs_initialization') {
            const init = confirm(`${message}\n\nWould you like to initialize the missing tables?`);
            if (init) {
              await initializeDatabase();
            }
          } else {
            alert(message);
          }
        } else {
          throw new Error(data.error || 'Database check failed');
        }
      } else {
        throw new Error(data.error || 'Database check failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to check database status';
      setError(errorMessage);
      console.error('Database status check error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const initializeDatabase = async () => {
    try {
      const response = await fetch('/api/database-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        alert('✅ Database initialized successfully!\n\nAll required tables have been created.');
        // Refresh the page to reload data
        window.location.reload();
      } else {
        throw new Error(data.error || 'Database initialization failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize database';
      setError(errorMessage);
      console.error('Database initialization error:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Portfolio Overview Card */}
      <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-white">Portfolio Overview</h3>
          <div className="flex gap-2">
            <button
              onClick={checkDatabaseStatus}
              disabled={isLoading}
              className="px-3 py-1 text-xs font-medium text-purple-700 bg-purple-100 dark:bg-purple-900/20 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/30 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed cursor-pointer transition-colors rounded-md"
              title="Check Database Status"
            >
              🗄️ DB Status
            </button>
            <button
              onClick={testBalanceAPI}
              disabled={isLoading}
              className="px-3 py-1 text-xs font-medium text-blue-700 bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/30 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed cursor-pointer transition-colors rounded-md"
              title="Test Balance API endpoints"
            >
              🧪 Test API
            </button>
          </div>
        </div>
        <div className="flex flex-wrap justify-between gap-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Total Balance: <span className="font-semibold text-green-600">{formatCurrency(totalBalance)}</span>
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Available for trading: <span className="font-semibold text-blue-600">{formatCurrency(availableForAllocation)} (100%)</span>
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Futures trading capital allocation: <span className={`font-semibold ${getTotalTargetPercent() === 100 ? 'text-green-600' : 'text-red-600'}`}>{getTotalTargetPercent().toFixed(1)}%</span>
            {getTotalTargetPercent() !== 100 && (
              <span className="ml-2 text-xs text-red-500">(Must equal 100%)</span>
            )}
          </div>
        </div>
      </div>

      {/* Portfolio Validation Warning */}
      {getTotalTargetPercent() !== 100 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                Portfolio Allocation Warning
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>
                  Your portfolio allocation totals {getTotalTargetPercent().toFixed(1)}% but must equal exactly 100%. 
                  The system will automatically normalize your allocations to ensure they sum to 100%.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Trading Performance */}
      <div className="grid grid-cols-1 gap-6">
        {/* Left side - P&L Section */}
        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Trading Performance</h3>
          <div className="space-y-3">
            {/* P&L Section */}
            {pnlData && (
              <>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Total P&L: <span className={`font-semibold ${pnlData.totalPNL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(pnlData.totalPNL)}
                  </span>
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Percentage: <span className={`font-semibold ${pnlData.totalPNLPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {pnlData.totalPNLPercentage >= 0 ? '+' : ''}{pnlData.totalPNLPercentage.toFixed(2)}%
                  </span>
                </div>
                
                {/* Breakdown of individual coins */}
                {pnlData.breakdown && pnlData.breakdown.length > 0 && (
                  <div className="mt-2 max-h-24 overflow-y-auto">
                    <div className="text-xs text-gray-500 dark:text-gray-400">Breakdown:</div>
                    {pnlData.breakdown.map((item, index) => (
                      <div key={index} className="text-xs text-gray-600 dark:text-gray-400 flex justify-between">
                        <span>{item.symbol}:</span>
                        <span className={`${item.realizedPNL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(item.realizedPNL)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {!pnlData && (
              <div className="text-sm text-gray-500 dark:text-gray-400">
                No trading history available
              </div>
            )}
          </div>
        </div>


      </div>
    </div>
  );
} 