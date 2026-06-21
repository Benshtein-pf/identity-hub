import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { z } from "zod";
import type { jiraProjectSchema } from "@contract/jira.contract";
import type { ticketResponseSchema } from "@contract/tickets.contract";
import { createTicket, getJiraProjects, getRecentTickets } from "../api/endpoints";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Banner } from "./ui/Banner";
import { Button } from "./ui/Button";
import { Field } from "./ui/Field";
import { Section } from "./ui/Section";

type Project = z.infer<typeof jiraProjectSchema>;
type Ticket = z.infer<typeof ticketResponseSchema>;

interface Props {
  onGoToJira: () => void;
}

const selectClass =
  "block w-full rounded-md border border-gray-300 dark:border-gray-600 " +
  "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm " +
  "focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400 " +
  "disabled:bg-gray-50 dark:disabled:bg-gray-700 disabled:text-gray-500 dark:disabled:text-gray-400";

export function TicketsSection({ onGoToJira }: Props) {
  const { clearSession } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [jiraNotConnected, setJiraNotConnected] = useState(false);

  const [selectedProject, setSelectedProject] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [projectFieldError, setProjectFieldError] = useState<string | null>(null);
  const [createdTicket, setCreatedTicket] = useState<Ticket | null>(null);

  const [recentProject, setRecentProject] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const recentRefreshKey = useRef(0);
  const [, forceRecentRefresh] = useState(0);
  const hasLoadedProjects = useRef(false);

  const handleApiError = useCallback(
    (err: unknown, setError: (msg: string) => void) => {
      if (err instanceof ApiError) {
        if (err.code === "UNAUTHENTICATED") { clearSession(); return; }
        if (err.code === "JIRA_NOT_CONNECTED") { setJiraNotConnected(true); return; }
        if (err.code === "RATE_LIMITED") { setError("Too many requests. Please try again shortly."); return; }
        if (err.code === "JIRA_UPSTREAM_ERROR") { setError("Jira is unavailable right now. Please try again later."); return; }
        setError(err.message);
      } else {
        setError("An unexpected error occurred.");
      }
    },
    [clearSession]
  );

  const loadProjects = useCallback(() => {
    if (!hasLoadedProjects.current) setProjectsLoading(true);
    setProjectsError(null);
    setJiraNotConnected(false);
    getJiraProjects()
      .then((r) => {
        setProjects(r.projects);
        setSelectedProject((cur) =>
          cur && r.projects.some((p) => p.key === cur) ? cur : (r.projects[0]?.key ?? "")
        );
        setRecentProject((cur) =>
          cur && r.projects.some((p) => p.key === cur) ? cur : (r.projects[0]?.key ?? "")
        );
      })
      .catch((err: unknown) => handleApiError(err, setProjectsError))
      .finally(() => {
        setProjectsLoading(false);
        hasLoadedProjects.current = true;
      });
  }, [handleApiError]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  useEffect(() => {
    if (!recentProject) return;
    setTicketsLoading(true);
    setTicketsError(null);
    getRecentTickets(recentProject)
      .then((r) => setTickets(r.tickets))
      .catch((err: unknown) => handleApiError(err, setTicketsError))
      .finally(() => setTicketsLoading(false));
    // recentRefreshKey.current is used as a trigger; the lint rule would flag it,
    // but the dependency array intentionally includes it via the state value.
  }, [recentProject, recentRefreshKey.current, handleApiError]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProject) return;
    setSubmitting(true);
    setCreateError(null);
    setProjectFieldError(null);
    setCreatedTicket(null);
    try {
      const ticket = await createTicket({
        projectKey: selectedProject,
        title,
        description: description || undefined
      });
      setCreatedTicket(ticket);
      setTitle("");
      setDescription("");
      setRecentProject(selectedProject);
      recentRefreshKey.current += 1;
      forceRecentRefresh((n) => n + 1);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === "UNAUTHENTICATED") { clearSession(); return; }
        if (err.code === "JIRA_NOT_CONNECTED") { setJiraNotConnected(true); return; }
        if (err.code === "PROJECT_NOT_FOUND") { setProjectFieldError(err.message); }
        else if (err.code === "RATE_LIMITED") { setCreateError("Too many requests. Please try again shortly."); }
        else if (err.code === "JIRA_UPSTREAM_ERROR") { setCreateError("Jira is unavailable right now. Please try again later."); }
        else { setCreateError(err.message); }
      } else {
        setCreateError("An unexpected error occurred.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (jiraNotConnected) {
    return (
      <Section title="Tickets">
        <Banner variant="warning">
          Jira is not connected.{" "}
          <button onClick={onGoToJira} className="font-medium underline hover:no-underline">
            Connect Jira
          </button>{" "}
          to start filing tickets.
        </Banner>
      </Section>
    );
  }

  if (projectsLoading) {
    return (
      <Section title="Tickets">
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading projects...</p>
      </Section>
    );
  }

  return (
    <div className="space-y-8">
      <Section title="Create Ticket" description="File an NHI finding as a Jira issue.">
        {projectsError && <Banner variant="error">{projectsError}</Banner>}

        {createdTicket && (
          <Banner variant="success" onDismiss={() => setCreatedTicket(null)}>
            Ticket created:{" "}
            <a
              href={createdTicket.jiraIssueUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline"
            >
              {createdTicket.jiraIssueKey}
            </a>{" "}
            - {createdTicket.title}
          </Banner>
        )}

        {createError && (
          <Banner variant="error" onDismiss={() => setCreateError(null)}>{createError}</Banner>
        )}

        <form
          onSubmit={(e) => { void handleCreate(e); }}
          className="space-y-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4"
        >
          <div className="space-y-1">
            <label
              htmlFor="create-project"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Project
            </label>
            <select
              id="create-project"
              value={selectedProject}
              onClick={loadProjects}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                setSelectedProject(e.target.value);
                setProjectFieldError(null);
              }}
              disabled={submitting || projects.length === 0}
              className={selectClass}
            >
              {projects.length === 0 && <option value="">No projects found</option>}
              {projects.map((p) => (
                <option key={p.id} value={p.key}>
                  {p.name} ({p.key})
                </option>
              ))}
            </select>
            {projectFieldError && (
              <p className="text-xs text-red-600 dark:text-red-400">{projectFieldError}</p>
            )}
          </div>

          <Field
            label="Title"
            id="create-title"
            type="text"
            required
            maxLength={255}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={submitting}
            placeholder="Stale service account: svc-deploy-prod"
          />

          <Field
            as="textarea"
            label="Description (optional)"
            id="create-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={submitting}
            placeholder="Unused for 90 days. Access key last rotated 2024-01-01."
          />

          <Button
            type="submit"
            loading={submitting}
            disabled={!selectedProject || !title.trim()}
          >
            Create ticket
          </Button>
        </form>
      </Section>

      <Section
        title="Recent Tickets"
        description="Tickets filed from this app, newest first. Up to 10 per project."
      >
        <div className="flex items-center gap-3">
          <label
            htmlFor="recent-project"
            className="text-sm text-gray-700 dark:text-gray-300 shrink-0"
          >
            Project
          </label>
          <select
            id="recent-project"
            value={recentProject}
            onClick={loadProjects}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setRecentProject(e.target.value)}
            disabled={projects.length === 0}
            className={`w-56 ${selectClass}`}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.key}>
                {p.name} ({p.key})
              </option>
            ))}
          </select>
        </div>

        {ticketsError && <Banner variant="error">{ticketsError}</Banner>}

        {ticketsLoading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        ) : tickets.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 italic">
            No tickets filed from this app for this project yet.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            {tickets.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <span className="shrink-0 font-mono text-xs font-semibold text-blue-700 dark:text-blue-400 w-24">
                  {t.jiraIssueKey}
                </span>
                <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 truncate">
                  {t.title}
                </span>
                <span className="shrink-0 rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs text-gray-500 dark:text-gray-400 capitalize">
                  {t.source}
                </span>
                <a
                  href={t.jiraIssueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${t.jiraIssueKey} in Jira`}
                  className="shrink-0 text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
