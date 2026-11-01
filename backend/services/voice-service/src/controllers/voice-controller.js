import { parseOrThrow, sendData, speakBodySchema, transcribeBodySchema } from '@rec/common';

/** HTTP layer only. */
export function createVoiceController(voice) {
  return {
    transcribe: async (req, res) => {
      const body = parseOrThrow(transcribeBodySchema, req.body, 'body');
      sendData(res, await voice.transcribe(body));
    },
    speak: async (req, res) => {
      const body = parseOrThrow(speakBodySchema, req.body, 'body');
      sendData(res, await voice.speak(body));
    },
  };
}
