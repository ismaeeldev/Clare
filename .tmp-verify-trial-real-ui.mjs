import { chromium } from "playwright";

const BASE = "https://clare-app-rho.vercel.app";
const email = `clare-trial-realui-${Date.now()}@mailinator.com`;
const password = "TestPass123!";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  console.log("Signing up via real UI:", email);
  await page.goto(`${BASE}/sign-up`);
  await page.waitForLoadState("networkidle");

  const emailInput = page.locator('input[type="email"]').first();
  const passwordInputs = page.locator('input[type="password"]');
  await emailInput.fill(email);
  const pwCount = await passwordInputs.count();
  for (let i = 0; i < pwCount; i++) {
    await passwordInputs.nth(i).fill(password);
  }
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  console.log("URL_AFTER_SIGNUP:", page.url());

  // Navigate straight to billing to check trial status
  await page.goto(`${BASE}/billing`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "D:\\WEB DEV\\Wapis\\Clare\\.tmp-trial-real-billing.png" });

  const bodyText = await page.locator("body").innerText();
  console.log("HAS_ESSAI_EN_COURS:", /Essai gratuit en cours/i.test(bodyText));
  console.log("HAS_PLAN_MEMBRE:", /Plan Claré Membre/i.test(bodyText));

  // Also confirm chat access works for this brand-new account via the real UI
  await page.goto(`${BASE}/chat`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  const chatBodyText = await page.locator("body").innerText();
  const isLockedOut = /abonnement actif est requis|réservé aux membres premium/i.test(chatBodyText);
  console.log("CHAT_LOCKED_OUT (expect false):", isLockedOut);

  console.log("CONSOLE_ERRORS:", JSON.stringify(errors.slice(0, 5)));
  console.log("\nEMAIL_FOR_CLEANUP:", email);

  await browser.close();
}

main().catch((e) => {
  console.error("SCRIPT_ERROR", e.message);
  process.exit(1);
});
