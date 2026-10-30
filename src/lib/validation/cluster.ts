import { z } from "zod";

export const clusterEnvironmentSchema = z.enum(["dev", "staging", "prod"]);
export const clusterProtocolSchema = z.literal("http");

const nameSchema = z
  .string()
  .trim()
  .min(1, "Cluster name is required.")
  .max(100, "Cluster name must be 100 characters or fewer.");

const HOST_CHARSET_PATTERN = /^[a-zA-Z0-9.:-]+$/;

const hostSchema = z
  .string()
  .trim()
  .min(1, "Host is required.")
  .max(255, "Host must be 255 characters or fewer.")
  .regex(HOST_CHARSET_PATTERN, "Only letters, numbers, '.', ':', '-' are allowed.");

const numericPortSchema = z
  .number()
  .int("Port must be an integer.")
  .min(1, "Port must be between 1 and 65535.")
  .max(65535, "Port must be between 1 and 65535.");

const portSchema = z
  .coerce
  .number()
  .int("Port must be an integer.")
  .min(1, "Port must be between 1 and 65535.")
  .max(65535, "Port must be between 1 and 65535.");

const usernameSchema = z
  .string()
  .trim()
  .min(1, "Username is required.")
  .max(100, "Username must be 100 characters or fewer.");

const passwordSchema = z
  .string()
  .min(1, "Password is required.")
  .max(255, "Password must be 255 characters or fewer.");

const optionalPasswordSchema = z
  .string()
  .max(255, "Password must be 255 characters or fewer.")
  .optional()
  .or(z.literal(""));

const clusterSchemaBase = z.object({
  name: nameSchema,
  host: hostSchema,
  port: portSchema,
  protocol: clusterProtocolSchema,
  username: usernameSchema,
  useTLS: z.boolean().default(false),
  environment: clusterEnvironmentSchema,
});

const clusterFormSchemaBase = z.object({
  name: nameSchema,
  host: hostSchema,
  port: numericPortSchema,
  protocol: clusterProtocolSchema,
  username: usernameSchema,
  useTLS: z.boolean(),
  environment: clusterEnvironmentSchema,
});

export const createClusterSchema = clusterSchemaBase.extend({
  password: passwordSchema,
});

export const updateClusterSchema = clusterSchemaBase.extend({
  password: optionalPasswordSchema,
});

export const clusterConnectionTestSchema = z.object({
  host: hostSchema,
  port: portSchema,
  username: usernameSchema,
  password: passwordSchema,
  useTLS: z.boolean().default(false),
});

export const clusterCredentialTestSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export const buildClusterFormSchema = (isEditMode: boolean) =>
  clusterFormSchemaBase.extend({
    password: isEditMode
      ? z.string().max(255, "Password must be 255 characters or fewer.")
      : passwordSchema,
  });

export type CreateClusterInput = z.infer<typeof createClusterSchema>;
export type UpdateClusterInput = z.infer<typeof updateClusterSchema>;
export type ClusterConnectionTestInput = z.infer<typeof clusterConnectionTestSchema>;
export type ClusterFormValues = z.infer<ReturnType<typeof buildClusterFormSchema>>;

export const defaultClusterFormValues: ClusterFormValues = {
  name: "",
  host: "",
  port: 8123,
  protocol: "http",
  username: "",
  password: "",
  useTLS: false,
  environment: "dev",
};
