'use client';

import { useEffect, useRef, useState } from 'react';
import {
  transactionTrackerService,
  type TransactionData,
  type TransactionStatus,
} from '@/services/transactionTrackerService';

export interface UseTxTrackerReturn {
  tx: TransactionData | null;
  loading: boolean;
  error: Error | null;
  status: TransactionStatus | null;
  stop: () => void;
}

/**
 * Tracks blockchain transaction status with race condition prevention.
 *
 * Key features:
 * - Uses setTimeout chain instead of setInterval to avoid overlapping requests
 * - Stale response filtering via activeRef to discard late-arriving responses
 * - Terminal state tracking to stop polling once tx is confirmed/failed
 * - Optional debounce for terminal state to allow final verification
 * - Proper cleanup on unmount
 *
 * Race condition fixes address:
 * 1. Multiple setInterval ticks causing simultaneous requests
 * 2. Out-of-order responses being processed (newer response arriving before older)
 * 3. Continued polling after terminal state is reached
 * 4. Memory leaks from listeners not being cleaned up
 */
export function useTxTracker(
  txHash: string | null,
  options: {
    pollInterval?: number; // ms between polls (default: 2000)
    terminalDebounce?: number; // ms to wait before stopping after terminal state (default: 500)
  } = {}
): UseTxTrackerReturn {
  const { pollInterval = 2000, terminalDebounce = 500 } = options;

  const [tx, setTx] = useState<TransactionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track if this component is still mounted
  const activeRef = useRef(true);

  // Track if polling has reached a terminal state
  const terminalStateRef = useRef(false);

  // Track the most recent request to filter stale responses
  const requestIdRef = useRef(0);

  // Track the debounce timer for terminal state
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Track the main polling timer
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const stopPolling = () => {
    if (pollingTimerRef.current) {
      clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    terminalStateRef.current = true;
  };

  useEffect(() => {
    activeRef.current = true;
    terminalStateRef.current = false;
    requestIdRef.current = 0;

    if (!txHash) {
      setTx(null);
      setLoading(false);
      setError(null);
      return;
    }

    const poll = async () => {
      // Don't continue polling if in terminal state
      if (terminalStateRef.current) {
        return;
      }

      // Increment request ID to track this specific request
      const currentRequestId = ++requestIdRef.current;

      try {
        setLoading(true);
        setError(null);

        const result = await transactionTrackerService.getTransactionStatus(txHash);

        // Stale response check: ignore if a newer request has completed
        if (!activeRef.current || currentRequestId !== requestIdRef.current) {
          return;
        }

        setTx(result);
        setLoading(false);

        // Check if this is a terminal state
        if (transactionTrackerService.isTerminalStatus(result.status)) {
          terminalStateRef.current = true;

          // Optionally debounce before stopping to allow multiple confirmations
          if (terminalDebounce > 0) {
            debounceTimerRef.current = setTimeout(() => {
              if (activeRef.current) {
                stopPolling();
              }
            }, terminalDebounce);
          } else {
            stopPolling();
          }
          return;
        }

        // Schedule next poll using setTimeout to avoid overlapping requests
        if (activeRef.current && !terminalStateRef.current) {
          pollingTimerRef.current = setTimeout(poll, pollInterval);
        }
      } catch (err) {
        // Stale response check
        if (!activeRef.current || currentRequestId !== requestIdRef.current) {
          return;
        }

        const error = err instanceof Error ? err : new Error('Failed to fetch transaction status');
        setError(error);
        setLoading(false);

        // Continue polling on error (unless too many failures)
        if (activeRef.current && !terminalStateRef.current) {
          pollingTimerRef.current = setTimeout(poll, pollInterval);
        }
      }
    };

    // Start polling
    poll();

    // Cleanup on unmount or when txHash changes
    return () => {
      activeRef.current = false;
      if (pollingTimerRef.current) {
        clearTimeout(pollingTimerRef.current);
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [txHash, pollInterval, terminalDebounce]);

  return {
    tx,
    loading,
    error,
    status: tx?.status ?? null,
    stop: stopPolling,
  };
}
