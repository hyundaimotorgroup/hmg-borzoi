import { z } from "zod";

export const timezoneOptions = [
  "UTC",
  "Asia/Seoul",
  "Asia/Tokyo",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
] as const;

export const themeOptions = ["light", "dark", "system"] as const;

export const generalSettingsSchema = z.object({
  appName: z.string().trim().min(1).max(100),
  defaultCluster: z.string().trim().min(1).max(100),
  refreshInterval: z.string().trim().min(1).max(10),
  cacheTTL: z
    .string()
    .trim()
    .regex(/^\d+$/, "Cache TTL must be a whole number.")
    .refine((value) => Number(value) >= 1, "Cache TTL must be at least 1 second."),
  timezone: z.enum(timezoneOptions),
  language: z.string().trim().min(1).max(20),
});

export const displaySettingsSchema = z.object({
  theme: z.enum(themeOptions),
  compactMode: z.boolean(),
  showGridLines: z.boolean(),
  defaultChartType: z.string().trim().min(1).max(30),
});

export type GeneralSettingsFormValues = z.infer<typeof generalSettingsSchema>;
export type DisplaySettingsFormValues = z.infer<typeof displaySettingsSchema>;
