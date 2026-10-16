import type { ReactNode } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type Theme } from '../theme';
import { Button } from '../ui';

export function ReaderSheet({
  title,
  visible,
  onClose,
  children,
}: {
  title: string;
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const styles = makeStyles(useTheme());
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Button label="Close" variant="secondary" onPress={onClose} />
        </View>
        <ScrollView
          contentContainerStyle={[
            styles.body,
            { paddingBottom: insets.bottom + 16 },
          ]}
        >
          {children}
        </ScrollView>
      </View>
    </Modal>
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
    body: { padding: 16 },
  });
}
