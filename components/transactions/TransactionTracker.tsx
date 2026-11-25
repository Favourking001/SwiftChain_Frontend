'use client';

import React from 'react';
import { useTxTracker } from '@/hooks/useTxTracker';
import type { TransactionStatus } from '@/services/transactionTrackerService';

interface TransactionTrackerProps {
  txHash: string | null;
  onStatusChange?: (status: TransactionStatus | null) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
  pollInterval?: number;
  terminalDebounce?: number;
}

/**
 * Component that tracks blockchain transaction status.
 *
 * Usage:
 * ```tsx
 * <TransactionTracker
 *   txHash={hash}
 *   onStatusChange={(status) => console.log(status)}
 *   onComplete={() => console.log('Done!')}
 * />
 * ```
 *
 * This component wraps the useTxTracker hook and provides optional callbacks
 * for status changes, completion, and errors. It doesn't render anything by
 * default but can be customized via children render function or callbacks.
 */
export function TransactionTracker({
  txHash,
  onStatusChange,
  onComplete,
  onError,
  pollInterval,
  terminalDebounce,
}: TransactionTrackerProps) {
  const { tx, loading, error, status, stop } = useTxTracker(txHash, {
    pollInterval,
    terminalDebounce,
  });

  // Notify on status changes
  React.useEffect(() => {
    if (onStatusChange) {
      onStatusChange(status);
    }
  }, [status, onStatusChange]);

  // Notify on completion (terminal status reached)
  React.useEffect(() => {
    if (tx && onComplete && (status === 'confirmed' || status === 'failed' || status === 'cancelled')) {
      onComplete();
    }
  }, [tx, status, onComplete]);

  // Notify on error
  React.useEffect(() => {
    if (error && onError) {
      onError(error);
    }
  }, [error, onError]);

  // This component doesn't render UI, it just manages tracking and callbacks
  // Child components can be passed for custom UI rendering if needed
  return null;
}

interface TransactionStatusDisplayProps {
  status: TransactionStatus | null;
  loading: boolean;
  error: Error | null;
  confirmations?: number;
}

/**
 * Simple display component for transaction status.
 * Shows status badge with appropriate styling.
 */
export function TransactionStatusDisplay({
  status,
  loading,
  error,
  confirmations,
}: TransactionStatusDisplayProps) {
  const getStatusColor = (st: TransactionStatus | null) => {
    switch (st) {
      case 'confirmed':
        return 'bg-green-100 text-green-800';
      case 'failed':
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      case 'processing':
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (st: TransactionStatus | null) => {
    switch (st) {
      case 'confirmed':
        return 'Confirmed';
      case 'failed':
        return 'Failed';
      case 'cancelled':
        return 'Cancelled';
      case 'processing':
        return 'Processing';
      case 'pending':
        return 'Pending';
      default:
        return 'Unknown';
    }
  };

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded px-3 py-2">
        <p className="text-sm font-medium text-red-800">Error tracking transaction</p>
        <p className="text-xs text-red-700">{error.message}</p>
      </div>
    );
  }

  return (
    <div className={`rounded px-3 py-2 ${getStatusColor(status)}`}>
      <div className="flex items-center gap-2">
        {loading && (
          <div className="inline-block w-3 h-3 bg-current rounded-full animate-pulse" />
        )}
        <span className="text-sm font-medium">{getStatusLabel(status)}</span>
        {confirmations !== undefined && status === 'confirmed' && (
          <span className="text-xs opacity-75">({confirmations} confirmations)</span>
        )}
      </div>
    </div>
  );
}
