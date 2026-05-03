import type { ReactNode } from 'react';
import { HomeLayout } from 'fumadocs-ui/layouts/home';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <HomeLayout
      nav={{
        title: (
          <span className="font-semibold">
            <span className="text-fd-primary">@interlace</span>
            <span className="text-fd-muted-foreground">/serverless</span>
          </span>
        ),
        url: '/',
      }}
      links={[
        { text: 'Docs', url: '/docs/getting-started', active: 'url' },
        {
          text: 'GitHub',
          url: 'https://github.com/ofri-peretz/serverless',
          external: true,
        },
      ]}
    >
      {children}
    </HomeLayout>
  );
}
