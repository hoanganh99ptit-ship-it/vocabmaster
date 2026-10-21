import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type AppTheme = 'cinema' | 'retro' | 'modern';

interface ThemeContextType {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
}

const THEME_KEY = 'vocabmaster_theme';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'modern' || saved === 'retro' || saved === 'cinema') return saved as AppTheme;
      return 'cinema'; // Mặc định chế độ 35mm Film Vlog mới theo yêu cầu!
    } catch {
      return 'cinema';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore
    }

    document.documentElement.classList.remove('theme-retro', 'theme-cinema');
    if (theme === 'cinema') {
      document.documentElement.classList.add('theme-cinema');
    } else if (theme === 'retro') {
      document.documentElement.classList.add('theme-retro');
    }
  }, [theme]);

  const setTheme = (newTheme: AppTheme) => {
    setThemeState(newTheme);
  };

  const toggleTheme = () => {
    setThemeState((prev) => {
      if (prev === 'cinema') return 'retro';
      if (prev === 'retro') return 'modern';
      return 'cinema';
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
