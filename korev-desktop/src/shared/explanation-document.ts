import proseCss from '../design-system/styles/prose.css?raw';
import tokensCss from '../design-system/styles/tokens.css?raw';

export type DocumentTheme = 'light' | 'dark';

const DOCUMENT_POLICY =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:";

export function explanationDocument(
  body: string,
  theme: DocumentTheme,
): string {
  return [
    '<!doctype html>',
    `<html data-theme="${theme}">`,
    '<head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${DOCUMENT_POLICY}">`,
    `<style>${tokensCss}\n${proseCss}</style>`,
    '</head>',
    `<body class="korev-prose">${body}</body>`,
    '</html>',
  ].join('\n');
}
