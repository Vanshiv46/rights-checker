import { expect, test } from '@playwright/test';

test('citizen flow against the mock API, including going offline mid-session', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'English' }).click();
  await page.getByRole('button', { name: 'I agree' }).click();

  // One form: occupation decides which questions appear
  const land = page.getByRole('group', { name: 'Does your household own cultivable land?' });
  const tax = page.getByRole('group', { name: 'Did this person pay income tax last year?' });
  await expect(page.getByRole('group', { name: /Below Poverty Line/ })).toBeVisible();
  await expect(land).toHaveCount(0);
  await page.getByLabel('Age', { exact: true }).fill('40');
  await page.getByLabel('Occupation', { exact: true }).selectOption('student');
  await expect(land).toHaveCount(0);
  await page.getByLabel('Occupation', { exact: true }).selectOption('farmer');
  await expect(land).toBeVisible();
  await expect(tax).toHaveCount(1);
  await land.getByRole('button', { name: 'Yes', exact: true }).click();
  await tax.getByRole('button', { name: 'No', exact: true }).click();

  await page.getByRole('button', { name: 'Add member' }).click();
  await page.getByLabel('Relation', { exact: true }).nth(1).selectOption('mother');
  await page.getByLabel('Age', { exact: true }).nth(1).fill('66');
  await page.getByLabel('Occupation', { exact: true }).nth(1).selectOption('retired_government');
  await page.getByLabel(/Monthly pension/).fill('5000');
  await expect(page.getByLabel(/staff category/)).toHaveCount(0);
  await page.getByLabel(/Monthly pension/).fill('12000');
  await expect(page.getByLabel(/staff category/)).toBeVisible();

  // Offline: banner shows, the form still works
  await context.setOffline(true);
  await expect(page.getByRole('status').filter({ hasText: 'You are offline' })).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText('You are offline')).toHaveCount(0);

  await page.getByRole('button', { name: 'See my schemes' }).click();

  // Results
  await expect(page.getByRole('heading', { name: 'Your shortlist' })).toBeVisible();
  await expect(page.getByText('Likely', { exact: true })).toBeVisible();
  await expect(page.getByText('Needs verification', { exact: true })).toBeVisible();
  await expect(page.getByText('Still to check: BPL status')).toBeVisible();

  // Scheme detail and checklist
  await page.getByRole('link', { name: /See details: PM-KISAN/ }).click();
  await expect(page.getByText('Nearest Common Service Centre')).toBeVisible();
  await page.getByRole('link', { name: 'Open document checklist' }).click();
  await page.getByLabel('Land record details').click();
  await expect(page.getByLabel('Land record details')).toBeChecked();
  await expect(page.getByText('1 of 3 ready')).toBeVisible();

  // Saved results show the code, and work with the network off
  await page.getByRole('link', { name: 'Saved results' }).first().click();
  await expect(page.getByText('Your code')).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByText(/Results last evaluated on/)).toBeVisible();
});
