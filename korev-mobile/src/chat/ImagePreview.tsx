import { useEffect, useState, type ReactNode } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { KorevApi } from '../../../korev-desktop/src/shared/api';
import { fileName } from '../../../korev-desktop/src/shared/format';
import { useConnection } from '../korev';
import { useTheme, type Theme } from '../theme';
import { Button } from '../ui';

const loaded = new Map<string, Promise<string | null>>();

function loadImage(api: KorevApi, sessionId: string, path: string) {
  const key = `${sessionId}:${path}`;
  const cached = loaded.get(key);
  if (cached) return cached;
  const request = api.readImage(sessionId, path).catch(() => null);
  loaded.set(key, request);
  return request;
}

function useImage(sessionId: string, path: string | null) {
  const { api } = useConnection();
  const [source, setSource] = useState<string | null>();
  useEffect(() => {
    setSource(undefined);
    if (!path) return;
    let current = true;
    void loadImage(api, sessionId, path).then((image) => {
      if (current) setSource(image);
    });
    return () => {
      current = false;
    };
  }, [api, sessionId, path]);
  return source;
}

export function ImagePreview({
  sessionId,
  path,
  onClose,
}: {
  sessionId: string;
  path: string | null;
  onClose(): void;
}) {
  const styles = makeStyles(useTheme());
  const insets = useSafeAreaInsets();
  const source = useImage(sessionId, path);
  return (
    <Modal
      visible={path !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.sheet, { paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {path ? fileName(path) : ''}
          </Text>
          <Button label="Close" variant="secondary" onPress={onClose} />
        </View>
        {source ? (
          <Image
            source={{ uri: source }}
            style={styles.image}
            resizeMode="contain"
          />
        ) : (
          <Text style={styles.status}>
            {source === null
              ? "This image can't be shown."
              : 'Loading the image…'}
          </Text>
        )}
      </View>
    </Modal>
  );
}

export function ImageThumbnail({
  sessionId,
  path,
  fallback = null,
}: {
  sessionId: string;
  path: string;
  fallback?: ReactNode;
}) {
  const styles = makeStyles(useTheme());
  const source = useImage(sessionId, path);
  const [open, setOpen] = useState(false);
  if (!source) return fallback;
  return (
    <>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={`Preview ${fileName(path)}`}
        onPress={() => setOpen(true)}
      >
        <Image source={{ uri: source }} style={styles.thumbnail} />
      </Pressable>
      <ImagePreview
        sessionId={sessionId}
        path={open ? path : null}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    sheet: { flex: 1, backgroundColor: theme.bgSurface },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border1,
    },
    title: { flex: 1, color: theme.fg1, fontSize: 16, fontWeight: '600' },
    image: { flex: 1, margin: 8 },
    status: { padding: 24, color: theme.fg3, textAlign: 'center' },
    thumbnail: {
      width: 120,
      height: 80,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: theme.border1,
      backgroundColor: theme.bgActive,
    },
  });
}
