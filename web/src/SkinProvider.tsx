import { useMemo, type ReactNode } from 'react';
import { MantineProvider } from '@mantine/core';
import { useLocale } from './i18n';
import { buildTheme, cssVariablesResolver } from './theme';

/**
 * Mantine with the skin's theme, rebuilt when the interface language changes: the number field
 * takes its decimal separator from the language, and a theme built once at start would keep
 * the separator of whatever language the page opened in.
 */
export function SkinProvider({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const theme = useMemo(() => buildTheme(locale), [locale]);
  return (
    // one skin, no toggle: forceColorScheme also keeps Mantine from storing a colour scheme of
    // its own in localStorage
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} forceColorScheme="dark">
      {children}
    </MantineProvider>
  );
}
