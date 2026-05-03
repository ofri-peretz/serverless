import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';
import { Shield, Wrench, BookOpen } from 'lucide-react';

// Colored pillar icons for sidebar tabs
const pillarIcons: Record<string, React.ReactNode> = {
  plugins: (
    <div className="flex size-5 shrink-0 items-center justify-center rounded bg-gradient-to-t from-purple-600 to-purple-500 text-white">
      <Shield className="size-3.5" />
    </div>
  ),
  'serverless-devkit': (
    <div className="flex size-5 shrink-0 items-center justify-center rounded bg-gradient-to-t from-blue-600 to-blue-500 text-white">
      <Wrench className="size-3.5" />
    </div>
  ),
  guides: (
    <div className="flex size-5 shrink-0 items-center justify-center rounded bg-gradient-to-t from-emerald-600 to-emerald-500 text-white">
      <BookOpen className="size-3.5" />
    </div>
  ),
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <DocsLayout
      tree={source.getPageTree()}
      {...baseOptions()}
      sidebar={{
        tabs: {
          transform: (option, node) => {
            const nodeName = typeof node.name === 'string' ? node.name : '';
            const folderName = nodeName.toLowerCase().replace(/\s+/g, '-');
            return {
              ...option,
              icon: pillarIcons[folderName] || option.icon,
            };
          },
        },
        defaultOpenLevel: 1,
      }}
    >
      {children}
    </DocsLayout>
  );
}
