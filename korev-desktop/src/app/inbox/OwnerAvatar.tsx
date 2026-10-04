import { createContext, useContext, useState } from 'react';
import { cn } from '../../design-system';
import { NARROW_HIDDEN } from '../layout';

const RepoAvatarsContext = createContext<Record<string, string>>({});

export const RepoAvatarsProvider = RepoAvatarsContext.Provider;

export function useRepoAvatar(repo: string): string | undefined {
  return useContext(RepoAvatarsContext)[repo];
}

const SIZES = { sm: 'size-3.5', md: 'size-4' } as const;

export interface OwnerAvatarProps {
  src: string;
  size?: keyof typeof SIZES;
}

function LoadedAvatar({ src, size = 'md' }: OwnerAvatarProps) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={src}
      alt=""
      className={cn('shrink-0 rounded-xs', SIZES[size])}
      onError={() => setFailed(true)}
    />
  );
}

export function OwnerAvatar(props: OwnerAvatarProps) {
  return <LoadedAvatar key={props.src} {...props} />;
}

export function RepoLabel({ repo }: { repo: string }) {
  const avatarUrl = useRepoAvatar(repo);
  const [owner, name] = repo.split('/');
  return (
    <span className="inline-flex max-w-[40%] min-w-0 shrink-0 items-center gap-1">
      {avatarUrl ? <OwnerAvatar src={avatarUrl} size="sm" /> : null}
      <span title={repo} className="truncate font-mono">
        <span className={NARROW_HIDDEN}>{owner}/</span>
        {name}
      </span>
    </span>
  );
}
