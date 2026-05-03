import './global.css';
import type { ReactNode } from 'react';
import {
  createRootMetadata,
  DocsRootLayout,
} from '#interlace/layouts/root-layout';

export const metadata = createRootMetadata({
  title: '@interlace/serverless — TypeScript Serverless Plugins',
  titleTemplate: '%s | @interlace/serverless',
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
  metadataBase: 'https://serverless.interlace.tools',
  siteName: '@interlace/serverless',
  applicationName: 'Interlace Serverless',
});

export default function Layout({ children }: { children: ReactNode }) {
  return <DocsRootLayout>{children}</DocsRootLayout>;
}
