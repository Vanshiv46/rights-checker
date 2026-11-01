import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QUESTION_BANK } from '../lib/questions';
import { QuestionCard } from './QuestionCard';

const question = QUESTION_BANK[0]!;

function setup() {
  const onAnswer = vi.fn();
  const onVoiceText = vi.fn();
  render(
    <QuestionCard
      question={question}
      position={1}
      total={4}
      onAnswer={onAnswer}
      onVoiceText={onVoiceText}
    />,
  );
  return { onAnswer };
}

describe('QuestionCard', () => {
  beforeEach(() => {
    vi.stubGlobal('MediaRecorder', class {});
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn() },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows the question and progress', () => {
    setup();
    expect(
      screen.getByRole('heading', { name: 'Does your household own farmland?' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Question 1 of 4' })).toBeInTheDocument();
  });

  it("reports true, false and null (I don't know) answers", async () => {
    const { onAnswer } = setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Yes' }));
    await user.click(screen.getByRole('button', { name: 'No' }));
    await user.click(screen.getByRole('button', { name: "I don't know" }));
    expect(onAnswer.mock.calls).toEqual([[true], [false], [null]]);
  });

  it('shows the voice button online and hides it offline', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    setup();
    expect(screen.getByRole('button', { name: 'Speak your answer' })).toBeInTheDocument();
    online.mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));
    return vi.waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Speak your answer' })).not.toBeInTheDocument(),
    );
  });
});
