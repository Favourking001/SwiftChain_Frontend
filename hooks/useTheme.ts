'use client';

import { useCallback, useEffect } from 'react';
import { useTheme as useNextTheme } from 'next-themes';
import { themeService, type ThemePreference } from '@/services/themeService';

/**
 * useTheme — OS-aware theme hook.
 *
 * Bridges the `next-themes` runtime context with the app's theme service so
 * that preferences are persisted locally and, when a local override is
 * absent, hydrated from the backend.
 *
 * Resolution order:
 * 1. Stored manual override (light/dark)
 * 2. OS preference (via system media query)
 * 3. Backend preference
 * 4. Default (light)
 *
 * Follows the Component → Hook → Service pattern:
 *   ThemeToggle (component) → useTheme (hook) → themeService (service)
 */
export function useTheme() {
  const { theme, resolvedTheme, setTheme } = useNextTheme();

  // On load, prefer a stored local override; otherwise fall back to the
  // authoritative backend preference.
  useEffect(() => {
    const initializeTheme = async () => {
      const storedPreference = themeService.getStoredThemePreference();
      
      if (storedPreference) {
        // Use stored manual override
        setTheme(storedPreference);
        return;
      }

      // No manual override, so listen for OS theme changes
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      
      const handleOSThemeChange = (e: MediaQueryListEvent) => {
        setTheme(e.matches ? 'dark' : 'light');
      };

      mediaQuery.addEventListener('change', handleOSThemeChange);

      // Fetch backend preference as secondary fallback
      let cancelled = false;

      try {
        const { theme: apiTheme } = await themeService.getThemePreference();
        if (!cancelled) {
          setTheme(apiTheme);
        }
      } catch (error) {
        // Fall back to the system/default theme when the API is unavailable.
        console.warn('Failed to fetch theme preference from backend:', error);
        // OS preference is already applied by next-themes
      }

      return () => {
        cancelled = true;
        mediaQuery.removeEventListener('change', handleOSThemeChange);
      };
    };

    return initializeTheme().then((cleanup) => cleanup);
  }, [setTheme]);

  const toggleTheme = useCallback(async () => {
    const nextTheme: ThemePreference =
      resolvedTheme === 'dark' ? 'light' : 'dark';

    setTheme(nextTheme);

    try {
      await themeService.saveThemePreference(nextTheme);
    } catch (error) {
      // Persistence failures must not break the UI toggle.
      console.warn('Failed to save theme preference:', error);
    }
  }, [resolvedTheme, setTheme]);

  return { theme, resolvedTheme, setTheme, toggleTheme } as const;
}
