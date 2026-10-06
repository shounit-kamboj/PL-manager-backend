import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/index.js";
import * as schema from "../db/schema/auth.js";
import { sendEmail } from "./email.js";

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
            console.log(`Reset link for ${user.email}: ${url}`);
        },
        revokeSessionsOnPasswordReset: true,
    },
    session: {
        expiresIn: 60 * 60 * 24 ,       // 1 day
        updateAge: 60 * 60 * 6,      // refresh 4 times per day of activity
    },
});