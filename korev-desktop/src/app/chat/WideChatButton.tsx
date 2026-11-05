import { IconButton } from '../../design-system';
import { toggleWideChat } from '../actions';
import { useUi } from '../ui-store';

export function WideChatButton({ className }: { className?: string }) {
  const wide = useUi((ui) => ui.wideChat);
  return (
    <IconButton
      icon={wide ? 'fold-horizontal' : 'unfold-horizontal'}
      label="Wide chat"
      size="sm"
      active={wide}
      className={className}
      onClick={toggleWideChat}
    />
  );
}
