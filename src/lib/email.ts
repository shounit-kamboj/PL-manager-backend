import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail({ to, subject, text }: { to: string; subject: string; text: string }) {
    const { error } = await resend.emails.send({
        from: process.env.EMAIL_FROM!,
        to,
        subject,
        text,
    });
    if (error) console.error("Email send error:", error);
}