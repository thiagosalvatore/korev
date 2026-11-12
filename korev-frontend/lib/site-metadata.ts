import type { Metadata } from 'next';
import { SITE_URL } from '@/components/landing/links';

export const SOCIAL_IMAGE = {
  url: '/og.png',
  width: 1200,
  height: 630,
  alt: 'Korev · Every task on its own branch',
};

export const SITE_METADATA: Metadata = {
  metadataBase: new URL(SITE_URL),
  openGraph: { siteName: 'Korev', type: 'website', images: SOCIAL_IMAGE },
  twitter: { card: 'summary_large_image', images: SOCIAL_IMAGE },
};
