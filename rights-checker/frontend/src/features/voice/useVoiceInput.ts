import { useCallback, useRef, useState } from 'react';
import { api } from '../../lib/api';
import type { Language } from '../../lib/types';

export type VoiceState = 'idle' | 'recording' | 'processing' | 'error';

export function isVoiceSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

/** Records speech with MediaRecorder and turns it into text through the voice endpoint. */
export function useVoiceInput(language: Language, onText: (text: string) => void) {
  const [state, setState] = useState<VoiceState>('idle');
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const finish = useCallback(async () => {
    setState('processing');
    try {
      const blob = new Blob(chunks.current, { type: recorder.current?.mimeType });
      const { data } = await api.transcribe(blob, language);
      onText(data.text);
      setState('idle');
    } catch {
      setState('error');
    }
  }, [language, onText]);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const next = new MediaRecorder(stream);
      chunks.current = [];
      next.ondataavailable = (event) => chunks.current.push(event.data);
      next.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        void finish();
      };
      next.start();
      recorder.current = next;
      setState('recording');
    } catch {
      setState('error');
    }
  }, [finish]);

  const toggle = useCallback(() => {
    if (state === 'recording') recorder.current?.stop();
    else if (state !== 'processing') void start();
  }, [start, state]);

  return { state, toggle };
}
