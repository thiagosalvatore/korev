import { Step, Steps } from 'fumadocs-ui/components/steps';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { Screenshot } from '@/components/docs/Screenshot';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return { ...defaultMdxComponents, Steps, Step, Screenshot, ...components };
}
