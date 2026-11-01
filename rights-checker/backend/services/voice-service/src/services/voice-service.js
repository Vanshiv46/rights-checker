import { voiceUnavailable } from '../clients/groq-client.js';

/** Speech-to-text and text-to-speech. Audio is passed through, never stored or logged. */
export class VoiceService {
  constructor(speech) {
    this.speech = speech;
  }

  /** Transcribes audio; an empty transcript is treated as a failure so the UI falls back to text. */
  async transcribe(body) {
    const text = (await this.speech.transcribe(body.audioBase64, body.language)).trim();
    if (!text) throw voiceUnavailable();
    return { text, language: body.language };
  }

  /** Synthesises speech for a short text. */
  async speak(body) {
    const audioBase64 = await this.speech.speak(body.text, body.language, body.gender ?? 'female');
    if (!audioBase64) throw voiceUnavailable();
    return { audioBase64, mimeType: 'audio/wav' };
  }
}
