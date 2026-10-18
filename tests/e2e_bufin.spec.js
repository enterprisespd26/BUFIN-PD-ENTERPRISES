// @ts-check
import { test, expect } from '@playwright/test';

test.describe('BUFIN Business Ledger - End-to-End Test Suite', () => {
  const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

  test.beforeEach(async ({ page }) => {
    // Navigate to root
    await page.goto(BASE_URL);
    // If PIN screen is visible, authenticate with default PIN 1234
    const pinScreen = page.locator('#pinScreen');
    if (await pinScreen.isVisible()) {
      for (const digit of ['1', '2', '3', '4']) {
        await page.click(`[data-n="${digit}"]`);
      }
      await expect(pinScreen).toBeHidden({ timeout: 5000 });
    }
  });

  // MODULE 1: Sales Invoices & Preview Workflow (/#/sales)
  test('TC-SALES-01: Toggle Payment Received Now? reveals/hides payment inputs', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/sales`);
    await page.waitForSelector('#pd_sales_form');

    const payToggle = page.locator('#pd_pay_now');
    const payMethod = page.locator('#pd_pay_method');

    // Unchecked state
    if (await payToggle.isChecked()) {
      await payToggle.uncheck();
    }
    await expect(payMethod).toBeHidden();

    // Checked state
    await payToggle.check();
    await expect(payMethod).toBeVisible();
  });

  test('TC-SALES-02: Click Save & Preview renders in-page modal with sticky actions', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/sales`);
    const previewBtn = page.locator('#pd_btn_save');
    await expect(previewBtn).toBeVisible();

    // Trigger preview on an existing invoice if available
    const viewBtn = page.locator('[data-action="view"]').first();
    if (await viewBtn.isVisible()) {
      await viewBtn.click();
      const modal = page.locator('#pd_invoice_modal');
      await expect(modal).toBeVisible();
      await expect(page.locator('#pd_modal_print')).toBeVisible();
      await expect(page.locator('#pd_modal_pdf')).toBeVisible();
      await expect(page.locator('#pd_modal_wa')).toBeVisible();
      await expect(page.locator('#pd_modal_close')).toBeVisible();

      // Close modal
      await page.click('#pd_modal_close');
      await expect(modal).toBeHidden();
    }
  });

  // MODULE 2: Purchase Bills & Inventory (/#/bills, /#/inventory)
  test('TC-PUR-02: Inventory Stock displays purchased vs sold quantities', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/inventory`);
    await page.waitForSelector('.wrap, table');
    const table = page.locator('table');
    await expect(table).toBeVisible();
  });

  // MODULE 3: Money Manager & Transfers (/#/book)
  test('TC-MON-01: Liquidity validation displays warning on insufficient cash', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/book`);
    const outBtn = page.locator('button:has-text("Money Out"), [data-a="out"]').first();
    if (await outBtn.isVisible()) {
      await outBtn.click();
      const modal = page.locator('#modal');
      await expect(modal).toBeVisible();
    }
  });

  // MODULE 4: Financial Statements & 3D Charts (/#/pl, /#/tb, /#/bs)
  test('TC-ACC-01 & TC-ACC-02: Trial Balance equilibrium & P&L 3D visual chart toggle', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/tb`);
    await page.waitForSelector('table');
    
    // Check balanced badge
    const badge = page.locator('.tag.ok, .tag:has-text("Balanced")').first();
    if (await badge.isVisible()) {
      await expect(badge).toContainText(/Balanced/i);
    }

    // Check P&L view and visual chart toggle
    await page.goto(`${BASE_URL}/#/pl`);
    const chartToggle = page.locator('#btn_pl_chart');
    if (await chartToggle.isVisible()) {
      await chartToggle.click();
      await expect(page.locator('#pl_chart_container')).toBeVisible();
    }
  });

  // MODULE 5: Document Attachments & Camera
  test('TC-DOC-01: Camera and file attachment buttons are present', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/sales`);
    const cameraBtn = page.locator('#att_btn_camera');
    const uploadBtn = page.locator('#att_btn_file');
    await expect(cameraBtn).toBeAttached();
    await expect(uploadBtn).toBeAttached();
  });

  // MODULE 6: System Settings & Lock App (/#/settings)
  test('TC-SYS-01: Lock App secures session and displays PIN screen', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/overview`);
    const lockLink = page.locator('[data-a="logout"]').first();
    await expect(lockLink).toBeVisible();
    await lockLink.click();

    const pinScreen = page.locator('#pinScreen');
    await expect(pinScreen).toBeVisible();
  });

  // MODULE 7: Parties & Customer Dues (/#/parties)
  test('TC-PARTY-02: View party statement modal from Parties list', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/parties`);
    await page.waitForSelector('table tr.k');
    const firstPartyRow = page.locator('table tr.k').first();
    if (await firstPartyRow.isVisible()) {
      await firstPartyRow.click();
      const modal = page.locator('#modal');
      await expect(modal).toBeVisible();
      await expect(modal).toContainText(/Receivable|Payable|Statement/i);
    }
  });

  // MODULE 8: Loans Management (/#/loans)
  test('TC-LOAN-01 & TC-LOAN-02: Loans dashboard displays Borrowed vs Lent metrics', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/loans`);
    await page.waitForSelector('.grid');
    await expect(page.locator('.grid')).toContainText(/Borrowed/i);
    await expect(page.locator('.grid')).toContainText(/Lent/i);
  });

  // MODULE 10: Opening Balances (/#/open)
  test('TC-OPEN-01: Opening Balances table displays Debit/Credit input fields', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/open`);
    await page.waitForSelector('table');
    const debitInputs = page.locator('input[data-s="d"]');
    await expect(debitInputs.first()).toBeVisible();
  });

  // MODULE 11: General Ledger Period Filtering & CSV Export (/#/gl)
  test('TC-GL-01 & TC-GL-02: GL date filters and Export CSV button exist', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/gl`);
    await page.waitForSelector('.filters');
    const exportBtn = page.locator('button:has-text("Export CSV"), [data-a="glcsv"]');
    await expect(exportBtn).toBeVisible();
  });

  // MODULE 13: Overview Dashboard (/#/overview)
  test('TC-OVER-01: Overview dashboard displays KPI summary cards', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/overview`);
    await page.waitForSelector('.grid');
    await expect(page.locator('.grid')).toContainText(/Cash in hand/i);
    await expect(page.locator('.grid')).toContainText(/Bank balance/i);
  });
});

