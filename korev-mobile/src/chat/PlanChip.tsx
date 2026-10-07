import { useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type Theme } from '../theme';
import { Button } from '../ui';
import { MarkdownView } from './MarkdownView';

export function PlanChip({
  name,
  markdown,
  style,
  children,
}: {
  name: string;
  markdown: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const styles = makeStyles(useTheme());
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Preview ${name}`}
        style={style}
        onPress={() => setOpen(true)}
      >
        {children}
      </Pressable>
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              {name}
            </Text>
            <Button
              label="Close"
              variant="secondary"
              onPress={() => setOpen(false)}
            />
          </View>
          <ScrollView
            contentContainerStyle={[
              styles.body,
              { paddingBottom: insets.bottom + 16 },
            ]}
          >
            <MarkdownView value={markdown} />
          </ScrollView>
        </View>
      </Modal>
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
    body: { padding: 16 },
  });
}
