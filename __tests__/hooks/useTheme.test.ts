import { renderHook, act } from '@testing-library/react';
import { useTheme } from '@/hooks/useTheme';
import { useTheme as useNextTheme } from 'next-themes';
import { themeService } from '@/services/themeService';

// Mock next-themes
jest.mock('next-themes', () => ({
  useTheme: jest.fn(),
}));

// Mock the theme service
jest.mock('@/services/themeService', () => ({
  themeService: {
    getStoredThemePreference: jest.fn(),
    setStoredThemePreference: jest.fn(),
    getThemePreference: jest.fn(),
    saveThemePreference: jest.fn(),
  },
}));

describe('useTheme', () => {
  const mockSetTheme = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockSetTheme.mockClear();

    (useNextTheme as jest.Mock).mockReturnValue({
      theme: 'dark',
      resolvedTheme: 'dark',
      setTheme: mockSetTheme,
    });

    (themeService.getStoredThemePreference as jest.Mock).mockReturnValue(null);
  });

  it('should return theme, resolvedTheme, setTheme, and toggleTheme', () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current).toHaveProperty('theme');
    expect(result.current).toHaveProperty('resolvedTheme');
    expect(result.current).toHaveProperty('setTheme');
    expect(result.current).toHaveProperty('toggleTheme');
  });

  it('should use stored theme preference on mount', async () => {
    (themeService.getStoredThemePreference as jest.Mock).mockReturnValue('light');

    renderHook(() => useTheme());

    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });

  it('should fetch theme from backend when no stored preference exists', async () => {
    (themeService.getStoredThemePreference as jest.Mock).mockReturnValue(null);
    (themeService.getThemePreference as jest.Mock).mockResolvedValue({
      theme: 'dark',
    });

    renderHook(() => useTheme());

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(themeService.getThemePreference).toHaveBeenCalled();
    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });

  it('should handle API errors gracefully when fetching theme preference', async () => {
    (themeService.getStoredThemePreference as jest.Mock).mockReturnValue(null);
    (themeService.getThemePreference as jest.Mock).mockRejectedValue(
      new Error('API error')
    );

    // Should not throw
    renderHook(() => useTheme());

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(themeService.getThemePreference).toHaveBeenCalled();
  });

  it('should toggle theme from dark to light', async () => {
    (useNextTheme as jest.Mock).mockReturnValue({
      theme: 'dark',
      resolvedTheme: 'dark',
      setTheme: mockSetTheme,
    });

    (themeService.saveThemePreference as jest.Mock).mockResolvedValue({
      theme: 'light',
    });

    const { result } = renderHook(() => useTheme());

    await act(async () => {
      await result.current.toggleTheme();
    });

    expect(mockSetTheme).toHaveBeenCalledWith('light');
    expect(themeService.saveThemePreference).toHaveBeenCalledWith('light');
  });

  it('should toggle theme from light to dark', async () => {
    (useNextTheme as jest.Mock).mockReturnValue({
      theme: 'light',
      resolvedTheme: 'light',
      setTheme: mockSetTheme,
    });

    (themeService.saveThemePreference as jest.Mock).mockResolvedValue({
      theme: 'dark',
    });

    const { result } = renderHook(() => useTheme());

    await act(async () => {
      await result.current.toggleTheme();
    });

    expect(mockSetTheme).toHaveBeenCalledWith('dark');
    expect(themeService.saveThemePreference).toHaveBeenCalledWith('dark');
  });

  it('should handle theme persistence failures gracefully', async () => {
    (useNextTheme as jest.Mock).mockReturnValue({
      theme: 'light',
      resolvedTheme: 'light',
      setTheme: mockSetTheme,
    });

    (themeService.saveThemePreference as jest.Mock).mockRejectedValue(
      new Error('localStorage unavailable')
    );

    const { result } = renderHook(() => useTheme());

    // Should not throw
    await act(async () => {
      await result.current.toggleTheme();
    });

    // UI should still toggle even if save fails
    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });

  it('should cancel async operations on unmount', async () => {
    (themeService.getStoredThemePreference as jest.Mock).mockReturnValue(null);
    (themeService.getThemePreference as jest.Mock).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ theme: 'dark' }), 1000))
    );

    const { unmount } = renderHook(() => useTheme());

    // Unmount before async operation completes
    unmount();

    await new Promise((resolve) => setTimeout(resolve, 1200));

    // setTheme should not be called after unmount
    expect(mockSetTheme).not.toHaveBeenCalledWith('dark');
  });

  it('should prioritize stored preference over backend preference', async () => {
    (themeService.getStoredThemePreference as jest.Mock).mockReturnValue('light');
    (themeService.getThemePreference as jest.Mock).mockResolvedValue({
      theme: 'dark',
    });

    renderHook(() => useTheme());

    // Stored preference should be used immediately
    expect(mockSetTheme).toHaveBeenCalledWith('light');

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Backend should not be called if stored preference exists
    expect(themeService.getThemePreference).not.toHaveBeenCalled();
  });

  it('should save theme preference to storage on toggle', async () => {
    (useNextTheme as jest.Mock).mockReturnValue({
      theme: 'dark',
      resolvedTheme: 'dark',
      setTheme: mockSetTheme,
    });

    (themeService.saveThemePreference as jest.Mock).mockResolvedValue({
      theme: 'light',
    });

    const { result } = renderHook(() => useTheme());

    await act(async () => {
      await result.current.toggleTheme();
    });

    expect(themeService.saveThemePreference).toHaveBeenCalledWith('light');
  });

  it('should handle system theme fallback', async () => {
    (themeService.getStoredThemePreference as jest.Mock).mockReturnValue(null);
    (themeService.getThemePreference as jest.Mock).mockRejectedValue(
      new Error('API unavailable')
    );

    renderHook(() => useTheme());

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should have attempted to fetch preference
    expect(themeService.getThemePreference).toHaveBeenCalled();
  });
});
