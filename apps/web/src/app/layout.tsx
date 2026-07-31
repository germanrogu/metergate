import type { ReactNode } from 'react';

export const metadata = {
  title: 'Metergate',
  description: 'AI usage metering & billing gateway dashboard',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
