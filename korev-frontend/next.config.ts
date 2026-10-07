import type { NextConfig } from 'next';
import { createMDX } from 'fumadocs-mdx/next';

const nextConfig: NextConfig = {
  output: 'export',
};

export default createMDX()(nextConfig);
