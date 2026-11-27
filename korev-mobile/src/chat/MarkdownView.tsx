import { Fragment, useMemo, type ReactNode } from 'react';
import { Text, useColorScheme, View, type TextStyle } from 'react-native';
import { Renderer, useMarkdown } from 'react-native-marked';
import {
  parseFileRef,
  splitBarePaths,
  type FileRef,
  type FileRefPart,
} from '../../../korev-desktop/src/shared/fileRefs';
import { imageType } from '../../../korev-desktop/src/shared/format';
import {
  isPrUrl,
  splitPrRefs,
  type PrLink,
} from '../../../korev-desktop/src/shared/pr-links';
import { MONO_FONT, useTheme } from '../theme';

type OpenImage = (path: string) => void;
export type OpenFile = (path: string, line: number | null) => void;

class ChatRenderer extends Renderer {
  private readonly openImage?: OpenImage;
  private readonly openFile?: OpenFile;
  private readonly repoUrl: string | null;
  private readonly linkColor: string;

  constructor(
    openImage: OpenImage | undefined,
    openFile: OpenFile | undefined,
    repoUrl: string | null,
    linkColor: string,
    selectable: boolean,
  ) {
    super({ selectable });
    this.openImage = openImage;
    this.openFile = openFile;
    this.repoUrl = repoUrl;
    this.linkColor = linkColor;
  }

  // Images open in the preview, other files in the file viewer, as on the Mac.
  private fileLink(
    ref: FileRef,
    children: string | ReactNode[],
    styles?: TextStyle,
  ) {
    const { openImage, openFile } = this;
    if (openImage && imageType(ref.file))
      return this.imageLink(openImage, ref.file, children, styles);
    if (!openFile) return null;
    return (
      <Text
        key={this.getKey()}
        accessibilityRole="link"
        style={{ ...styles, color: this.linkColor }}
        onPress={() => openFile(ref.file, ref.line)}
      >
        {children}
      </Text>
    );
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
    const ref = parseFileRef(href);
    return (
      (ref && this.fileLink(ref, children, styles)) ??
      super.link(children, href, styles, title)
    );
  }

  codespan(text: string, styles?: TextStyle) {
    if (isPrUrl(text)) return this.webLink(text, text, styles);
    const ref = parseFileRef(text);
    return (
      (ref && this.fileLink(ref, text, styles)) ?? super.codespan(text, styles)
    );
  }

  text(text: string | ReactNode[], styles?: TextStyle) {
    if (typeof text !== 'string') return super.text(text, styles);
    const parts = splitBarePaths(text).flatMap(
      (part): (string | PrLink | FileRefPart)[] =>
        typeof part === 'string' ? splitPrRefs(part, this.repoUrl) : [part],
    );
    if (parts.length === 1 && typeof parts[0] === 'string')
      return super.text(text, styles);
    return super.text(
      parts.map((part) => {
        if (typeof part === 'string') return part;
        if ('url' in part) return this.webLink(part.label, part.url, styles);
        return this.fileLink(part, part.label, styles) ?? part.label;
      }),
      styles,
    );
  }
}

export function MarkdownView({
  value,
  onOpenImage,
  onOpenFile,
  repoUrl = null,
  selectable = true,
}: {
  value: string;
  onOpenImage?: OpenImage;
  onOpenFile?: OpenFile;
  repoUrl?: string | null;
  selectable?: boolean;
}) {
  const theme = useTheme();
  const renderer = useMemo(
    () =>
      new ChatRenderer(
        onOpenImage,
        onOpenFile,
        repoUrl,
        theme.accentText,
        selectable,
      ),
    [onOpenImage, onOpenFile, repoUrl, theme.accentText, selectable],
  );
  const elements = useMarkdown(value, {
    colorScheme: useColorScheme(),
    renderer,
    styles: {
      codespan: {
        fontStyle: 'normal',
        fontWeight: '400',
        fontFamily: MONO_FONT,
        fontSize: 14,
        backgroundColor: theme.bgRaised,
      },
    },
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
