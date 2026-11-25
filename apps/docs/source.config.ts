import {
  defineConfig,
  defineDocs,
  frontmatterSchema,
  metaSchema,
} from 'fumadocs-mdx/config';
import { transformerTwoslash } from 'fumadocs-twoslash';
import { rehypeCodeDefaultOptions } from 'fumadocs-core/mdx-plugins';
import { remarkInstallTabs } from './.interlace/config/remark-install-tabs.mjs';
import { rehypeTableStack } from './.interlace/config/rehype-table-stack.mjs';

export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: frontmatterSchema,
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

export default defineConfig({
  mdxOptions: {
    // `npm install` fences become npm/pnpm/yarn/bun tabs; tables fold into cards on a
    // narrow column (styles in `.interlace/css/table-stack.css`).
    remarkPlugins: [remarkInstallTabs],
    rehypePlugins: [rehypeTableStack],
    rehypeCodeOptions: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
      transformers: [
        ...(rehypeCodeDefaultOptions.transformers ?? []),
        transformerTwoslash(),
      ],
      langs: [
        'js',
        'jsx',
        'ts',
        'tsx',
        'json',
        'bash',
        'sh',
        'yaml',
        'md',
        'mdx',
        'diff',
      ],
    },
  },
});
