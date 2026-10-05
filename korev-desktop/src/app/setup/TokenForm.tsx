import { useState, type FormEvent } from 'react';
import { Button, Input } from '../../design-system';
import { TEXT_BUTTON } from '../layout';
import { connectWithToken } from '../useAuthState';

export function TokenForm() {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const result = await connectWithToken(token.trim());
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(undefined);
    setToken('');
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        className={TEXT_BUTTON}
        onClick={() => setOpen(true)}
      >
        Use a personal access token instead
      </button>
    );
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-2">
      <Input
        label="Personal access token"
        type="password"
        mono
        autoFocus
        value={token}
        error={error}
        hint="Run gh auth token and paste the output, or use a classic token with the repo and read:org scopes."
        onChange={(event) => setToken(event.target.value)}
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={!token.trim()} loading={saving}>
          Save
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
