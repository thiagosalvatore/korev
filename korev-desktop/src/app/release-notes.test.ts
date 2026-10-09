import { describe, expect, it } from 'vitest';
import { parseReleaseNotes } from './release-notes';

describe('parseReleaseNotes', () => {
  it('splits the summary, New and Fixed', () => {
    const notes = [
      '',
      'The grid view shows chats side by side.',
      '',
      '### New',
      '',
      '- **Grid view.** Press ⌘G.',
      '- **Ask panes.** Drag an Ask chat.',
      '',
      '### Fixed',
      '',
      '- Workspaces from a checked-out branch open.',
    ].join('\n');
    expect(parseReleaseNotes(notes)).toEqual({
      summary: 'The grid view shows chats side by side.',
      sections: [
        {
          kind: 'new',
          items: [
            '**Grid view.** Press ⌘G.',
            '**Ask panes.** Drag an Ask chat.',
          ],
        },
        {
          kind: 'fixed',
          items: ['Workspaces from a checked-out branch open.'],
        },
      ],
    });
  });

  it('counts bullets before any heading as New', () => {
    const notes =
      'Korev now opens like any other Mac app.\n\n- Signed.\n- Collapsed.';
    expect(parseReleaseNotes(notes)).toEqual({
      summary: 'Korev now opens like any other Mac app.',
      sections: [{ kind: 'new', items: ['Signed.', 'Collapsed.'] }],
    });
  });

  it('leaves out an empty New section', () => {
    expect(parseReleaseNotes('### Fixed\n\n- A crash.')).toEqual({
      summary: '',
      sections: [{ kind: 'fixed', items: ['A crash.'] }],
    });
  });
});
