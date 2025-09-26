// Sync utility for cross-device data synchronization

interface SyncResponse {
  success: boolean;
  data?: unknown;
  version?: number;
  updatedAt?: string;
  deviceId?: string;
  message?: string;
  error?: string;
}

export class SyncManager {
  private deviceId: string;
  private lastSyncTime: string | null = null;

  constructor() {
    // Get or generate device ID
    this.deviceId = this.getOrCreateDeviceId();
  }

  private getOrCreateDeviceId(): string {
    if (typeof window === 'undefined') return '';
    
    let deviceId = localStorage.getItem('portfolio_device_id');
    if (!deviceId) {
      deviceId = this.generateDeviceId();
      localStorage.setItem('portfolio_device_id', deviceId);
    }
    return deviceId;
  }

  private generateDeviceId(): string {
    return 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // Portfolio sync methods
  async syncPortfolio(portfolio: unknown[]): Promise<SyncResponse> {
    try {
      const response = await fetch('/api/sync/portfolio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          portfolio,
          deviceId: this.deviceId,
          lastSyncTime: this.lastSyncTime
        }),
      });

      const result = await response.json();
      
      if (result.success && result.deviceId) {
        this.deviceId = result.deviceId;
        localStorage.setItem('portfolio_device_id', this.deviceId);
      }
      
      return result;
    } catch {
      return {
        success: false,
        error: 'Network error during portfolio sync'
      };
    }
  }

  async fetchPortfolio(): Promise<SyncResponse> {
    try {
      const url = `/api/sync/portfolio?deviceId=${this.deviceId}`;
      const response = await fetch(url);
      const result = await response.json();
      
      if (result.success && result.deviceId) {
        this.deviceId = result.deviceId;
        localStorage.setItem('portfolio_device_id', this.deviceId);
      }
      
      return result;
    } catch {
      return {
        success: false,
        error: 'Network error during portfolio fetch'
      };
    }
  }

  // Credentials sync methods
  async syncCredentials(credentials: Record<string, unknown>): Promise<SyncResponse> {
    try {
      const response = await fetch('/api/sync/credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          credentials,
          deviceId: this.deviceId
        }),
      });

      const result = await response.json();
      
      if (result.success && result.deviceId) {
        this.deviceId = result.deviceId;
        localStorage.setItem('portfolio_device_id', this.deviceId);
      }
      
      return result;
    } catch {
      return {
        success: false,
        error: 'Network error during credentials sync'
      };
    }
  }

  async fetchCredentials(): Promise<SyncResponse> {
    try {
      const url = `/api/sync/credentials?deviceId=${this.deviceId}`;
      const response = await fetch(url);
      const result = await response.json();
      
      if (result.success && result.deviceId) {
        this.deviceId = result.deviceId;
        localStorage.setItem('portfolio_device_id', this.deviceId);
      }
      
      return result;
    } catch {
      return {
        success: false,
        error: 'Network error during credentials fetch'
      };
    }
  }

  async isOnline(): Promise<boolean> {
    if (typeof navigator === 'undefined') return false;
    return navigator.onLine;
  }

  getDeviceId(): string {
    return this.deviceId;
  }

  // Conflict resolution
  resolveConflict(localData: unknown, remoteData: unknown, localVersion: number, remoteVersion: number): unknown {
    // Simple conflict resolution: use the most recent data
    // In a more sophisticated implementation, you could merge changes
    if (remoteVersion > localVersion) {
      return remoteData;
    }
    return localData;
  }
}

// Create singleton instance
export const syncManager = new SyncManager();

