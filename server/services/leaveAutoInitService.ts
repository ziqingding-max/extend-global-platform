/**
 * Leave Auto-Initialization Service
 *
 * Handles automatic initialization of customer leave policies
 * when a new employee is onboarded in a country that the customer
 * has not yet configured leave policies for.
 */

import { getDb } from "../db";
import { listLeaveTypesByCountry, listCustomerLeavePolicies, createCustomerLeavePolicy } from "../db";
import { notificationService } from "./notificationService";
import { customerLeavePolicies, countriesConfig } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

/**
 * Auto-initialize leave policies for a customer's country if not already configured.
 *
 * This is triggered when an employee is created (via any channel: admin, portal, self-service).
 * If the customer does not yet have leave policies for the employee's country,
 * statutory defaults are used to create them, and a notification is sent to the client.
 *
 * @param customerId - The customer ID
 * @param countryCode - The employee's employment country code
 * @returns Object with `initialized` (boolean) and `count` (number of policies created)
 */
export async function autoInitializeLeavePolicyForCountry(
  customerId: number,
  countryCode: string
): Promise<{ initialized: boolean; count: number }> {
  const db = await getDb();
  if (!db) return { initialized: false, count: 0 };

  try {
    // 1. Check if customer already has leave policies for this country
    const existingPolicies = await listCustomerLeavePolicies(customerId, countryCode);
    if (existingPolicies.length > 0) {
      // Already initialized — skip
      return { initialized: false, count: 0 };
    }

    // 2. Get statutory leave types for this country
    const statutoryTypes = await listLeaveTypesByCountry(countryCode);
    if (statutoryTypes.length === 0) {
      console.log(`[LeaveAutoInit] No statutory leave types found for country ${countryCode}, skipping.`);
      return { initialized: false, count: 0 };
    }

    // 3. Create customer leave policies from statutory defaults
    let created = 0;
    for (const lt of statutoryTypes) {
      await createCustomerLeavePolicy({
        customerId,
        countryCode,
        leaveTypeId: lt.id,
        annualEntitlement: lt.annualEntitlement ?? 0,
        expiryRule: "year_end",
        carryOverDays: 0,
      });
      created++;
    }

    console.log(`[LeaveAutoInit] Initialized ${created} leave policies for customer ${customerId}, country ${countryCode}`);

    // 4. Get country name for notification
    const [countryInfo] = await db
      .select({ countryName: countriesConfig.countryName })
      .from(countriesConfig)
      .where(eq(countriesConfig.countryCode, countryCode))
      .limit(1);

    const countryName = countryInfo?.countryName || countryCode;

    // 5. Send notification to client
    notificationService.send({
      type: "leave_policy_country_activated",
      customerId,
      data: {
        countryName,
        countryCode,
        policyCount: created,
      },
    }).catch(err => {
      console.error(`[LeaveAutoInit] Failed to send notification for customer ${customerId}:`, err);
    });

    return { initialized: true, count: created };
  } catch (err) {
    console.error(`[LeaveAutoInit] Error initializing leave policies for customer ${customerId}, country ${countryCode}:`, err);
    return { initialized: false, count: 0 };
  }
}
