import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { sanitizeText, sanitizeUrl } from "./sanitizer";

const createValidationMiddleware = <T>(schema: z.ZodSchema<T>) => {
  return async (c: Context, next: Next) => {
    try {
      const body = await c.req.json();
      const validatedData = schema.parse(body);
      c.set("validatedData", validatedData);
      await next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new HTTPException(400, {
          message: "Validation error",
          cause: error.errors,
        });
      }

      throw error;
    }
  };
};

export const articleLinkSchema = z.object({
  url: z.string().transform(sanitizeUrl),
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title too long")
    .transform(sanitizeText),
  description: z
    .string()
    .max(500, "Description too long")
    .transform(sanitizeText)
    .optional(),
});

export const translationSchema = z.object({
  languageCode: z.string().length(2, "Language code must be 2 characters"),
  content: z
    .string()
    .min(1, "Content is required")
    .max(500, "Content too long")
    .transform(sanitizeText),
});

export const imdbUpdateSchema = z.object({
  imdbId: z.string().regex(/^tt\d+$/, "Invalid IMDb ID format"),
  fetchTmdbData: z.boolean().optional().default(false),
});

export const posterSchema = z.object({
  url: z.string().transform(sanitizeUrl),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  language: z.string().length(2).optional(),
  source: z.enum(["tmdb", "manual", "imported"]).optional().default("manual"),
  isPrimary: z.boolean().optional().default(false),
});

export const reselectionSchema = z.object({
  type: z.enum(["daily", "weekly", "monthly"]),
  locale: z.string().length(2).optional().default("en"),
});

export const validateArticleLink =
  createValidationMiddleware(articleLinkSchema);
export const validateTranslation =
  createValidationMiddleware(translationSchema);
export const validateImdbUpdate = createValidationMiddleware(imdbUpdateSchema);
export const validatePoster = createValidationMiddleware(posterSchema);
export const validateReselection =
  createValidationMiddleware(reselectionSchema);
