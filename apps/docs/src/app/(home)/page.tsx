import Link from 'next/link';
import {
  Shield,
  Zap,
  Terminal,
  Package,
  ArrowRight,
  Code2,
  Trash2,
  RefreshCw,
} from 'lucide-react';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col">
      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center gap-6 overflow-hidden px-6 py-24 text-center md:py-36">
        {/* Gradient background */}
        <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-fd-background via-fd-background to-fd-accent/5" />
        <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-fd-primary/8 blur-[120px]" />

        <div className="inline-flex items-center gap-2 rounded-full border border-fd-border bg-fd-card px-4 py-1.5 text-sm text-fd-muted-foreground">
          <Package className="h-3.5 w-3.5" />
          <span>Now available — v0.1.0</span>
        </div>

        <h1 className="max-w-3xl text-4xl font-bold tracking-tight md:text-6xl">
          Serverless plugins that{' '}
          <span className="bg-gradient-to-r from-fd-primary to-purple-400 bg-clip-text text-transparent">
            clean up after themselves
          </span>
        </h1>

        <p className="max-w-2xl text-lg text-fd-muted-foreground md:text-xl">
          TypeScript-native replacements for community Serverless Framework plugins.
          Zero dependencies. Full IntelliSense. No ghost billing.
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/docs/getting-started"
            className="inline-flex items-center gap-2 rounded-lg bg-fd-primary px-6 py-3 text-sm font-medium text-fd-primary-foreground transition-colors hover:bg-fd-primary/90"
          >
            Get started
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="https://github.com/ofri-peretz/serverless"
            className="inline-flex items-center gap-2 rounded-lg border border-fd-border bg-fd-card px-6 py-3 text-sm font-medium text-fd-foreground transition-colors hover:bg-fd-accent"
          >
            <Code2 className="h-4 w-4" />
            GitHub
          </Link>
        </div>

        {/* Install snippet */}
        <div className="mt-8 rounded-lg border border-fd-border bg-fd-card px-6 py-3 font-mono text-sm text-fd-muted-foreground">
          npm install @interlace/serverless-plugin-caching
        </div>
      </section>

      {/* Why Switch */}
      <section className="border-t border-fd-border bg-fd-card/50 px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-4 text-center text-3xl font-bold">
            What the community plugin forgot
          </h2>
          <p className="mx-auto mb-12 max-w-2xl text-center text-fd-muted-foreground">
            Every plugin we ship fixes real problems that cost developers money and time.
          </p>

          <div className="grid gap-6 md:grid-cols-3">
            <FeatureCard
              icon={<Trash2 className="h-5 w-5" />}
              title="Cleanup on removal"
              description="Cache clusters are disabled before stack deletion. No more ghost billing from orphaned resources."
            />
            <FeatureCard
              icon={<Terminal className="h-5 w-5" />}
              title="CLI commands"
              description="sls caching status, flush, and disable — manage your cache without touching the AWS console."
            />
            <FeatureCard
              icon={<Shield className="h-5 w-5" />}
              title="Zero prototype pollution"
              description="No String.prototype.replaceAll override. No lodash micro-packages. Zero runtime dependencies."
            />
            <FeatureCard
              icon={<Zap className="h-5 w-5" />}
              title="Jittered backoff"
              description="Exponential retry with jitter prevents thundering herd during concurrent deployments."
            />
            <FeatureCard
              icon={<Code2 className="h-5 w-5" />}
              title="TypeScript-native"
              description="Full IntelliSense for every config option. Catch misconfigurations before deploy."
            />
            <FeatureCard
              icon={<RefreshCw className="h-5 w-5" />}
              title="Safe offboarding"
              description="sls caching disable tears down AWS resources before you remove the plugin. No manual cleanup."
            />
          </div>
        </div>
      </section>

      {/* Packages */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-12 text-center text-3xl font-bold">Packages</h2>

          <div className="grid gap-6 md:grid-cols-2">
            <PackageCard
              name="@interlace/serverless-plugin-caching"
              description="API Gateway caching done right. Replaces serverless-api-gateway-caching with proper cleanup, CLI commands, and TypeScript config validation."
              href="/docs/plugins/caching"
              tags={['REST API', 'Cache Cluster', 'Cleanup', 'CLI']}
            />
            <PackageCard
              name="@interlace/serverless-devkit"
              description="TypeScript-first configuration toolkit — defineConfig(), defineFunction(), typed helpers, and plugin development interfaces."
              href="/docs/serverless-devkit"
              tags={['TypeScript', 'Config', 'IntelliSense', 'Plugin SDK']}
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-fd-border px-6 py-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between text-sm text-fd-muted-foreground">
          <span>
            Built by{' '}
            <a
              href="https://ofriperetz.dev"
              className="font-medium text-fd-foreground hover:text-fd-primary"
            >
              Ofri Peretz
            </a>
          </span>
          <span>MIT License</span>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-fd-border bg-fd-card p-6 transition-colors hover:border-fd-primary/30 hover:bg-fd-accent/5">
      <div className="mb-3 inline-flex rounded-lg bg-fd-primary/10 p-2.5 text-fd-primary">
        {icon}
      </div>
      <h3 className="mb-2 text-lg font-semibold">{title}</h3>
      <p className="text-sm leading-relaxed text-fd-muted-foreground">{description}</p>
    </div>
  );
}

function PackageCard({
  name,
  description,
  href,
  tags,
}: {
  name: string;
  description: string;
  href: string;
  tags: string[];
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-fd-border bg-fd-card p-6 transition-all hover:border-fd-primary/40 hover:shadow-lg hover:shadow-fd-primary/5"
    >
      <h3 className="mb-2 font-mono text-lg font-semibold text-fd-primary group-hover:text-fd-primary/80">
        {name}
      </h3>
      <p className="mb-4 text-sm leading-relaxed text-fd-muted-foreground">{description}</p>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded-md bg-fd-accent px-2 py-0.5 text-xs text-fd-muted-foreground"
          >
            {tag}
          </span>
        ))}
      </div>
    </Link>
  );
}
