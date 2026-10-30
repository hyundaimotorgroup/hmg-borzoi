import { z } from "zod";
import { passwordSchema } from "./app-user";

export const loginSchema = z.object({
  email: z.email("Please enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters.").max(50, "Name must be 50 characters or fewer."),
  email: z.email("Please enter a valid email address."),
  password: passwordSchema,
  confirmPassword: z.string().min(1, "Please confirm your password."),
});
