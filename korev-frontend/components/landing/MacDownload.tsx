'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Download as DownloadIcon } from 'lucide-react';
import { LinkButton } from '@/components/ds/Button';
import { dmgUrl, type MacArch } from './links';

const DEFAULT_ARCH: MacArch = 'arm64';
const INTEL_ARCHITECTURE = 'x86';
const ARCH_NAMES: Record<MacArch, string> = {
  arm64: 'Apple silicon',
  x64: 'Intel',
};
const OTHER_ARCH: Record<MacArch, MacArch> = { arm64: 'x64', x64: 'arm64' };

interface UserAgentData {
  getHighEntropyValues(hints: string[]): Promise<{ architecture?: string }>;
}

async function detectMacArch(): Promise<MacArch> {
  const { userAgentData } = navigator as Navigator & {
    userAgentData?: UserAgentData;
  };
  const values = await userAgentData?.getHighEntropyValues(['architecture']);
  return values?.architecture === INTEL_ARCHITECTURE ? 'x64' : DEFAULT_ARCH;
}

function useMacArch(): MacArch {
  const [arch, setArch] = useState<MacArch>(DEFAULT_ARCH);
  useEffect(() => {
    detectMacArch()
      .then(setArch)
      .catch(() => setArch(DEFAULT_ARCH));
  }, []);
  return arch;
}

export function MacDownloadButton({
  size,
  children,
}: {
  size: 'sm' | 'lg';
  children: ReactNode;
}) {
  const arch = useMacArch();
  return (
    <LinkButton
      href={dmgUrl(arch)}
      size={size}
      variant="primary"
      icon={DownloadIcon}
    >
      {children}
    </LinkButton>
  );
}

export function OtherMacDownload() {
  const arch = useMacArch();
  const other = OTHER_ARCH[arch];
  return (
    <span className="note">
      For {ARCH_NAMES[arch]} Macs.{' '}
      <a href={dmgUrl(other)}>Download for {ARCH_NAMES[other]}</a>
    </span>
  );
}
