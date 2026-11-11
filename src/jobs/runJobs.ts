// runs the nightly jobs once, then exits
// Railway's cron service starts this file on a schedule

// TODO: import createNextPayments
// TODO: import createNextBlocks
import { markOverduePayments } from "./markOverdue.js";
import { createNextBlocks } from "./createNextBlock.js";
import { createNextPayments } from "./createNextPayment.js";

async function main() {
    let failed = false;

    try {
        const result = await createNextPayments();
        console.log(`createNextPayments: ${result.created} created, ${result.failed} failed`);
        if (result.failed > 0) failed = true;
    } catch (err) {
        console.error(`createNextPayments failed: ${err}`);
        failed = true;
    }
    try {
        const result = await createNextBlocks();
        console.log(`createNextBlocks: ${result.created} created, ${result.failed} failed`);
        if (result.failed > 0) failed = true;
    } catch (err) {
        console.error(`createNextBlocks failed: ${err}`);
        failed = true;
    }

    try {
        const count = await markOverduePayments();
        console.log(`markOverduePayments: ${count}`);
    } catch (err) {
        console.error(`markOverduePayments failed: ${err}`);
        failed = true;
    }

    process.exit(failed ? 1 : 0);
}

void main();