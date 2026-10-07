import { useEffect, useState, type ReactNode } from 'react';
import { Dialog } from '../../design-system';
import { fileName } from '../../shared/format';
import { api } from '../bridge';

const PREVIEW_WIDTH = 'min(1100px, calc(100vw - 32px))';
const loaded = new Map<string, Promise<string | null>>();

function loadImage(sessionId: string, path: string) {
  const key = `${sessionId}:${path}`;
  const cached = loaded.get(key);
  if (cached) return cached;
  const request = api.readImage(sessionId, path).catch(() => null);
  loaded.set(key, request);
  return request;
}

function useImage(sessionId: string, path: string | null) {
  const [source, setSource] = useState<string | null>();
  useEffect(() => {
    setSource(undefined);
    if (!path) return;
    let current = true;
    void loadImage(sessionId, path).then((image) => {
      if (current) setSource(image);
    });
    return () => {
      current = false;
    };
  }, [sessionId, path]);
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
  const source = useImage(sessionId, path);
  return (
    <Dialog
      open={path !== null}
      onClose={onClose}
      title={path ? fileName(path) : ''}
      width={PREVIEW_WIDTH}
    >
      {source ? (
        <img
          src={source}
          alt={path ? fileName(path) : ''}
          className="mx-auto block max-h-[72vh] max-w-full object-contain"
        />
      ) : (
        <p className="m-0 text-sm text-fg-3">
          {source === null
            ? "This image can't be shown."
            : 'Loading the image…'}
        </p>
      )}
    </Dialog>
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
  const source = useImage(sessionId, path);
  const [open, setOpen] = useState(false);
  if (!source) return fallback;
  return (
    <>
      <button
        type="button"
        aria-label={`Preview ${fileName(path)}`}
        title={`Preview ${fileName(path)}`}
        className="block cursor-pointer overflow-hidden rounded-md border border-border-1 bg-inset p-0 hover:border-border-strong"
        onClick={() => setOpen(true)}
      >
        <img
          src={source}
          alt={fileName(path)}
          className="block h-20 max-w-48 object-cover"
        />
      </button>
      <ImagePreview
        sessionId={sessionId}
        path={open ? path : null}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
