function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. See apps/web/.env.example.`);
  return value;
}

export const publicEnv = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
};

export const serverEnv = {
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  appUrl: () => required("APP_URL").replace(/\/+$/, ""),
  /**
   * SMTP login for sending email (Resend by default: SMTP_USER is "resend", SMTP_PASS is a
   * Resend API key). Optional in development: without SMTP_USER and SMTP_PASS, emails are
   * printed to the server log instead of sent.
   */
  smtp: () => {
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!user || !pass) return null;
    return {
      host: process.env.SMTP_HOST || "smtp.resend.com",
      port: Number(process.env.SMTP_PORT || 465),
      user,
      // Google shows app passwords in groups of four ("abcd efgh ijkl mnop"); spaces are never part of a password here.
      pass: pass.replace(/\s+/g, ""),
    };
  },
  /**
   * The sender. With Resend it must be on a domain verified in Resend (santa@bassl.xyz);
   * with Gmail it must be the signed-in account. Falls back to SMTP_USER when that is an address.
   */
  emailFrom: () => {
    if (process.env.EMAIL_FROM) return process.env.EMAIL_FROM;
    const user = process.env.SMTP_USER;
    return user?.includes("@") ? `Secret Santa <${user}>` : "Family Secret Santa <santa@bassl.xyz>";
  },
  /** Optional: without it, gift ideas are not generated and the panel keeps its "on their way" text. */
  anthropicApiKey: () => process.env.ANTHROPIC_API_KEY || null,
  cronSecret: () => process.env.CRON_SECRET || null,
};
