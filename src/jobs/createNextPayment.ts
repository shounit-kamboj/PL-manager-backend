//go thru payments and create next payment if past due, paid/paidlate and flag is true
//set past payment as iscurrent=false

// for every current payment with auto-renew on that has ended:
// turn the old one off and create the next one

import { and, eq, lt, sql, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { athletes, payments } from "../db/schema/index.js";

const BC_TZ = "America/Vancouver";

function bcToday(): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: BC_TZ }).format(new Date());
}

function addDays(date: Date, days: number): Date {
    const result = new Date(date);                      // copy, so the original isn't changed
    result.setUTCDate(result.getUTCDate() + days);
    return result;
}

export async function createNextPayments(): Promise<number> {
    const today = bcToday();

    // 1. find the payments that need renewing
    const toRenew = await db
        .select({
            payment: payments,
            cycleWeeks: athletes.paymentCycleLengthWeeks,
        })
        .from(payments)
        .innerJoin(athletes, eq(payments.athleteId, athletes.id))
        .where(and(
            eq(payments.isCurrent, true),
            eq(payments.createNextAutomatically, true),
            // TODO: only ones whose cycle has ended
            lt(payments.dueDate, sql`${today}::date`),
            eq(athletes.deleted, false),
            eq(athletes.isActive, true),
            eq(payments.deleted, false),
        ));
    let created = 0;

    // 2. renew them one at a time
    for (const { payment: old, cycleWeeks } of toRenew) {
        if (!cycleWeeks) continue;
        try {
            await db.batch([
                // turn the old one off
                db.update(payments)
                    .set({ isCurrent: false })
                    .where(and(
                        eq(payments.id, old.id),
                        eq(payments.isCurrent, true),
                        inArray(payments.paymentStatus, ["paid", "paid_late"]),
                    )),

                // create the next one
                db.insert(payments).values({
                    coachId: old.coachId,
                    athleteId: old.athleteId,
                    isCurrent: true,
                    createNextAutomatically: true,
                    // TODO: new end/due date = new start + cycle length
                    dueDate: addDays(old.dueDate, cycleWeeks *7),
                    // TODO: status = your "not paid yet" value
                    paymentStatus: "unpaid",
                }),
            ]);
            created++;
        } catch (err) {
            // one bad payment shouldn't stop the rest
            console.error(`createNextPayments: payment ${old.id} failed: ${err}`);
        }
    }

    return created;
}

void createNextPayments().then(n => { console.log(`created ${n}`); process.exit(0); });