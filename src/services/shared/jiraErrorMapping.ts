import { AppError } from "../../contract/errors.js";
import { JiraApiError } from "../../integrations/jira/jiraClient.js";

/** Every service that calls the Jira client funnels failures through here so only AppError ever crosses a service boundary. */
export async function withJiraErrorMapping<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof JiraApiError) {
      throw new AppError("JIRA_UPSTREAM_ERROR", "Jira could not complete this request. Please try again shortly.", {
        upstreamStatus: error.status
      });
    }
    throw error;
  }
}
