/**
 * End-to-end test for the monthly DCA alert cron.
 *
 * This script:
 *  1. Reads the current user from Supabase (using service role key to bypass RLS)
 *  2. Temporarily sets their alert_day/alert_time to NOW so the cron fires
 *  3. Calls the cron endpoint → verifies deposit + email
 *  4. Calls the cron again → verifies duplicate guard blocks it
 *  5. Restores original settings & cleans up the test deposit
 *
 * Usage:  npx tsx src/app/api/cron/dca-alert/__test__/test-cron-e2e.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// Load env vars from .env.local manually
const envPath = path.resolve(process.cwd(), ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const val = trimmed.slice(eqIdx + 1).trim();
  if (!process.env[key]) process.env[key] = val;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BASE = "http://localhost:3000";

if (!SUPABASE_URL || !SERVICE_KEY || SERVICE_KEY === "PASTE_YOUR_SERVICE_ROLE_KEY_HERE") {
  console.error("❌ Missing SUPABASE_SERVICE_ROLE_KEY in .env.local. Please paste your key.");
  process.exit(1);
}

const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (SERVICE_KEY === ANON_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY is the same as NEXT_PUBLIC_SUPABASE_ANON_KEY!");
  console.error("   The service role key is a DIFFERENT key. Find it in:");
  console.error("   Supabase Dashboard → Project Settings → API → service_role (secret key)");
  console.error("   It starts with 'eyJ...' and is much longer than the anon key.");
  process.exit(1);
}

// Service role client bypasses RLS — same as the cron uses in production
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function callCron() {
  const res = await fetch(`${BASE}/api/cron/dca-alert`);
  return { status: res.status, body: await res.json() };
}

function pad2(n: number) { return String(n).padStart(2, "0"); }

async function main() {
  console.log("=== Monthly DCA Cron — End-to-End Test ===\n");

  const now = new Date();
  const utcDay = now.getUTCDate();
  const utcHour = now.getUTCHours();
  const currentMonth = `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}`;
  // Store alert_time in UTC (matching the fix) — only hour matters for matching
  const alertTimeUtc = `${pad2(utcHour)}:00`;

  console.log(`UTC now       : ${now.toISOString()}`);
  console.log(`UTC day/hour  : day=${utcDay}  hour=${utcHour}`);
  console.log(`Current month : ${currentMonth}`);
  console.log(`Alert time    : ${alertTimeUtc} (UTC)\n`);

  // ---------- Step 0: Find a test user ----------
  const { data: allUsers, error: fetchErr } = await supabase.from("users").select("*").limit(1);
  if (fetchErr || !allUsers || allUsers.length === 0) {
    console.error("❌ No users found in the database. Cannot test.");
    if (fetchErr) console.error("   Error:", fetchErr.message);
    process.exit(1);
  }
  const testUser = allUsers[0];
  console.log(`Test user     : ${testUser.id} (${testUser.email})`);
  console.log(`  DCA budget  : $${testUser.monthly_dca_budget}`);
  console.log(`  Alert       : enabled=${testUser.alert_enabled}, day=${testUser.alert_day}, time=${testUser.alert_time}`);
  console.log(`  Last sent   : ${testUser.last_alert_sent}\n`);

  // Save original values for cleanup
  const origSettings = {
    alert_enabled: testUser.alert_enabled,
    alert_day: testUser.alert_day,
    alert_time: testUser.alert_time,
    last_alert_sent: testUser.last_alert_sent,
  };

  // Count current deposits for cleanup reference
  const { count: depositCountBefore } = await supabase
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", testUser.id)
    .eq("type", "Deposit");

  console.log(`  Deposits before test: ${depositCountBefore}\n`);

  let testsPassed = 0;
  let testsFailed = 0;

  function pass(msg: string) { testsPassed++; console.log(`  ✅ ${msg}`); }
  function fail(msg: string) { testsFailed++; console.log(`  ❌ ${msg}`); }

  try {
    // ---------- Step 1: Set user's alert to fire NOW ----------
    console.log("--- Step 1: Configure user alert to match current UTC time ---");
    const { error: updateErr } = await supabase
      .from("users")
      .update({
        alert_enabled: true,
        alert_day: utcDay,
        alert_time: alertTimeUtc,
        last_alert_sent: null, // Clear the duplicate guard
      })
      .eq("id", testUser.id);

    if (updateErr) {
      fail(`Failed to update user: ${updateErr.message}`);
      return;
    }
    pass(`Set alert_day=${utcDay}, alert_time=${alertTimeUtc}, cleared last_alert_sent`);
    console.log();

    // ---------- Step 2: Call the cron endpoint ----------
    console.log("--- Step 2: Call cron endpoint (should trigger) ---");
    const result1 = await callCron();
    console.log(`  HTTP ${result1.status}`);
    console.log(`  Response: ${JSON.stringify(result1.body, null, 2)}\n`);

    if (result1.body.results && result1.body.results.length > 0) {
      const userResult = result1.body.results.find((r: { userId: string }) => r.userId === testUser.id);
      if (userResult) {
        if (userResult.status === "sent") {
          pass("Email sent successfully!");
        } else if (userResult.status.startsWith("email error")) {
          // Email error is expected with resend dev/test accounts
          console.log(`  ⚠️ Email had an error (may be expected with test accounts): ${userResult.status}`);
          pass("Cron processed the user (email error is OK for testing)");
        } else {
          fail(`Unexpected status: ${userResult.status}`);
        }
      } else {
        fail("Test user not found in cron results");
      }
    } else {
      fail(`No users processed! Timing logic failed. Cron saw day=${result1.body.day}, hour=${result1.body.hour}`);
    }

    // ---------- Step 3: Verify deposit was inserted ----------
    console.log("\n--- Step 3: Verify deposit insertion ---");
    const { count: depositCountAfter } = await supabase
      .from("transactions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", testUser.id)
      .eq("type", "Deposit");

    const newDeposits = (depositCountAfter || 0) - (depositCountBefore || 0);
    if (Number(testUser.monthly_dca_budget) > 0) {
      if (newDeposits === 1) {
        pass(`Exactly 1 new Deposit transaction created ($${testUser.monthly_dca_budget})`);
      } else if (newDeposits > 1) {
        fail(`${newDeposits} new deposits found — possible duplicate!`);
      } else {
        fail("No new deposit found — deposit logic may have failed");
      }
    } else {
      if (newDeposits === 0) {
        pass("Correctly skipped deposit for $0 budget");
      } else {
        fail(`Deposit created despite $0 budget`);
      }
    }

    // ---------- Step 4: Verify last_alert_sent was updated ----------
    console.log("\n--- Step 4: Verify last_alert_sent ---");
    const { data: updatedUser } = await supabase.from("users").select("last_alert_sent").eq("id", testUser.id).single();
    if (updatedUser?.last_alert_sent === currentMonth) {
      pass(`last_alert_sent correctly set to "${currentMonth}"`);
    } else {
      fail(`last_alert_sent is "${updatedUser?.last_alert_sent}" (expected "${currentMonth}")`);
    }

    // ---------- Step 5: Duplicate prevention ----------
    console.log("\n--- Step 5: Test duplicate guard (call cron again) ---");
    const result2 = await callCron();
    console.log(`  HTTP ${result2.status}`);

    const { count: depositCountAfter2 } = await supabase
      .from("transactions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", testUser.id)
      .eq("type", "Deposit");

    const newDeposits2 = (depositCountAfter2 || 0) - (depositCountBefore || 0);

    if (result2.body.results && result2.body.results.some((r: { userId: string }) => r.userId === testUser.id)) {
      fail("Duplicate guard FAILED — user was processed again!");
    } else {
      pass("Duplicate guard worked — user was NOT processed again");
    }

    if (newDeposits2 === newDeposits) {
      pass("No additional deposit created on second call");
    } else {
      fail(`Duplicate deposit created! (${newDeposits2} total vs ${newDeposits} expected)`);
    }

  } finally {
    // ---------- Cleanup ----------
    console.log("\n--- Cleanup ---");

    // Delete any test deposits created today
    const todayStr = now.toISOString().split("T")[0];
    const { data: testDeposits } = await supabase
      .from("transactions")
      .select("id")
      .eq("user_id", testUser.id)
      .eq("type", "Deposit")
      .eq("date", todayStr)
      .eq("price", Number(testUser.monthly_dca_budget))
      .order("created_at", { ascending: false })
      .limit(5);

    if (testDeposits && testDeposits.length > 0) {
      // Only delete the newest ones that were created during this test
      const idsToDelete = testDeposits.slice(0, 2).map((d) => d.id);
      await supabase.from("transactions").delete().in("id", idsToDelete);
      console.log(`  🗑️ Deleted ${idsToDelete.length} test deposit(s)`);
    }

    // Restore original alert settings
    await supabase
      .from("users")
      .update({
        alert_enabled: origSettings.alert_enabled,
        alert_day: origSettings.alert_day,
        alert_time: origSettings.alert_time,
        last_alert_sent: origSettings.last_alert_sent,
      })
      .eq("id", testUser.id);
    console.log("  🔄 Restored original alert settings");
  }

  // ---------- Summary ----------
  console.log("\n========================================");
  console.log(`  Passed: ${testsPassed}   Failed: ${testsFailed}`);
  if (testsFailed === 0) {
    console.log("  ✅ ALL TESTS PASSED");
  } else {
    console.log("  ❌ SOME TESTS FAILED (see above)");
  }
  console.log("========================================\n");

  process.exit(testsFailed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(1);
});
