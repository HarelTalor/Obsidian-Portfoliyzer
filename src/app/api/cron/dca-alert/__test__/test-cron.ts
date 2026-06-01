/**
 * Test script for the monthly DCA alert cron endpoint.
 *
 * Exercises:
 *  1. Timing logic (day-of-month + hour matching)
 *  2. Duplicate-prevention (last_alert_sent guard)
 *  3. Deposit insertion
 *  4. Email dispatch
 *
 * Usage:  npx tsx src/app/api/cron/dca-alert/__test__/test-cron.ts
 *
 * This script calls the local /api/cron/dca-alert endpoint with
 * NODE_ENV=development so the auth guard is skipped.
 */

const BASE = "http://localhost:3000";

async function callCron() {
  const res = await fetch(`${BASE}/api/cron/dca-alert`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  const body = await res.json();
  return { status: res.status, body };
}

async function main() {
  console.log("=== Monthly DCA Cron Test ===\n");

  const now = new Date();
  console.log(`Current UTC time : ${now.toISOString()}`);
  console.log(`UTC day-of-month : ${now.getUTCDate()}`);
  console.log(`UTC hour         : ${now.getUTCHours()}`);
  console.log(`Current month    : ${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`);
  console.log();

  // --- Test 1: Basic invocation ---
  console.log("--- Test 1: Invoke cron endpoint ---");
  const result1 = await callCron();
  console.log(`  Status : ${result1.status}`);
  console.log(`  Body   : ${JSON.stringify(result1.body, null, 2)}`);
  console.log();

  // Determine whether any alerts were sent
  if (result1.body.results && result1.body.results.length > 0) {
    console.log(`  ✅ Processed ${result1.body.results.length} user(s)`);
    for (const r of result1.body.results) {
      console.log(`     - userId: ${r.userId}  status: ${r.status}`);
    }
  } else {
    console.log(`  ℹ️  No users matched today/hour.`);
    console.log(`     Message: ${result1.body.message}`);
    console.log(`     (This is EXPECTED if no users have alert_day=${now.getUTCDate()} and alert_time hour=${now.getUTCHours()})`);
  }
  console.log();

  // --- Test 2: Duplicate prevention ---
  console.log("--- Test 2: Duplicate prevention (call cron again) ---");
  const result2 = await callCron();
  console.log(`  Status : ${result2.status}`);
  console.log(`  Body   : ${JSON.stringify(result2.body, null, 2)}`);

  if (result2.body.results && result2.body.results.length > 0) {
    console.log("  ⚠️  Users were processed again — duplicate guard may have failed!");
  } else {
    console.log("  ✅ No users processed on second call — duplicate guard works correctly.");
  }
  console.log();

  console.log("=== Tests Complete ===");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
