import { Fragment, useMemo, type ReactNode } from 'react';
import { Text, useColorScheme, View, type TextStyle } from 'react-native';
import { Renderer, useMarkdown } from 'react-native-marked';
import { imageType } from '../../../korev-desktop/src/shared/format';
import {
  isPrUrl,
  splitPrRefs,
} from '../../../korev-desktop/src/shared/pr-links';
import { useTheme } from '../theme';

type OpenImage = (path: string) => void;

class ChatRenderer extends Renderer {
  private readonly openImage?: OpenImage;
  private readonly repoUrl: string | null;
  private readonly linkColor: string;

  constructor(
    openImage: OpenImage | undefined,
    repoUrl: string | null,
    linkColor: string,
  ) {
    super();
    this.openImage = openImage;
    this.repoUrl = repoUrl;
    this.linkColor = linkColor;
  }

  private imageLink(
    openImage: OpenImage,
    path: string,
    children: string | ReactNode[],
    styles?: TextStyle,
  ) {
    return (
      <Text
        key={this.getKey()}
        accessibilityRole="link"
        style={styles}
        onPress={() => openImage(path)}
      >
        {children}
      </Text>
    );
  }

  private webLink(label: string, url: string, styles?: TextStyle) {
    return super.link(label, url, { ...styles, color: this.linkColor });
  }

  link(
    children: string | ReactNode[],
    href: string,
    styles?: TextStyle,
    title?: string,
  ) {
    if (!this.openImage || !imageType(href))
      return super.link(children, href, styles, title);
    return this.imageLink(this.openImage, href, children, styles);
  }

  codespan(text: string, styles?: TextStyle) {
    if (isPrUrl(text)) return this.webLink(text, text, styles);
    if (!this.openImage || !imageType(text))
      return super.codespan(text, styles);
    return this.imageLink(this.openImage, text, text, styles);
  }

  text(text: string | ReactNode[], styles?: TextStyle) {
    if (typeof text !== 'string') return super.text(text, styles);
    const parts = splitPrRefs(text, this.repoUrl);
    if (parts.length === 1 && typeof parts[0] === 'string')
      return super.text(text, styles);
    return super.text(
      parts.map((part) =>
        typeof part === 'string'
          ? part
          : this.webLink(part.label, part.url, styles),
      ),
      styles,
    );
  }
}

export function MarkdownView({
  value,
  onOpenImage,
  repoUrl = null,
}: {
  value: string;
  onOpenImage?: OpenImage;
  repoUrl?: string | null;
}) {
  const theme = useTheme();
  const renderer = useMemo(
    () => new ChatRenderer(onOpenImage, repoUrl, theme.accentText),
    [onOpenImage, repoUrl, theme.accentText],
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
