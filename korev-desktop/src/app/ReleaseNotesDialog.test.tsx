import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHANGELOG_URL } from '../shared/links';
import type { AppState } from '../shared/model';
import { ReleaseNotesDialog } from './ReleaseNotesDialog';
import { resetUiForTests } from './ui-store';

const RELEASE = {
  version: '1.3.0',
  notes: [
    'Korev starts faster.',
    '',
    '### New',
    '',
    '- **Faster startup.** Korev opens in half the time.',
    '',
    '### Fixed',
    '',
    '- The sidebar no longer flickers.',
  ].join('\n'),
};

let call: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetUiForTests();
  call = vi.fn(async () => ({ ok: true, value: undefined }));
  window.korev = { call, on: () => () => {} } as unknown as Window['korev'];
});

afterEach(cleanup);

function renderDialog(state: Partial<AppState>) {
  render(
    <ReleaseNotesDialog
      state={{ update: null, whatsNew: null, ...state } as AppState}
    />,
  );
}

describe('ReleaseNotesDialog', () => {
  it('shows what is new and records it as seen', () => {
    renderDialog({ whatsNew: RELEASE });
    expect(screen.getByRole('dialog').textContent).toContain('Faster startup');
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(call).toHaveBeenCalledWith('dismissWhatsNew', []);
  });

  it('opens by itself when an update is found', () => {
    renderDialog({ update: RELEASE });
    expect(
      screen.getByRole('dialog', { name: 'Korev starts faster.' }).textContent,
    ).toContain('Korev 1.3.0 is available');
  });

  it('falls back to the version when the notes have no summary', () => {
    renderDialog({ whatsNew: { version: '1.3.0', notes: '- Faster startup' } });
    expect(
      screen.getByRole('dialog', { name: "What's new in Korev 1.3.0" }),
    ).toBeTruthy();
  });

  it('groups new features apart from fixes', () => {
    renderDialog({ whatsNew: RELEASE });
    expect(screen.getByRole('region', { name: 'New' }).textContent).toContain(
      'Faster startup.',
    );
    expect(screen.getByRole('region', { name: 'Fixed' }).textContent).toContain(
      'The sidebar no longer flickers.',
    );
  });

  it('opens this release in the full changelog', () => {
    renderDialog({ whatsNew: RELEASE });
    fireEvent.click(screen.getByRole('button', { name: 'All releases' }));
    expect(call).toHaveBeenCalledWith('openExternal', [
      `${CHANGELOG_URL}#v1.3.0`,
    ]);
  });

  it('stays closed after the user picks Later', () => {
    renderDialog({ update: RELEASE });
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('installs the update from its notes', () => {
    renderDialog({ update: RELEASE });
    fireEvent.click(
      screen.getByRole('button', { name: 'Install and restart' }),
    );
    expect(call).toHaveBeenCalledWith('installUpdate', []);
  });
});
