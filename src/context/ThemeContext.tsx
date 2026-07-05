import React, { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';
import { lightTheme, darkTheme } from '@/design/tokens';
import type { Theme } from '@/design/tokens';

const ThemeContext = createContext<Theme>(lightTheme);

export function ThemeProvider({ children }: React.PropsWithChildren) {
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? darkTheme : lightTheme;
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): Theme {
  return useContext(ThemeContext);
}
