import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';
import { Inter } from 'next/font/google';
import type { Metadata } from 'next';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  preload: true,
});

export const metadata: Metadata = {
  title: {
    default: '@interlace/serverless — TypeScript Serverless Plugins',
    template: '%s | @interlace/serverless',
  },
  description:
    'TypeScript-native replacements for community Serverless Framework plugins. Zero dependencies. Full IntelliSense. No ghost billing.',
  keywords: [
    'Serverless Framework',
    'AWS',
    'API Gateway',
    'caching',
    'TypeScript',
    'plugins',
    'serverless',
    'infrastructure',
  ],
  authors: [{ name: 'Ofri Peretz', url: 'https://ofriperetz.dev' }],
  creator: 'Ofri Peretz',
  metadataBase: new URL('https://serverless.interlace.tools'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: '@interlace/serverless',
    url: 'https://serverless.interlace.tools',
  },
  twitter: {
    card: 'summary_large_image',
  },
  applicationName: 'Interlace Serverless',
  category: 'technology',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
