import { useState } from 'react';
import { Button } from '../../design-system';

export function CommentForm({
  onSave,
  onCancel,
}: {
  onSave: (body: string) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState('');
  return (
    <div className="flex flex-col gap-2 py-1">
      <textarea
        autoFocus
        aria-label="Comment"
        value={body}
        placeholder="Leave a comment for the agent"
        className="min-h-16 w-full max-w-2xl resize-y rounded-md border border-border-2 bg-raised p-2 font-sans text-sm text-fg-1 outline-none focus:border-accent-border"
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
          if (
            event.key === 'Enter' &&
            (event.metaKey || event.ctrlKey) &&
            body.trim()
          )
            onSave(body.trim());
        }}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="primary"
          disabled={!body.trim()}
          onClick={() => onSave(body.trim())}
        >
          Add comment
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
