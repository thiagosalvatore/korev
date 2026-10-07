import { Fragment, useMemo, type ReactNode } from 'react';
import { Text, useColorScheme, View, type TextStyle } from 'react-native';
import { Renderer, useMarkdown } from 'react-native-marked';
import { imageType } from '../../../korev-desktop/src/shared/format';
import { useTheme } from '../theme';

type OpenImage = (path: string) => void;

class ImageLinkRenderer extends Renderer {
  private readonly openImage: OpenImage;

  constructor(openImage: OpenImage) {
    super();
    this.openImage = openImage;
  }

  private imageLink(
    path: string,
    children: string | ReactNode[],
    styles?: TextStyle,
  ) {
    return (
      <Text
        key={this.getKey()}
        accessibilityRole="link"
        style={styles}
        onPress={() => this.openImage(path)}
      >
        {children}
      </Text>
    );
  }

  link(
    children: string | ReactNode[],
    href: string,
    styles?: TextStyle,
    title?: string,
  ) {
    if (!imageType(href)) return super.link(children, href, styles, title);
    return this.imageLink(href, children, styles);
  }

  codespan(text: string, styles?: TextStyle) {
    if (!imageType(text)) return super.codespan(text, styles);
    return this.imageLink(text, text, styles);
  }
}

export function MarkdownView({
  value,
  onOpenImage,
}: {
  value: string;
  onOpenImage?: OpenImage;
}) {
  const theme = useTheme();
  const renderer = useMemo(
    () => (onOpenImage ? new ImageLinkRenderer(onOpenImage) : undefined),
    [onOpenImage],
  );
  const elements = useMarkdown(value, {
    colorScheme: useColorScheme(),
    renderer,
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
