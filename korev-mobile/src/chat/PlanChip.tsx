import { useState, type ReactNode } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { MarkdownView } from './MarkdownView';
import { ReaderSheet } from './ReaderSheet';

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
      <ReaderSheet title={name} visible={open} onClose={() => setOpen(false)}>
        <MarkdownView value={markdown} />
      </ReaderSheet>
    </>
  );
}
