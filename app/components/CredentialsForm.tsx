'use client';

import { useState } from 'react';
import { Eye, EyeOff, Key, Shield } from 'lucide-react';
import { BinanceCredentials } from '../types';

interface CredentialsFormProps {
  onSave: (credentials: BinanceCredentials) => void;
}

export default function CredentialsForm({ onSave }: CredentialsFormProps) {
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!apiKey.trim() || !secretKey.trim()) {
      setError('Please enter both API Key and Secret Key');
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      // Test the credentials by making a simple API call
      const response = await fetch('/api/test-credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey, secretKey }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Invalid credentials');
      }

      onSave({ apiKey, secretKey });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Invalid credentials. Please check your API Key and Secret Key.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          API Key
        </label>
        <div className="relative">
          <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            id="apiKey"
            type="text"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-white"
            placeholder="Enter your Binance API Key"
            required
          />
        </div>
      </div>

      <div>
        <label htmlFor="secretKey" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Secret Key
        </label>
        <div className="relative">
          <Shield className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            id="secretKey"
            type={showSecret ? 'text' : 'password'}
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            className="w-full pl-10 pr-12 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-white"
            placeholder="Enter your Binance Secret Key"
            required
          />
          <button
            type="button"
            onClick={() => setShowSecret(!showSecret)}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm text-red-800 dark:text-red-200">
            <strong>Error:</strong> {error}
          </p>
        </div>
      )}

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <p className="text-sm text-blue-800 dark:text-blue-200">
          <strong>Security Note:</strong> Your credentials are stored locally in your browser and are never sent to our servers. 
          Make sure to create API keys with read-only permissions for security.
        </p>
      </div>

      <button
        type="submit"
        disabled={isLoading || !apiKey.trim() || !secretKey.trim()}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isLoading ? 'Testing Credentials...' : 'Connect to Binance'}
      </button>
    </form>
  );
} 