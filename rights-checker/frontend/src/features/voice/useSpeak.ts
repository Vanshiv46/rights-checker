import { useState } from 'react';
import { api } from '../../lib/api';
import type { Language } from '../../lib/types';

const LOCALES: Record<Language, string> = { hi: 'hi-IN', en: 'en-IN' };

/** Reads a text aloud with the browser's own speech engine (no server, no key). */
function speakInBrowser(text: string, language: Language): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = LOCALES[language];
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}

/**
 * Plays a spoken version of a text: the browser's speech first, the server's audio as a backup.
 * `failed` lets the UI fall back to on-screen text.
 */
export function useSpeak(language: Language) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const speak = async (text: string) => {
    setFailed(false);
    if (speakInBrowser(text, language)) return;
    setBusy(true);
    try {
      const { data } = await api.speak(text, language);
      if (data.audioBase64) await new Audio(`data:${data.mime};base64,${data.audioBase64}`).play();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return { speak, busy, failed };
}
