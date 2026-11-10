// Measures the admin remount after a client-side login.
//
// Usage: node scripts/measure.mjs [baseURL] [runs]
// Default: http://localhost:3000, 20 runs. The dev or prod server must be running.
//
// For each run, in a fresh browser context:
//   1. log in through the default form at /admin/login;
//   2. as soon as the URL is /admin, press Tab (the nav toggler gets the focus);
//   3. wait 500 ms and record whether the focus is still on an element or fell to <body>,
//      and how many element nodes holding the admin template were removed from the DOM.
import { chromium } from '@playwright/test'

const baseURL = process.argv[2] ?? 'http://localhost:3000'
const runs = Number(process.argv[3] ?? 20)
const email = 'dev@example.com'
const password = 'test1234'

const browser = await chromium.launch()

async function ensureFirstUser() {
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()
  await page.goto('/admin')
  await page.waitForLoadState('networkidle')
  if (page.url().includes('/create-first-user')) {
    await page.fill('#field-email', email)
    await page.fill('#field-password', password)
    await page.fill('#field-confirm-password', password)
    await page.click('button[type="submit"]')
    await page.waitForURL((url) => url.pathname === '/admin')
    console.log('first user created')
  }
  await context.close()
}

async function measureOnce() {
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()
  await page.goto('/admin/login')
  await page.fill('#field-email', email)
  await page.fill('#field-password', password)

  // Counts removed element nodes that contain the admin template, from before the navigation.
  await page.evaluate(() => {
    window.__removedTemplates = 0
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.removedNodes) {
          if (node.nodeType === 1 && node.querySelector?.('.template-default, .nav')) {
            window.__removedTemplates++
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true })
  })

  await page.click('button[type="submit"]')
  await page.waitForURL((url) => url.pathname === '/admin')
  await page.keyboard.press('Tab')
  const focusedRightAfterTab = await page.evaluate(() => document.activeElement?.tagName)
  await page.waitForTimeout(500)

  const result = await page.evaluate(() => ({
    activeElement: document.activeElement?.tagName,
    removedTemplates: window.__removedTemplates,
  }))
  await context.close()
  return { focusedRightAfterTab, ...result }
}

await ensureFirstUser()

let kept = 0
let remounted = 0
for (let i = 1; i <= runs; i++) {
  const r = await measureOnce()
  const focusKept = r.activeElement !== 'BODY'
  if (focusKept) kept++
  if (r.removedTemplates > 0) remounted++
  console.log(
    `run ${i}: focus after Tab=${r.focusedRightAfterTab}, 500 ms later=${r.activeElement}, removed template nodes=${r.removedTemplates}`,
  )
}
console.log(`\nfocus kept: ${kept}/${runs} · template remounted: ${remounted}/${runs}`)

await browser.close()
