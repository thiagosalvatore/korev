import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MacDownloadButton } from './MacDownload';

const LATEST =
  'https://github.com/thiagosalvatore/korev/releases/latest/download';

function reportArchitecture(architecture: string) {
  Object.defineProperty(navigator, 'userAgentData', {
    configurable: true,
    value: { getHighEntropyValues: async () => ({ architecture }) },
  });
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, 'userAgentData');
});

describe('MacDownloadButton', () => {
  it('links to the Apple silicon DMG when the browser does not report an architecture', () => {
    render(<MacDownloadButton size="lg">Download for Mac</MacDownloadButton>);

    expect(
      screen.getByRole('link', { name: /Download for Mac/ }),
    ).toHaveProperty('href', `${LATEST}/Korev-arm64.dmg`);
  });

  it('links to the Intel DMG when the browser reports an x86 Mac', async () => {
    reportArchitecture('x86');

    render(<MacDownloadButton size="lg">Download for Mac</MacDownloadButton>);

    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: /Download for Mac/ }),
      ).toHaveProperty('href', `${LATEST}/Korev-x64.dmg`),
    );
  });
});
