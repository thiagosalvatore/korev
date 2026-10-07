import { useEffect, useRef, useState } from 'react';
import { IconButton } from '../design-system';
import { api } from './bridge';

const DEFAULT_URL = 'about:blank';
const HAS_SCHEME = /^[a-z]+:/i;

interface WebviewElement extends HTMLElement {
  getURL(): string;
  loadURL(url: string): Promise<void>;
  goBack(): void;
  goForward(): void;
  reload(): void;
  canGoBack(): boolean;
  canGoForward(): boolean;
}

export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return DEFAULT_URL;
  return HAS_SCHEME.test(trimmed) ? trimmed : `http://${trimmed}`;
}

export function BrowserView({ url: initialUrl }: { url: string }) {
  const view = useRef<WebviewElement>(null);
  const [address, setAddress] = useState(initialUrl);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  useEffect(() => {
    const element = view.current;
    if (!element) return undefined;
    const sync = () => {
      setAddress(element.getURL());
      setCanGoBack(element.canGoBack());
      setCanGoForward(element.canGoForward());
    };
    element.addEventListener('did-navigate', sync);
    element.addEventListener('did-navigate-in-page', sync);
    return () => {
      element.removeEventListener('did-navigate', sync);
      element.removeEventListener('did-navigate-in-page', sync);
    };
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 flex-none items-center gap-1 border-b border-border-1 bg-surface px-2">
        <IconButton
          icon="arrow-left"
          label="Back"
          size="sm"
          disabled={!canGoBack}
          onClick={() => view.current?.goBack()}
        />
        <IconButton
          icon="arrow-right"
          label="Forward"
          size="sm"
          disabled={!canGoForward}
          onClick={() => view.current?.goForward()}
        />
        <IconButton
          icon="rotate-cw"
          label="Reload"
          size="sm"
          onClick={() => view.current?.reload()}
        />
        <input
          aria-label="Address"
          value={address}
          className="h-7 flex-1 rounded-sm border border-border-2 bg-inset px-2.5 font-mono text-xs text-fg-1 outline-none focus:border-accent-border"
          onChange={(event) => setAddress(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter')
              void view.current?.loadURL(normalizeUrl(address));
          }}
        />
        <IconButton
          icon="external-link"
          label="Open in your browser"
          size="sm"
          onClick={() =>
            void api.openExternal(view.current?.getURL() ?? address)
          }
        />
      </div>
      <webview
        ref={view}
        src={normalizeUrl(initialUrl)}
        partition="persist:korev-browser"
        className="min-h-0 flex-1 bg-white"
      />
    </div>
  );
}
