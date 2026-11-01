import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { SchemeResult } from '../lib/types';
import { SchemeCard } from './SchemeCard';

const likely: SchemeResult = {
  scheme: 'PM-KISAN',
  verdict: 'LIKELY',
  reasons: ['household.owns_cultivable_land = true'],
  checksLeft: ['any_member.paid_income_tax_last_ay'],
  checklist: [],
};

const needs: SchemeResult = {
  scheme: 'IGNOAPS',
  member: 'mother',
  verdict: 'NEEDS_VERIFICATION',
  reasons: ['member.age = 66 (>= 60)'],
  missingFacts: ['household.bpl_status'],
  checklist: null,
};

function renderCard(result: SchemeResult) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SchemeCard result={result} />
    </MemoryRouter>,
  );
}

describe('SchemeCard', () => {
  it('shows scheme, pill and a readable one-line reason', () => {
    renderCard(likely);
    expect(screen.getByRole('heading', { name: 'PM-KISAN' })).toBeInTheDocument();
    expect(screen.getByText('Likely')).toBeInTheDocument();
    expect(screen.getByText('Household owns farmland: Yes')).toBeInTheDocument();
  });

  it('shows the missing fact and the member for verification cases', () => {
    renderCard(needs);
    expect(screen.getByText('Needs verification')).toBeInTheDocument();
    expect(screen.getByText('Still to check: BPL status')).toBeInTheDocument();
    expect(screen.getByText('For: Mother')).toBeInTheDocument();
  });

  it('links to the scheme detail for that member', () => {
    renderCard(needs);
    expect(screen.getByRole('link', { name: /IGNOAPS/ })).toHaveAttribute(
      'href',
      '/scheme/IGNOAPS?m=mother',
    );
  });
});
