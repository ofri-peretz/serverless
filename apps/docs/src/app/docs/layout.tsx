import { source } from '#interlace/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';
import { buildPillarIcons } from '#interlace/layouts/pillar-icons';
import { Shield, Wrench, BookOpen } from 'lucide-react';

const { transform } = buildPillarIcons({
  plugins: { icon: Shield, color: 'purple' },
  'serverless-devkit': { icon: Wrench, color: 'blue' },
  guides: { icon: BookOpen, color: 'emerald' },
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <DocsLayout
      tree={source.getPageTree()}
      {...baseOptions()}
      sidebar={{
        tabs: { transform },
        defaultOpenLevel: 1,
      }}
    >
      {children}
    </DocsLayout>
  );
}
