import { renderHook, act, waitFor } from '@testing-library/react';
import { useTxTracker } from '@/hooks/useTxTracker';
import { transactionTrackerService } from '@/services/transactionTrackerService';

// Mock the transaction tracker service
jest.mock('@/services/transactionTrackerService', () => ({
  transactionTrackerService: {
    getTransactionStatus: jest.fn(),
    getTransactionStatuses: jest.fn(),
    isTerminalStatus: jest.fn((status) =>
      status === 'confirmed' || status === 'failed' || status === 'cancelled'
    ),
  },
}));

describe('useTxTracker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('should initialize with null state when no txHash provided', () => {
    const { result } = renderHook(() => useTxTracker(null));

    expect(result.current.tx).toBeNull();
    expect(result.current.status).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should fetch initial transaction status', async () => {
    (transactionTrackerService.getTransactionStatus as jest.Mock).mockResolvedValue({
      id: 'tx-1',
      hash: '0x123',
      status: 'pending',
    });

    const { result } = renderHook(() => useTxTracker('0x123'));

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tx).toEqual({
      id: 'tx-1',
      hash: '0x123',
      status: 'pending',
    });

    expect(result.current.status).toBe('pending');
  });

  it('should handle fetch errors gracefully', async () => {
    const error = new Error('Network error');
    (transactionTrackerService.getTransactionStatus as jest.Mock).mockRejectedValue(error);

    const { result } = renderHook(() => useTxTracker('0x123'));

    await waitFor(() => {
      expect(result.current.error).toEqual(error);
    });

    expect(result.current.tx).toBeNull();
  });

  it('should poll for status updates using setTimeout chain', async () => {
    (transactionTrackerService.getTransactionStatus as jest.Mock)
      .mockResolvedValueOnce({ id: 'tx-1', hash: '0x123', status: 'pending' })
      .mockResolvedValueOnce({ id: 'tx-1', hash: '0x123', status: 'processing' });

    const { result } = renderHook(() => useTxTracker('0x123', { pollInterval: 1000 }));

    await waitFor(() => {
      expect(result.current.tx?.status).toBe('pending');
    });

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(result.current.tx?.status).toBe('processing');
    });
  });

  it('should stop polling when terminal status is reached', async () => {
    (transactionTrackerService.getTransactionStatus as jest.Mock).mockResolvedValue({
      id: 'tx-1',
      hash: '0x123',
      status: 'confirmed',
    });

    const { result } = renderHook(() => useTxTracker('0x123'));

    await waitFor(() => {
      expect(result.current.status).toBe('confirmed');
    });

    // Verify that the service is not called again
    const callCount = (transactionTrackerService.getTransactionStatus as jest.Mock).mock.calls
      .length;

    act(() => {
      jest.advanceTimersByTime(10000);
    });

    // Service should not be called again
    expect((transactionTrackerService.getTransactionStatus as jest.Mock).mock.calls.length).toBe(
      callCount
    );
  });

  it('should filter stale responses (race condition)', async () => {
    let resolveFirstCall: ((value: any) => void) | null = null;
    let resolveSecondCall: ((value: any) => void) | null = null;

    (transactionTrackerService.getTransactionStatus as jest.Mock)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstCall = resolve;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecondCall = resolve;
          })
      );

    const { result } = renderHook(() => useTxTracker('0x123', { pollInterval: 1000 }));

    // Start second request before first completes
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // Resolve second request first (arrived out of order)
    if (resolveSecondCall) {
      await act(async () => {
        resolveSecondCall!({
          id: 'tx-1',
          hash: '0x123',
          status: 'processing',
        });
      });
    }

    // Resolve first request after (stale)
    if (resolveFirstCall) {
      await act(async () => {
        resolveFirstCall!({
          id: 'tx-1',
          hash: '0x123',
          status: 'pending',
        });
      });
    }

    await waitFor(() => {
      // Should have the newer response (processing), not the stale one (pending)
      expect(result.current.status).toBe('processing');
    });
  });

  it('should stop polling when stop() is called', async () => {
    (transactionTrackerService.getTransactionStatus as jest.Mock)
      .mockResolvedValueOnce({ id: 'tx-1', hash: '0x123', status: 'pending' })
      .mockResolvedValueOnce({ id: 'tx-1', hash: '0x123', status: 'processing' });

    const { result } = renderHook(() => useTxTracker('0x123', { pollInterval: 1000 }));

    await waitFor(() => {
      expect(result.current.status).toBe('pending');
    });

    act(() => {
      result.current.stop();
    });

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    // Status should still be pending, not processing
    expect(result.current.status).toBe('pending');
  });

  it('should clean up timers on unmount', async () => {
    (transactionTrackerService.getTransactionStatus as jest.Mock).mockResolvedValue({
      id: 'tx-1',
      hash: '0x123',
      status: 'pending',
    });

    const { unmount } = renderHook(() => useTxTracker('0x123', { pollInterval: 1000 }));

    await waitFor(() => {
      expect(transactionTrackerService.getTransactionStatus).toHaveBeenCalled();
    });

    unmount();

    // Advance timers - should not cause any additional calls
    act(() => {
      jest.advanceTimersByTime(10000);
    });

    // Service should have been called only once (initial call)
    expect((transactionTrackerService.getTransactionStatus as jest.Mock).mock.calls.length).toBe(
      1
    );
  });

  it('should handle multiple status transitions', async () => {
    (transactionTrackerService.getTransactionStatus as jest.Mock)
      .mockResolvedValueOnce({ id: 'tx-1', hash: '0x123', status: 'pending' })
      .mockResolvedValueOnce({ id: 'tx-1', hash: '0x123', status: 'processing' })
      .mockResolvedValueOnce({ id: 'tx-1', hash: '0x123', status: 'confirmed' });

    const { result } = renderHook(() => useTxTracker('0x123', { pollInterval: 100 }));

    await waitFor(() => {
      expect(result.current.status).toBe('pending');
    });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(result.current.status).toBe('processing');
    });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(result.current.status).toBe('confirmed');
    });

    // Should stop polling after terminal state
    expect((transactionTrackerService.getTransactionStatus as jest.Mock).mock.calls.length).toBe(
      3
    );
  });

  it('should handle txHash change', async () => {
    (transactionTrackerService.getTransactionStatus as jest.Mock)
      .mockResolvedValueOnce({ id: 'tx-1', hash: '0x123', status: 'pending' })
      .mockResolvedValueOnce({ id: 'tx-2', hash: '0x456', status: 'processing' });

    const { result, rerender } = renderHook(
      ({ hash }) => useTxTracker(hash),
      { initialProps: { hash: '0x123' } }
    );

    await waitFor(() => {
      expect(result.current.tx?.hash).toBe('0x123');
    });

    rerender({ hash: '0x456' });

    await waitFor(() => {
      expect(result.current.tx?.hash).toBe('0x456');
    });
  });

  it('should debounce terminal state before stopping', async () => {
    (transactionTrackerService.getTransactionStatus as jest.Mock).mockResolvedValue({
      id: 'tx-1',
      hash: '0x123',
      status: 'confirmed',
    });

    const { result } = renderHook(() =>
      useTxTracker('0x123', { pollInterval: 1000, terminalDebounce: 500 })
    );

    await waitFor(() => {
      expect(result.current.status).toBe('confirmed');
    });

    // Debounce timer should be pending
    act(() => {
      jest.advanceTimersByTime(300);
    });

    // Should still have confirmed status
    expect(result.current.status).toBe('confirmed');

    act(() => {
      jest.advanceTimersByTime(300);
    });

    // Now debounce should have expired and polling should stop
    // No additional calls should be made
    expect((transactionTrackerService.getTransactionStatus as jest.Mock).mock.calls.length).toBe(
      1
    );
  });

  it('should handle failed transaction status', async () => {
    (transactionTrackerService.getTransactionStatus as jest.Mock).mockResolvedValue({
      id: 'tx-1',
      hash: '0x123',
      status: 'failed',
      error: 'Out of gas',
    });

    const { result } = renderHook(() => useTxTracker('0x123'));

    await waitFor(() => {
      expect(result.current.status).toBe('failed');
      expect(result.current.tx?.error).toBe('Out of gas');
    });

    // Should stop polling after failure
    expect((transactionTrackerService.getTransactionStatus as jest.Mock).mock.calls.length).toBe(
      1
    );
  });

  it('should handle cancelled transaction status', async () => {
    (transactionTrackerService.getTransactionStatus as jest.Mock).mockResolvedValue({
      id: 'tx-1',
      hash: '0x123',
      status: 'cancelled',
    });

    const { result } = renderHook(() => useTxTracker('0x123'));

    await waitFor(() => {
      expect(result.current.status).toBe('cancelled');
    });

    // Should stop polling
    expect((transactionTrackerService.getTransactionStatus as jest.Mock).mock.calls.length).toBe(
      1
    );
  });

  it('should continue polling on non-terminal errors', async () => {
    (transactionTrackerService.getTransactionStatus as jest.Mock)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ id: 'tx-1', hash: '0x123', status: 'pending' });

    const { result } = renderHook(() => useTxTracker('0x123', { pollInterval: 100 }));

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(result.current.status).toBe('pending');
    });

    // Should have called twice (error + retry)
    expect((transactionTrackerService.getTransactionStatus as jest.Mock).mock.calls.length).toBe(
      2
    );
  });

  it('should handle transaction with block number and confirmations', async () => {
    (transactionTrackerService.getTransactionStatus as jest.Mock).mockResolvedValue({
      id: 'tx-1',
      hash: '0x123',
      status: 'confirmed',
      blockNumber: 15000000,
      confirmations: 12,
      timestamp: 1234567890,
    });

    const { result } = renderHook(() => useTxTracker('0x123'));

    await waitFor(() => {
      expect(result.current.tx).toEqual({
        id: 'tx-1',
        hash: '0x123',
        status: 'confirmed',
        blockNumber: 15000000,
        confirmations: 12,
        timestamp: 1234567890,
      });
    });
  });
});
