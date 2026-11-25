import axios from '@/lib/httpClient';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

export type TransactionStatus =
  | 'pending'
  | 'confirmed'
  | 'failed'
  | 'cancelled'
  | 'processing';

export interface TransactionData {
  id: string;
  hash: string;
  status: TransactionStatus;
  blockNumber?: number;
  confirmations?: number;
  timestamp?: number;
  error?: string;
}

/**
 * Fetches transaction status from the blockchain/backend.
 * This is a simple service that the useTxTracker hook uses to avoid race conditions.
 */
export const transactionTrackerService = {
  async getTransactionStatus(txHash: string): Promise<TransactionData> {
    try {
      const { data } = await axios.get<TransactionData>(
        `${API_BASE_URL}/api/transactions/${txHash}`
      );
      return data;
    } catch (error) {
      console.error(`Failed to fetch transaction status for ${txHash}:`, error);
      throw error;
    }
  },

  /**
   * Fetches transaction statuses for multiple hashes.
   * Useful for batch operations.
   */
  async getTransactionStatuses(txHashes: string[]): Promise<TransactionData[]> {
    try {
      const { data } = await axios.post<TransactionData[]>(
        `${API_BASE_URL}/api/transactions/batch`,
        { hashes: txHashes }
      );
      return data;
    } catch (error) {
      console.error('Failed to fetch transaction statuses:', error);
      throw error;
    }
  },

  /**
   * Checks if a transaction status is terminal (no more changes expected).
   */
  isTerminalStatus(status: TransactionStatus): boolean {
    return status === 'confirmed' || status === 'failed' || status === 'cancelled';
  },
};
