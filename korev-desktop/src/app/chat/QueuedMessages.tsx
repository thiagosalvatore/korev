import { Icon, IconButton } from '../../design-system';
import { messageParts } from '../../shared/message';
import type { ChatItem } from '../../shared/model';

type QueuedMessage = Extract<ChatItem, { kind: 'user' }>;

function preview(text: string) {
  return (messageParts(text).body || text).replace(/\s+/g, ' ').trim();
}

export function QueuedMessages({
  messages,
  onSendNow,
  onRemove,
}: {
  messages: QueuedMessage[];
  onSendNow(itemId: string): void;
  onRemove(itemId: string): void;
}) {
  if (!messages.length) return null;
  return (
    <section
      aria-label="Queued messages"
      className="mx-3 overflow-hidden rounded-t-lg border border-b-0 border-border-2 bg-surface"
    >
      {messages.map((message) => (
        <div
          key={message.id}
          className="flex h-9 items-center gap-2 pr-1.5 pl-3 text-sm not-first:border-t not-first:border-border-1"
        >
          <Icon name="clock" size={13} className="shrink-0 text-fg-4" />
          <span className="min-w-0 flex-1 truncate text-fg-2">
            {preview(message.text)}
          </span>
          <IconButton
            icon="arrow-up"
            label="Send now"
            size="sm"
            onClick={() => onSendNow(message.id)}
          />
          <IconButton
            icon="x"
            label="Remove queued message"
            size="sm"
            onClick={() => onRemove(message.id)}
          />
        </div>
      ))}
    </section>
  );
}
