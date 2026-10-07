import { Fragment_Mono, Onest } from 'next/font/google';

const onest = Onest({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-onest',
});

const fragmentMono = Fragment_Mono({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-fragment-mono',
});

export const fontVariables = `${onest.variable} ${fragmentMono.variable}`;
