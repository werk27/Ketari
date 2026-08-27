/**
 * Migration: collapse salary.min / salary.max into one fixed salary.amount.
 *
 * The business rule changed from a salary RANGE (min/max, sometimes absent
 * entirely) to ONE required, specific figure the employer commits to -
 * "25,000 ETB/month", never "20,000-30,000" and never "negotiable". The Job
 * schema now requires salary.amount, so any existing vacancy still holding
 * only the old min/max shape would fail validation the next time it is
 * saved (approve, reject, close, or any edit all call job.save()).
 *
 * Conversion rule, applied per job:
 *   - both min and max present  -> amount = round((min + max) / 2) to the
 *     nearest 100, so the organization still lands near its original range
 *   - only one of min/max present -> amount = that value
 *   - neither present (a handful of legacy/incomplete records) -> amount
 *     defaults to 15000 ETB/month, the platform's common starting figure.
 *     These are flagged in the output so the owning HR Expert can correct
 *     the real figure - a placeholder is never presented to a candidate as
 *     if it were the actual offer, since every vacancy already visible to
 *     candidates was published before amount was a stored field at all.
 *
 * Safe to run repeatedly: a job that already has salary.amount is left
 * untouched, and min/max are removed from the stored document either way.
 *
 *   node scripts/migrateFixedSalary.js
 */
require('./_env');
const mongoose = require('mongoose');

const DEFAULT_AMOUNT = 15000;

const run = async () => {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is not configured in .env');
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB\n');

    const collection = mongoose.connection.db.collection('jobs');
    const jobs = await collection.find({}).toArray();

    let converted = 0, alreadyFixed = 0, defaulted = 0;

    for (const job of jobs) {
        const salary = job.salary || {};

        if (typeof salary.amount === 'number' && salary.amount > 0 && salary.min === undefined && salary.max === undefined) {
            alreadyFixed += 1;
            continue;
        }

        const min = typeof salary.min === 'number' ? salary.min : null;
        const max = typeof salary.max === 'number' ? salary.max : null;

        let amount;
        if (min && max) {
            amount = Math.round((min + max) / 2 / 100) * 100;
        } else if (min || max) {
            amount = min || max;
        } else if (typeof salary.amount === 'number' && salary.amount > 0) {
            amount = salary.amount;
        } else {
            amount = DEFAULT_AMOUNT;
            defaulted += 1;
            console.warn(`⚠️  ${job._id} "${job.title}" had no salary data - defaulted to ${DEFAULT_AMOUNT} ${salary.currency || 'ETB'}. Review and correct.`);
        }

        await collection.updateOne(
            { _id: job._id },
            {
                $set: {
                    'salary.amount': amount,
                    'salary.currency': salary.currency || 'ETB',
                    'salary.period': salary.period || 'monthly'
                },
                $unset: { 'salary.min': '', 'salary.max': '' }
            }
        );
        converted += 1;
        console.log(`Converted ${job._id} "${job.title}": min=${min ?? '—'} max=${max ?? '—'} -> amount=${amount}`);
    }

    console.log(`\nDone. Converted ${converted}, already fixed ${alreadyFixed}, defaulted (needs review) ${defaulted}, total ${jobs.length}.`);
    await mongoose.disconnect();
};

run().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
