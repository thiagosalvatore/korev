import { Fragment } from 'react';
import { useColorScheme, View } from 'react-native';
import { useMarkdown } from 'react-native-marked';
import { useTheme } from '../theme';

export function MarkdownView({ value }: { value: string }) {
  const theme = useTheme();
  const elements = useMarkdown(value, {
    colorScheme: useColorScheme(),
    theme: {
      colors: {
        text: theme.fg1,
        link: theme.accentText,
        code: theme.bgActive,
        border: theme.border2,
      },
    },
  });
  return (
    <View>
      {elements.map((element, index) => (
        <Fragment key={index}>{element}</Fragment>
      ))}
    </View>
  );
}
