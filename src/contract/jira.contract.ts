import { z } from "zod";

/**
 * Routes covered:
 *   GET /api/jira/connect   -> 302 redirect to Atlassian's authorize page
 *                              401 UNAUTHENTICATED
 *   GET /api/jira/callback  -> 302 redirect to `${FRONTEND_URL}/jira/connected?status=success`
 *                              or `...?status=error&reason=<code>` on failure.
 *                              This route is browser-driven (Atlassian redirects the user's
 *                              browser here), so failures surface via redirect, not JSON --
 *                              there is no caller to hand a JSON body to.
 *   GET /api/jira/status    -> 200 jiraStatusResponseSchema
 *                              401 UNAUTHENTICATED
 *   GET /api/jira/projects  -> 200 jiraProjectsResponseSchema
 *                              401 UNAUTHENTICATED, 409 JIRA_NOT_CONNECTED, 502 JIRA_UPSTREAM_ERROR
 */

export const jiraCallbackQuerySchema = z
  .object({
    code: z.string().min(1).optional(),
    state: z.string().min(1),
    error: z.string().optional(),
    error_description: z.string().optional()
  })
  .strict();
export type JiraCallbackQuery = z.infer<typeof jiraCallbackQuerySchema>;

export const jiraStatusResponseSchema = z
  .object({
    connected: z.boolean(),
    siteUrl: z.string().url().optional()
  })
  .strict();
export type JiraStatusResponse = z.infer<typeof jiraStatusResponseSchema>;

export const jiraProjectSchema = z
  .object({
    id: z.string(),
    key: z.string(),
    name: z.string()
  })
  .strict();
export type JiraProject = z.infer<typeof jiraProjectSchema>;

export const jiraProjectsResponseSchema = z
  .object({
    projects: z.array(jiraProjectSchema)
  })
  .strict();
export type JiraProjectsResponse = z.infer<typeof jiraProjectsResponseSchema>;
