import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/index.js";
import * as schema from "../db/schema/auth.js";
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_KEY);

export const auth = betterAuth({
    secret: process.env.AUTH_SECRET!,
    trustedOrigins: [process.env.FRONTEND_URL!],
    database: drizzleAdapter(db, {
        provider: "pg",
        schema,
    }),
    emailAndPassword: {
        enabled: true,
        sendResetPassword: async ({ user, url }) => {
            resend.emails.send({
                from: 'no-reply@collarpl.com',
                to: user.email,
                subject: 'CollarPL Password Reset',
                html: `<p>Hello ${user.name},</p> ` +
                    `<p><a href="${url}">Reset your CollarPL password here.</a></p>`+
                    `<p>If you didn't ask to reset your password, you can safely ignore this email—your current password will remain unchanged.</p>`
            });
        },
        revokeSessionsOnPasswordReset: true,
    },
    session: {
        expiresIn: 60 * 60 * 24 ,       // 1 day
        updateAge: 60 * 60 * 6,      // refresh 4 times per day of activity
    },
});