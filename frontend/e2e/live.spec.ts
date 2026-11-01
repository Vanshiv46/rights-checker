import { expect, test } from '@playwright/test';

/**
 * Full flow against the real backend (api-gateway on VITE_API_URL, see .env.live).
 * Run with: E2E_MODE=live npx playwright test e2e/live.spec.ts
 * Needs the backend running with seeded data and an admin account (ADMIN_EMAIL / ADMIN_PASSWORD).
 */
test.skip(process.env.E2E_MODE !== 'live', 'set E2E_MODE=live with the backend running');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@example.org';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'change-me-admin-password';

test('citizen flow and admin page against the running api-gateway', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'English' }).click();
  await page.getByRole('button', { name: 'I agree' }).click();

  // One form: self 40 (farmer) and mother 66 (retired, no pension), land yes, BPL yes
  await page.getByLabel('Age', { exact: true }).fill('40');
  await page.getByLabel('Occupation', { exact: true }).selectOption('farmer');
  await page.getByRole('button', { name: 'Add member' }).click();
  await page.getByLabel('Relation', { exact: true }).nth(1).selectOption('mother');
  await page.getByLabel('Age', { exact: true }).nth(1).fill('66');
  await page.getByLabel('Occupation', { exact: true }).nth(1).selectOption('retired_government');
  await page.getByLabel(/Monthly pension/).fill('0');
  const tax = page.getByRole('group', { name: 'Did this person pay income tax last year?' });
  await tax.nth(0).getByRole('button', { name: 'No', exact: true }).click();
  await tax.nth(1).getByRole('button', { name: 'No', exact: true }).click();
  await page
    .getByRole('group', { name: 'Does your household own cultivable land?' })
    .getByRole('button', { name: 'Yes', exact: true })
    .click();
  await page
    .getByRole('group', { name: /Below Poverty Line/ })
    .getByRole('button', { name: 'Yes', exact: true })
    .click();
  await page.getByRole('button', { name: 'See my schemes' }).click();

  // Verdicts come from the backend rules engine
  await expect(page.getByRole('heading', { name: 'Your shortlist' })).toBeVisible();
  await expect(page.getByText('Likely', { exact: true })).toHaveCount(2);

  // Detail, explanation with citation, checklist
  await page.getByRole('link', { name: /See details: PM-KISAN/ }).click();
  await expect(page.getByText('PM-KISAN Operational Guidelines, Section 2.4')).toBeVisible();
  await page.getByRole('button', { name: 'Explain in simple words' }).click();
  await expect(page.getByText('You may be eligible.', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'Open document checklist' }).click();
  await page.getByLabel('Land record details').click();
  await expect(page.getByText('1 of 3 ready')).toBeVisible();

  // Admin
  await page.goto('/operator');
  await page.getByLabel('Staff e-mail (CSC ID)').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  // The staff token lives in memory only, so navigate inside the app instead of reloading.
  await expect(page.getByText(`Assisted mode: ${ADMIN_EMAIL}`)).toBeVisible();
  await page.getByRole('link', { name: 'Admin' }).first().click();
  await expect(page.getByRole('heading', { name: 'Verification queue' })).toBeVisible();
  await expect(page.getByText(/PMMVY · pmmvy@v1/)).toBeVisible();
});
