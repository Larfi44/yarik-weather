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
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var settings = JSON.parse(localStorage.getItem('weather_settings') || '{}');
                  var theme = settings.theme || 'auto';
                  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  var isDark = theme === 'dark' || (theme === 'auto' && prefersDark);
                  document.documentElement.classList.add(isDark ? 'theme-dark' : 'theme-light');
                } catch(e) {
                  document.documentElement.classList.add('theme-light');
                }
              })();
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
