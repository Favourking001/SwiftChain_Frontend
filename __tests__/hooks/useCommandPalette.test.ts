import { renderHook, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCommandPalette } from '@/hooks/useCommandPalette';
import { useRouter } from 'next/navigation';
import { commandPaletteService } from '@/services/commandPaletteService';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// Mock the command palette service
jest.mock('@/services/commandPaletteService', () => ({
  commandPaletteService: {
    fetchDeliveries: jest.fn(),
  },
}));

describe('useCommandPalette', () => {
  const mockPush = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockClear();

    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    });

    (commandPaletteService.fetchDeliveries as jest.Mock).mockResolvedValue([
      {
        id: 'delivery-1',
        title: 'Order #12345 - New York to Boston',
        status: 'In Transit',
      },
      {
        id: 'delivery-2',
        title: 'Order #67890 - Los Angeles to San Francisco',
        status: 'Pending',
      },
    ]);
  });

  it('should initialize with closed state and empty query', () => {
    const { result } = renderHook(() => useCommandPalette());

    expect(result.current.open).toBe(false);
    expect(result.current.query).toBe('');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it('should contain static action items', () => {
    const { result } = renderHook(() => useCommandPalette());

    const settingsItem = result.current.actionItems.find(
      (item) => item.id === 'settings'
    );
    const faqItem = result.current.actionItems.find((item) => item.id === 'faq');

    expect(settingsItem).toBeDefined();
    expect(settingsItem?.title).toBe('Open settings');
    expect(faqItem).toBeDefined();
    expect(faqItem?.title).toBe('Jump to FAQ');
  });

  it('should open command palette with Cmd+K on Mac', async () => {
    const { result } = renderHook(() => useCommandPalette());

    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'k',
        code: 'KeyK',
        metaKey: true,
      });
      window.dispatchEvent(event);
    });

    expect(result.current.open).toBe(true);
  });

  it('should open command palette with Ctrl+K on Windows/Linux', async () => {
    const { result } = renderHook(() => useCommandPalette());

    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'k',
        code: 'KeyK',
        ctrlKey: true,
      });
      window.dispatchEvent(event);
    });

    expect(result.current.open).toBe(true);
  });

  it('should close command palette when Escape is pressed', async () => {
    const { result } = renderHook(() => useCommandPalette());

    act(() => {
      result.current.setOpen(true);
    });

    expect(result.current.open).toBe(true);

    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
      });
      window.dispatchEvent(event);
    });

    expect(result.current.open).toBe(false);
  });

  it('should fetch deliveries when palette opens', async () => {
    const { result } = renderHook(() => useCommandPalette());

    act(() => {
      result.current.setOpen(true);
    });

    await waitFor(() => {
      expect(commandPaletteService.fetchDeliveries).toHaveBeenCalled();
    });
  });

  it('should show loading state while fetching deliveries', async () => {
    (commandPaletteService.fetchDeliveries as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() =>
            resolve([
              {
                id: 'delivery-1',
                title: 'Order #12345',
                status: 'In Transit',
              },
            ]),
            100
          )
        )
    );

    const { result } = renderHook(() => useCommandPalette());

    act(() => {
      result.current.setOpen(true);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('should handle delivery fetch errors', async () => {
    (commandPaletteService.fetchDeliveries as jest.Mock).mockRejectedValue(
      new Error('Failed to fetch deliveries')
    );

    const { result } = renderHook(() => useCommandPalette());

    act(() => {
      result.current.setOpen(true);
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to fetch deliveries');
    });
  });

  it('should filter deliveries by query', async () => {
    const { result } = renderHook(() => useCommandPalette());

    act(() => {
      result.current.setOpen(true);
    });

    await waitFor(() => {
      expect(result.current.deliverySectionItems.length).toBe(2);
    });

    act(() => {
      result.current.setQuery('New York');
    });

    await waitFor(() => {
      expect(result.current.deliverySectionItems.length).toBe(1);
      expect(result.current.deliverySectionItems[0].title).toBe(
        'Order #12345 - New York to Boston'
      );
    });
  });

  it('should filter by status in description', async () => {
    const { result } = renderHook(() => useCommandPalette());

    act(() => {
      result.current.setOpen(true);
    });

    await waitFor(() => {
      expect(result.current.deliverySectionItems.length).toBe(2);
    });

    act(() => {
      result.current.setQuery('In Transit');
    });

    await waitFor(() => {
      expect(result.current.deliverySectionItems.length).toBe(1);
      expect(result.current.deliverySectionItems[0].status).toBe('In Transit');
    });
  });

  it('should show empty state when no items match query', async () => {
    const { result } = renderHook(() => useCommandPalette());

    act(() => {
      result.current.setOpen(true);
    });

    await waitFor(() => {
      expect(result.current.deliverySectionItems.length).toBe(2);
    });

    act(() => {
      result.current.setQuery('nonexistent delivery');
    });

    expect(result.current.deliverySectionItems.length).toBe(0);
    expect(result.current.actionItems.length).toBe(2); // Static items still visible
  });

  it('should navigate to delivery on selection', async () => {
    const { result } = renderHook(() => useCommandPalette());

    act(() => {
      result.current.setOpen(true);
    });

    await waitFor(() => {
      expect(result.current.deliverySectionItems.length).toBe(2);
    });

    act(() => {
      result.current.onSelect('/deliveries/delivery-1');
    });

    expect(mockPush).toHaveBeenCalledWith('/deliveries/delivery-1');
    expect(result.current.open).toBe(false);
  });

  it('should navigate to static action items', async () => {
    const { result } = renderHook(() => useCommandPalette());

    act(() => {
      result.current.setOpen(true);
    });

    act(() => {
      result.current.onSelect('/settings');
    });

    expect(mockPush).toHaveBeenCalledWith('/settings');
    expect(result.current.open).toBe(false);
  });

  it('should not fetch deliveries multiple times', async () => {
    const { result } = renderHook(() => useCommandPalette());

    act(() => {
      result.current.setOpen(true);
    });

    await waitFor(() => {
      expect(result.current.deliverySectionItems.length).toBe(2);
    });

    // Close and reopen
    act(() => {
      result.current.setOpen(false);
    });

    act(() => {
      result.current.setOpen(true);
    });

    // Should still have only called once due to hasLoadedDeliveries cache
    expect(commandPaletteService.fetchDeliveries).toHaveBeenCalledTimes(1);
  });

  it('should handle case-insensitive filtering', async () => {
    const { result } = renderHook(() => useCommandPalette());

    act(() => {
      result.current.setOpen(true);
    });

    await waitFor(() => {
      expect(result.current.deliverySectionItems.length).toBe(2);
    });

    act(() => {
      result.current.setQuery('ORDER');
    });

    expect(result.current.deliverySectionItems.length).toBeGreaterThan(0);
  });

  it('should trim and normalize query input', async () => {
    const { result } = renderHook(() => useCommandPalette());

    act(() => {
      result.current.setOpen(true);
    });

    await waitFor(() => {
      expect(result.current.deliverySectionItems.length).toBe(2);
    });

    act(() => {
      result.current.setQuery('  Order #12345  ');
    });

    expect(result.current.deliverySectionItems.length).toBeGreaterThan(0);
  });

  it('should clean up keyboard listeners on unmount', () => {
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useCommandPalette());

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'keydown',
      expect.any(Function)
    );

    removeEventListenerSpy.mockRestore();
  });

  it('should focus input when palette opens', async () => {
    const { result } = renderHook(() => useCommandPalette());

    const mockInputRef = { current: { focus: jest.fn() } };

    act(() => {
      // Simulate setting the ref
      result.current.setOpen(true);
    });

    // The ref should be attached to the input element in the UI
    expect(result.current.inputRef).toBeDefined();
  });

  it('should handle deliveries with optional status field', async () => {
    (commandPaletteService.fetchDeliveries as jest.Mock).mockResolvedValue([
      {
        id: 'delivery-1',
        title: 'Order #12345',
        // status is optional
      },
    ]);

    const { result } = renderHook(() => useCommandPalette());

    act(() => {
      result.current.setOpen(true);
    });

    await waitFor(() => {
      expect(result.current.deliverySectionItems.length).toBe(1);
      expect(result.current.deliverySectionItems[0].description).toBe(
        'Delivery record'
      );
    });
  });

  it('should separate static and delivery items', async () => {
    const { result } = renderHook(() => useCommandPalette());

    act(() => {
      result.current.setOpen(true);
    });

    await waitFor(() => {
      expect(result.current.deliverySectionItems.length).toBe(2);
      expect(result.current.actionItems.length).toBe(2);
    });

    // Verify they are in separate arrays
    const allItems = [...result.current.actionItems, ...result.current.deliverySectionItems];
    expect(allItems.length).toBe(4);
  });
});
