// for every current training block with auto-renew on that has ended:
// turn the old one off and create the next one

import { and, eq, lte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { athletes, trainingBlocks } from "../db/schema/index.js";

const BC_TZ = "America/Vancouver";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function bcToday(): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: BC_TZ }).format(new Date());
}

function addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
}

export async function createNextBlocks(): Promise<number> {
    const today = bcToday();

    // 1. find the blocks that need renewing
    const toRenew = await db
        .select({ block: trainingBlocks })
        .from(trainingBlocks)
        .innerJoin(athletes, eq(trainingBlocks.athleteId, athletes.id))
        .where(and(
            // TODO: current blocks only
            eq(trainingBlocks.isCurrent, true),
            // TODO: auto-renew on
            eq(trainingBlocks.createNextAutomatically, true),
            // TODO: not deleted
            eq(trainingBlocks.deleted, false),
            // TODO: ended before today
            // lte, not lt: a block is over on its end date, which is the day the next one starts
            lte(trainingBlocks.endDate, sql`${today}::date`),
            // TODO: athlete not deleted and still active
            eq(athletes.deleted, false),
            eq(athletes.isActive, true),
        ));

    let created = 0;

    // 2. renew them one at a time
    for (const { block: old } of toRenew) {
        // TODO: work out the old block's length in days
        const daysInBetween = Math.round((old.endDate.getTime() - old.startDate.getTime()) / MS_PER_DAY);
        // a block that starts and ends on the same day would renew into another already-ended block every night
        if (daysInBetween < 1) continue;
        // TODO: new start date
        const newStart = old.endDate;
        // TODO: new end date
        const newEnd = addDays(newStart, daysInBetween);
        try {
            await db.batch([
                // TODO: turn the old one off
                db.update(trainingBlocks)
                    .set({ isCurrent: false })
                    .where(and(eq(trainingBlocks.id, old.id), eq(trainingBlocks.isCurrent, true))),


                // TODO: insert the next one

                db.insert(trainingBlocks).values({
                    coachId: old.coachId,
                    athleteId: old.athleteId,
                    name: "New Block",
                    startDate: newStart,
                    endDate: newEnd,
                    lastUpdate: newStart,
                    daysBetweenUpdates: old.daysBetweenUpdates,
                    sendPostBlockOverviewReminder: old.sendPostBlockOverviewReminder,
                    link: old.link,
                    isCurrent: true,
                    createNextAutomatically: true,
                }),
            ]);
            created++;
        } catch (err) {
            console.error(`createNextBlocks: block ${old.id} failed: ${err}`);
        }
    }

    return created;
}

void createNextBlocks().then(n => { console.log(`created ${n}`); process.exit(0); });