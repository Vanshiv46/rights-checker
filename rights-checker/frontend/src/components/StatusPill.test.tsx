import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Verdict } from '../lib/types';
import { StatusPill } from './StatusPill';

describe('StatusPill', () => {
  it.each<[Verdict, string]>([
    ['LIKELY', 'Likely'],
    ['NEEDS_VERIFICATION', 'Needs verification'],
    ['NOT_ELIGIBLE', 'Not eligible'],
  ])('shows the word for %s', (verdict, word) => {
    render(<StatusPill verdict={verdict} />);
    expect(screen.getByText(word)).toBeInTheDocument();
  });

  it('never shows a bare "Eligible" label', () => {
    render(<StatusPill verdict="LIKELY" />);
    expect(screen.queryByText(/^eligible$/i)).not.toBeInTheDocument();
  });
});
