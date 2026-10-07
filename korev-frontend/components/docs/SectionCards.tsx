import type * as PageTree from 'fumadocs-core/page-tree';
import { Card, Cards } from 'fumadocs-ui/components/card';
import { source } from '@/lib/source';

function findSection(url: string) {
  return source
    .getPageTree()
    .children.find(
      (node): node is PageTree.Folder =>
        node.type === 'folder' && node.index?.url === url,
    );
}

export function SectionCards({ url }: { url: string }) {
  const pages = (findSection(url)?.children ?? []).filter(
    (node): node is PageTree.Item => node.type === 'page',
  );
  return (
    <Cards>
      {pages.map((page) => (
        <Card
          key={page.url}
          title={page.name}
          description={page.description}
          href={page.url}
        />
      ))}
    </Cards>
  );
}
