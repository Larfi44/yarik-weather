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
      <body>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Intercept all link clicks and navigate to external URLs via Tauri opener
              document.addEventListener('click', function(e) {
                var a = e.target.closest('a[href]');
                if (!a) return;
                var href = a.getAttribute('href');
                if (!href) return;
                // Only intercept external http(s) links
                if (href.startsWith('http://') || href.startsWith('https://')) {
                  e.preventDefault();
                  e.stopPropagation();
                  // Open in the system browser via the Tauri opener plugin.
                  // Note: a raw import('@tauri-apps/plugin-opener') does NOT work
                  // here — this string is injected at runtime and is never seen
                  // by the bundler, so the bare specifier fails to resolve and
                  // the app would fall back to in-app navigation on Android.
                  // Calling the underlying IPC command directly works everywhere.
                  if (window.__TAURI_INTERNALS__) {
                    try {
                      window.__TAURI_INTERNALS__
                        .invoke('plugin:opener|open_url', { url: href })
                        .catch(function (err) {
                          console.error('Failed to open URL:', err);
                          window.open(href, '_blank', 'noopener,noreferrer');
                        });
                    } catch (err) {
                      window.open(href, '_blank', 'noopener,noreferrer');
                    }
                  } else {
                    window.open(href, '_blank', 'noopener,noreferrer');
                  }
                }
              }, true);
            `,
          }}
        />
      </body>
    </html>
  );
}
