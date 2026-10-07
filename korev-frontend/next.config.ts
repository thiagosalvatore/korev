import type { NextConfig } from 'next';
import { createMDX } from 'fumadocs-mdx/next';

const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
};

export default createMDX()(nextConfig);
