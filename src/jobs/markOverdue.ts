// go thru payments and mark overdue
// for every payment, no flags needed

import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { payments } from "../db/schema/index.js";

const BC_TZ = "America/Vancouver";

// today's date in BC as "YYYY-MM-DD" (en-CA formats dates that way)
function bcToday(): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: BC_TZ }).format(new Date());
}

export async function markOverduePayments(): Promise<number> {
    const today = bcToday();

    const updated = await db
        .update(payments)
        .set({
            paymentStatus: "overdue"
        })
        .where(and(
            // TODO: only payments that are still unpaid   -> eq(...)
            eq(payments.paymentStatus, "unpaid"),
            // TODO: only payments due before today        -> lt(<due date column>, sql`${today}::date`)
            lt(payments.dueDate, sql`${today}::date`)
        ))
        .returning({ id: payments.id });

    return updated.length;
}

async function main() {
    try {
        const count = await markOverduePayments();
        console.log(`markOverduePayments: ${count} payment(s) marked overdue`);
        process.exit(0);
    } catch (err) {
        console.error(`markOverduePayments failed: ${err}`);
        process.exit(1);
    }
}

void main();