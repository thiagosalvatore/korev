'use client';

import { useState } from 'react';
import { Check, Copy, SquareTerminal } from 'lucide-react';

const CLONE_URL = 'https://github.com/thiagosalvatore/korev.git';
const BUILD_COMMANDS = `git clone ${CLONE_URL}\ncd korev\nmake package-run`;
const COPIED_FEEDBACK_MS = 1400;

export function Install() {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard?.writeText(BUILD_COMMANDS);
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
  };

  return (
    <div className="lp-term">
      <div className="hd">
        <SquareTerminal size={13} />
        Build from source
        <button className="lp-copy" onClick={copy}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>
        <span className="p">$ </span>git clone {CLONE_URL}
        {'\n'}
        <span className="p">$ </span>cd korev{'\n'}
        <span className="p">$ </span>make package-run{'   '}
        <span className="c"># builds and opens Korev.app</span>
      </pre>
    </div>
  );
}
