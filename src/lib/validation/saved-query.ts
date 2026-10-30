import { z } from "zod";

const savedQueryNameSchema = z
  .string()
  .trim()
  .min(1, "Please enter a query name.")
  .max(100, "Query name must not exceed 100 characters.");

const savedQueryTextSchema = z
  .string()
  .trim()
  .min(1, "Please enter the query to save.")
  .max(50000, "Query body must not exceed 50,000 characters.");

export const createSavedQuerySchema = z.object({
  name: savedQueryNameSchema,
  query: savedQueryTextSchema,
});

export const updateSavedQuerySchema = z
  .object({
    name: savedQueryNameSchema.optional(),
    query: savedQueryTextSchema.optional(),
  })
  .refine((value) => value.name !== undefined || value.query !== undefined, {
    message: "Please enter a name or query to update.",
  });
