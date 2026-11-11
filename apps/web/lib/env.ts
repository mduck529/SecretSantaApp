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
   * SMTP login for sending email (Gmail by default). Optional in development: without
   * SMTP_USER and SMTP_PASS, emails are printed to the server log instead of sent.
   */
  smtp: () => {
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!user || !pass) return null;
    return {
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 465),
      user,
      // Google shows app passwords in groups of four ("abcd efgh ijkl mnop"); spaces are not part of it.
      pass: pass.replace(/\s+/g, ""),
    };
  },
  /** Gmail only sends as the signed-in account, so the address must match SMTP_USER. */
  emailFrom: () => process.env.EMAIL_FROM || `Secret Santa <${process.env.SMTP_USER}>`,
  cronSecret: () => process.env.CRON_SECRET || null,
};
