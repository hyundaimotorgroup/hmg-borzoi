import { z } from "zod";

export const appUserRoleSchema = z.enum(["admin", "developer", "viewer"]);

const usernameSchema = z
  .string()
  .trim()
  .min(1, "Username is required.")
  .max(100, "Username must be 100 characters or fewer.");

const emailSchema = z.email("Please enter a valid email address.");

const PASSWORD_CHARACTER_CLASSES = [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/];

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(255, "Password must be 255 characters or fewer.")
  .refine(
    (pw) => PASSWORD_CHARACTER_CLASSES.filter((re) => re.test(pw)).length >= 2,
    "Password must include at least 2 of: uppercase letter, lowercase letter, number, special character."
  );

const clusterAccessItemSchema = z.object({
  clusterId: z.string().trim().min(1, "Cluster ID is required."),
  chUsername: z.string().trim().optional(),
  chPassword: z.string().optional(),
});

export const userClusterAccessSchema = z.object({
  clusterAccess: z.array(clusterAccessItemSchema).default([]),
});

export const createAppUserSchema = z.object({
  name: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  role: appUserRoleSchema,
});

export const updateAppUserSchema = z.object({
  name: usernameSchema.optional(),
  email: emailSchema.optional(),
  password: passwordSchema.optional(),
  role: appUserRoleSchema.optional(),
});

const appUserFormBaseSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  role: appUserRoleSchema,
  clusterAccess: z.array(clusterAccessItemSchema),
});

export const createAppUserFormSchema = appUserFormBaseSchema
  .extend({
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Please confirm the password."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords must match.",
  });

export const updateAppUserFormSchema = appUserFormBaseSchema
  .extend({
    password: z.string().max(255, "Password must be 255 characters or fewer."),
    confirmPassword: z.string().max(255, "Password must be 255 characters or fewer."),
  })
  .superRefine((data, ctx) => {
    const hasPassword = data.password.trim().length > 0;
    const hasConfirmPassword = data.confirmPassword.trim().length > 0;

    if (!hasPassword && !hasConfirmPassword) {
      return;
    }

    if (data.password.length < 8) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "Password must be at least 8 characters.",
      });
    } else if (PASSWORD_CHARACTER_CLASSES.filter((re) => re.test(data.password)).length < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "Password must include at least 2 of: uppercase letter, lowercase letter, number, special character.",
      });
    }

    if (!hasConfirmPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "Please confirm the password.",
      });
    }

    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "Passwords must match.",
      });
    }
  });

export const buildAppUserFormSchema = (isEditMode: boolean) =>
  isEditMode ? updateAppUserFormSchema : createAppUserFormSchema;

export type CreateAppUserInput = z.infer<typeof createAppUserSchema>;
export type UpdateAppUserInput = z.infer<typeof updateAppUserSchema>;
export type AppUserFormValues = z.infer<typeof createAppUserFormSchema>;

export const defaultAppUserFormValues: AppUserFormValues = {
  username: "",
  email: "",
  role: "viewer",
  password: "",
  confirmPassword: "",
  clusterAccess: [],
};
