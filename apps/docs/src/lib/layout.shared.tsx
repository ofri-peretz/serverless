import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

/**
 * Shared layout options for @interlace/serverless documentation
 * Used by both docs and homepage layouts
 */
export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <span className="font-semibold">@interlace/serverless</span>
        </>
      ),
      transparentMode: 'top',
    },
    links: [
      {
        text: 'Docs',
        url: '/docs/getting-started',
        active: 'nested-url',
      },
    ],
    githubUrl: 'https://github.com/ofri-peretz/serverless',
  };
}
