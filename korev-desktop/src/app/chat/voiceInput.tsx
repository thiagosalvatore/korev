import { useEffect, useRef, useState, type RefObject } from 'react';
import { insertDictation } from '../../shared/dictation';
import { api } from '../bridge';
import { useAppState } from '../hooks';
import { useDictation } from './dictation';
import { VoiceModelDialog } from './VoiceModelDialog';

type TextInput = RefObject<HTMLTextAreaElement | null>;

export function placeCaret(input: TextInput, caret: number) {
  requestAnimationFrame(() => {
    input.current?.focus();
    input.current?.setSelectionRange(caret, caret);
  });
}

export function useVoiceInput(
  input: TextInput,
  text: string,
  update: (text: string) => void,
) {
  const status = useAppState()?.dictation;
  const dictation = useDictation(insertDictated);
  const dictating = dictation.phase !== 'idle';
  const [setupOpen, setSetupOpen] = useState(false);
  const wasDictating = useRef(false);

  useEffect(() => {
    if (!dictating && wasDictating.current) input.current?.focus();
    wasDictating.current = dictating;
  }, [dictating, input]);

  function insertDictated(dictated: string) {
    const element = input.current;
    const current = element?.value ?? text;
    const inserted = insertDictation(
      current,
      element?.selectionStart ?? current.length,
      dictated,
    );
    update(inserted.text);
    placeCaret(input, inserted.caret);
  }

  function toggle() {
    if (status?.status === 'ready') dictation.toggle();
    else setSetupOpen(true);
  }

  function startAfterSetup() {
    setSetupOpen(false);
    dictation.toggle();
  }

  const setupDialog =
    setupOpen && status ? (
      <VoiceModelDialog
        status={status}
        onDownload={() => void api.prepareDictation()}
        onStart={startAfterSetup}
        onClose={() => setSetupOpen(false)}
      />
    ) : null;

  return { status, dictation, dictating, toggle, setupDialog };
}
