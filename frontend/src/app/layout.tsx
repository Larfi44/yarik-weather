import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Yarik Weather',
  description: 'Weather app with AI recommendations',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
