import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/page';
import { GITHUB_OWNER, GITHUB_REPO } from '@/components/landing/links';
import { source } from '@/lib/source';
import { getMDXComponents } from '@/mdx-components';

const CONTENT_DIR = 'korev-frontend/content/docs';

function getPageOrNotFound(slug: string[] | undefined) {
  const page = source.getPage(slug);
  if (!page) notFound();
  return page;
}

export default async function Page({ params }: PageProps<'/docs/[[...slug]]'>) {
  const page = getPageOrNotFound((await params).slug);
  const MDX = page.data.body;

  return (
    <DocsPage
      toc={page.data.toc}
      editOnGithub={{
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        sha: 'main',
        path: `${CONTENT_DIR}/${page.path}`,
      }}
    >
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX
          components={getMDXComponents({ a: createRelativeLink(source, page) })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({
  params,
}: PageProps<'/docs/[[...slug]]'>): Promise<Metadata> {
  const page = getPageOrNotFound((await params).slug);
  return { title: page.data.title, description: page.data.description };
}
