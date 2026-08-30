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
                  // Try Tauri opener plugin if available
                  if (window.__TAURI_INTERNALS__) {
                    try {
                      import('@tauri-apps/plugin-opener').then(function(mod) {
                        mod.openUrl(href);
                      }).catch(function() {
                        window.open(href, '_blank', 'noopener,noreferrer');
                      });
                    } catch(err) {
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
