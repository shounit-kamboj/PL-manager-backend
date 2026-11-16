import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/index.js";
import * as schema from "../db/schema/auth.js";
import { Resend } from 'resend';
import {coaches} from "../db/schema/index.js";
import {eq} from "drizzle-orm";

const resend = new Resend(process.env.RESEND_KEY);

export const auth = betterAuth({
    secret: process.env.BETTER_AUTH_SECRET!,
    trustedOrigins: [process.env.FRONTEND_URL!],
    database: drizzleAdapter(db, {
        provider: "pg",
        schema,
    }),
    emailAndPassword: {
        enabled: true,
        requireEmailVerification: true,
        revokeSessionsOnPasswordReset: true,
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
    },
    emailVerification: {
        sendOnSignIn: true,
        sendVerificationEmail: async ({ user, url }) => {
            resend.emails.send({
                from: 'no-reply@collarpl.com',
                to: user.email,
                subject: "Verify your email address",
                text: `Click the link to verify your email: ${url}`,
            });
        },
    },

    user: {
        deleteUser: {
            enabled: true,
            deleteTokenExpiresIn: 60 * 60, // link lasts 1 hour (default is 24 hours)
            sendDeleteAccountVerification: async ({ user, url }) => {
                void resend.emails.send({
                    from: 'no-reply@collarpl.com',
                    to: user.email,
                    subject: 'Confirm deleting your CollarPL account',
                    html: `<p><a href="${url}">Permanently delete your CollarPL account</a>. ` +
                        `This deletes all your athletes and data and can't be undone. The link expires in 1 hour.</p>` +
                        `<p>Open this link in the browser where you’re signed in to CollarPL</p>`+
                        `<p>If you didn't ask for this, change your password.</p>`,
                });
            },
            beforeDelete: async (user) => {
                await db.delete(coaches).where(eq(coaches.userId, user.id));
            },
        },
    },


    session: {
        expiresIn: 60 * 60 * 24,       // 1 day
        updateAge: 60 * 60 * 6,      // refresh 4 times per day of activity
    },
});