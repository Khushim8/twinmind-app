'use client';

import { SettingsProvider } from '@/components/SettingsProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  return <SettingsProvider>{children}</SettingsProvider>;
}