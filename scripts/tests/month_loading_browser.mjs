// Browser test of month by month shift loading (src/lib/shiftMonths.js), in mock mode (no database).
//
// How to run:
//   1. Make sure .env.local is NOT present (mock mode), then: npx vite --port 5199 --strictPort
//   2. node scripts/tests/month_loading_browser.mjs <folder for screenshots>
// Needs Playwright with a Chromium. Set PW_CHROMIUM to a browser path if it is not the default.
// It seeds 3 fake employees with shifts every day from 2026-01-01 to 2027-04-30, counts the month
// requests, slows them down to check the page never freezes, and runs copy, clear, delete and undo
// across month boundaries. Note: checks 1 to 4 assume today is in October 2026; adjust the expected
// month lists if you run it later.
import { createRequire } from "module";
const require = createRequire(process.env.PLAYWRIGHT_REQUIRE_FROM || import.meta.url);
const { chromium } = require("playwright");

const BASE = "http://localhost:5199";
const OUT = process.argv[2] || ".";
let failures = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name} ${extra}`); if (!ok) failures++; };

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on("pageerror", (e) => { console.log("PAGEERROR", e.message); failures++; });

// Seeds the in memory store (survives only until the next full reload) and wraps listRange so we can
// count requests and add a delay.
async function setup(delayMs) {
  await page.evaluate(async (delayMs) => {
    const { mockApi } = await import("/src/api/mockApi.js");
    const { queryClientInstance } = await import("/src/lib/query-client.js");
    const S = mockApi.entities.Shift;
    if (!window.__seeded) {
      const emps = await mockApi.entities.Employee.bulkCreate([
        { name: "Test A", color: "#FF8C00" }, { name: "Test B", color: "#3B82F6" }, { name: "Test C", color: "#10B981" },
      ]);
      const rows = [];
      const pad = (n) => String(n).padStart(2, "0");
      for (let d = new Date(2026, 0, 1); d <= new Date(2027, 3, 30); d.setDate(d.getDate() + 1)) {
        const ds = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        for (const e of emps) rows.push({ employee_id: e.id, employee_name: e.name, color: e.color, date: ds, start_time: "10:00", end_time: "16:00", tentative: false });
      }
      await S.bulkCreate(rows);
      window.__orig = S.listRange;
      window.__seeded = true;
    }
    window.__calls = [];
    window.__delay = delayMs;
    S.listRange = async (from, to) => {
      window.__calls.push(from.slice(0, 7));
      await new Promise((r) => setTimeout(r, window.__delay));
      return window.__orig(from, to);
    };
    queryClientInstance.clear();
  }, delayMs);
}
const calls = () => page.evaluate(() => window.__calls.slice());
const resetCalls = () => page.evaluate(() => { window.__calls = []; });
const setDelay = (ms) => page.evaluate((ms) => { window.__delay = ms; }, ms);
const header = () => page.locator("p.text-sm.text-gray-400.mt-1").innerText();
const prev = () => page.locator("button:has(svg.lucide-chevron-left)").last().click();
const next = () => page.locator("button:has(svg.lucide-chevron-right)").last().click();
const today = () => page.getByRole("button", { name: "Today" }).click();
const waitLoaded = () => page.waitForFunction(() => !document.body.innerText.includes("Loading shifts"), null, { timeout: 15000 });
const setView = (weekISO, dayISO = null) => page.evaluate(([w, d]) => localStorage.setItem("dashboard_view_state", JSON.stringify({ weekStartISO: new Date(w + "T00:00:00").toISOString(), selectedDayISO: d ? new Date(d + "T00:00:00").toISOString() : null })), [weekISO, dayISO]);

// Each full reload wipes the mock store, so every scenario seeds again after the reload.
async function freshLoad(weekISO, dayISO, delay) {
  await page.goto(BASE + "/");
  await page.waitForTimeout(800);
  await page.evaluate(() => { window.__seeded = false; });
  await setup(delay);
  await setView(weekISO, dayISO);
  // Remount the Dashboard with an empty cache so it loads like a fresh page.
  await page.evaluate(async () => {
    const go = (p) => { history.pushState({}, "", p); dispatchEvent(new PopStateEvent("popstate")); };
    go("/Employees");
    await new Promise((r) => setTimeout(r, 300));
    const { queryClientInstance } = await import("/src/lib/query-client.js");
    queryClientInstance.clear();
    window.__calls = [];
    go("/Dashboard");
  });
}

// 1. Current week (today 2026-10-22): loads Sep, Oct, Nov only.
await freshLoad("2026-10-19", null, 50);
await waitLoaded();
let c = (await calls()).sort();
check("1 initial load fetches only Sep Oct Nov", JSON.stringify(c) === JSON.stringify(["2026-09", "2026-10", "2026-11"]), JSON.stringify(c));
check("1 week shows 21 shifts", (await header()).includes("21 shifts this week"), await header());

// 2. Moving inside loaded months makes no request.
await resetCalls();
await next(); await next(); await prev(); await prev(); await prev();
await page.waitForTimeout(400);
c = await calls();
// Entering November also pulls in December in the background (viewed month plus one each side).
check("2 moving between weeks: only the new neighbor month (Dec) fetched, once", JSON.stringify(c) === JSON.stringify(["2026-12"]), JSON.stringify(c));

// 3. Moving far back with a slow database: page never freezes, grid fills in when data arrives.
await setDelay(1500);
await resetCalls();
for (let i = 0; i < 4; i++) await prev(); // back into September
const t0 = Date.now();
for (let i = 0; i < 6; i++) await prev(); // into August/July: months not loaded
const clickMs = Date.now() - t0;
check("3 six week clicks while loading respond fast", clickMs < 2500, `${clickMs}ms`);
await page.screenshot({ path: OUT + "/3-loading.png" });
const loadingVisible = await page.getByText("Loading shifts").isVisible();
check("3 'Loading shifts' shown while month loads", loadingVisible);
await waitLoaded();
check("3 week fills in after load", (await header()).includes("21 shifts this week"), await header());
await page.screenshot({ path: OUT + "/3-loaded.png" });
c = await calls();
check("3 only missing months requested, no duplicates", new Set(c).size === c.length, JSON.stringify(c));

// 4. Reload on an old week (2026-06-08): loads that week's months AND today's months; Today is instant.
await freshLoad("2026-06-08", null, 50);
await waitLoaded();
c = (await calls()).sort();
check("4 reload on past week loads May Jun Jul + Sep Oct Nov", JSON.stringify(c) === JSON.stringify(["2026-05", "2026-06", "2026-07", "2026-09", "2026-10", "2026-11"]), JSON.stringify(c));
await resetCalls();
await today();
await page.waitForTimeout(300);
check("4 Today shows shifts with no new request", (await header()).includes("21 shifts this week") && (await calls()).length === 0, (await header()) + " calls=" + JSON.stringify(await calls()));

// 5. Clear week, then copy previous week across a month boundary (week of 2027-03-01, previous week in February).
const count = (from, to) => page.evaluate(async ([f, t]) => (await window.__orig(f, t)).length, [from, to]);
const waitHeader = (txt) => page.waitForFunction((t) => document.body.innerText.includes(t), txt, { timeout: 10000 }).catch(() => {});
await freshLoad("2027-03-01", null, 50);
await waitLoaded();
const weekMenu = page.locator("button:has(svg.lucide-copy)").first();
await weekMenu.click();
await page.getByRole("button", { name: "Clear all shifts this week" }).click();
await page.getByRole("button", { name: "Yes, clear" }).click();
await waitHeader("0 shifts this week");
check("5 clear week leaves 0 shifts", (await header()).includes("0 shifts this week") && (await count("2027-03-01", "2027-03-08")) === 0, await header());
await weekMenu.click();
await page.getByRole("button", { name: "Copy previous week's schedule" }).click();
await page.getByRole("button", { name: "Yes, copy week" }).click();
await waitHeader("21 shifts this week");
check("5 copy previous week from February gives 21 shifts", (await header()).includes("21 shifts this week"), await header());
check("5 store has exactly 21 that week (no duplicates)", (await count("2027-03-01", "2027-03-08")) === 21);

// 6. Undo twice: back to empty, then back to the original 21.
await page.locator("body").click({ position: { x: 5, y: 5 } });
await page.keyboard.press("Control+z");
await waitHeader("0 shifts this week");
check("6 undo copy week", (await count("2027-03-01", "2027-03-08")) === 0, await header());
await page.keyboard.press("Control+z");
await waitHeader("21 shifts this week");
check("6 undo clear week restores 21", (await count("2027-03-01", "2027-03-08")) === 21 && (await header()).includes("21 shifts this week"), await header());

// 7. Day view on Monday 2027-03-01: clear day, copy previous day (Sunday Feb 28, other month).
await freshLoad("2027-03-01", "2027-03-01", 50);
await waitLoaded();
const dayMenu = page.locator("button:has(svg.lucide-copy)").first();
await dayMenu.click();
await page.getByRole("button", { name: "Clear all shifts for this day" }).click();
await page.getByRole("button", { name: "Yes, clear" }).click();
await page.waitForTimeout(800);
check("7 clear day leaves 0", (await count("2027-03-01", "2027-03-02")) === 0);
await dayMenu.click();
await page.getByRole("button", { name: "Copy previous day's shifts" }).click();
await page.getByRole("button", { name: "Yes, copy shifts" }).click();
await page.waitForTimeout(800);
check("7 copy previous day from Feb 28 gives 3", (await count("2027-03-01", "2027-03-02")) === 3, String(await count("2027-03-01", "2027-03-02")));
await page.screenshot({ path: OUT + "/7-day.png" });

// 8. Day view arrows across a month boundary (Mar 1 -> Feb 28) show that day's shifts.
await page.locator("button:has(svg.lucide-chevron-left)").last().click();
await page.waitForTimeout(500);
const bodyTxt = await page.innerText("body");
check("8 previous day (Feb 28) shows its shifts", bodyTxt.includes("Test A") && !bodyTxt.includes("Loading shifts"));

// 9. Single shift delete and save through the shift window (optimistic updates over month caches).
await freshLoad("2027-03-01", null, 50);
await waitLoaded();
await page.locator("[title^=\"Test A:\"]").first().click();
await page.getByRole("button", { name: "Delete" }).click();
await waitHeader("20 shifts this week");
check("9 delete one shift: header 20 and store 20", (await header()).includes("20 shifts this week") && (await count("2027-03-01", "2027-03-08")) === 20, await header());
await page.locator("[title^=\"Test B:\"]").first().click();
await page.getByRole("button", { name: "Save Changes" }).click();
await page.waitForTimeout(600);
check("9 save existing shift keeps 20", (await header()).includes("20 shifts this week") && (await count("2027-03-01", "2027-03-08")) === 20, await header());
await page.locator("body").click({ position: { x: 5, y: 5 } });
await page.keyboard.press("Control+z"); // undoes the save
await page.waitForTimeout(800);
await page.keyboard.press("Control+z"); // undoes the delete
await waitHeader("21 shifts this week");
check("9 undo delete restores 21", (await count("2027-03-01", "2027-03-08")) === 21 && (await header()).includes("21 shifts this week"), await header());

console.log(failures === 0 ? "ALL PASSED" : `FAILURES: ${failures}`);
await browser.close();
process.exit(failures ? 1 : 0);
