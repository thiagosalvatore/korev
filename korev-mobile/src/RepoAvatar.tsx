import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import type { KorevApi } from '../../korev-desktop/src/shared/api';
import type { Repo } from '../../korev-desktop/src/shared/model';
import { useConnection } from './korev';
import { MONO_FONT, useTheme } from './theme';

const AVATAR_SIZE = 20;
const SVG_DATA_PREFIX = 'data:image/svg+xml;base64,';

const repoIcons = new Map<string, Promise<string | null>>();

function repoIcon(api: KorevApi, repoId: string): Promise<string | null> {
  const cached = repoIcons.get(repoId);
  if (cached) return cached;
  const icon = api.repoIcon(repoId).catch(() => null);
  repoIcons.set(repoId, icon);
  return icon;
}

function Initial({ repo }: { repo: Repo }) {
  const theme = useTheme();
  return (
    <View style={[styles.avatar, { backgroundColor: theme.accentSubtle }]}>
      <Text style={[styles.initial, { color: theme.accentText }]}>
        {repo.name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

export function RepoAvatar({ repo }: { repo: Repo }) {
  const { api } = useConnection();
  const [icon, setIcon] = useState<string | null>(null);
  useEffect(() => {
    void repoIcon(api, repo.id).then(setIcon);
  }, [api, repo.id]);
  if (!icon) return <Initial repo={repo} />;
  if (icon.startsWith(SVG_DATA_PREFIX))
    return (
      <SvgXml
        xml={atob(icon.slice(SVG_DATA_PREFIX.length))}
        width={AVATAR_SIZE}
        height={AVATAR_SIZE}
        onError={() => setIcon(null)}
      />
    );
  return (
    <Image
      source={{ uri: icon }}
      style={styles.avatar}
      onError={() => setIcon(null)}
    />
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { fontFamily: MONO_FONT, fontSize: 11, fontWeight: '600' },
});
