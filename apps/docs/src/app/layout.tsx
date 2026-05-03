import './global.css';
import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { RootProvider } from 'fumadocs-ui/provider/next';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: {
    default: '@interlace/serverless — TypeScript Serverless Plugins',
    template: '%s | @interlace/serverless',
  },
  description:
    'TypeScript-native Serverless Framework plugins — caching, devkit, and more. Zero dependencies, full IntelliSense, proper cleanup.',
  metadataBase: new URL('https://serverless.interlace.tools'),
  openGraph: {
    title: '@interlace/serverless',
    description:
      'TypeScript-native Serverless Framework plugins that fix what the community forgot.',
    url: 'https://serverless.interlace.tools',
    siteName: '@interlace/serverless',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '@interlace/serverless',
    description:
      'TypeScript-native Serverless Framework plugins — caching, devkit, and more.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
