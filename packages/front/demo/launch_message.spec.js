const { test, expect } = require('@playwright/test');

test('displays a random launch message on startup', async ({ page }) => {
  // Go to the app
  await page.goto('http://localhost:4004');

  // The loading overlay should be visible initially
  const loadingOverlay = page.locator('.loading-overlay');
  await expect(loadingOverlay).toBeVisible();

  // The loading message should contain one of the expected emojis or text patterns
  // Since it's random, we check for the presence of the .loading-message element
  const loadingMessage = page.locator('.loading-message');
  await expect(loadingMessage).not.toBeEmpty();

  const text = await loadingMessage.innerText();
  console.log('Detected launch message:', text);

  // Verify it's not the old "Launching app" text
  expect(text).not.toContain('Launching app');
});
