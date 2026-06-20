import { useEffect, useState } from "react";
import type { z } from "zod";
import type { jiraStatusResponseSchema } from "@contract/jira.contract";
import { getJiraStatus, startJiraConnect } from "../api/endpoints";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Banner } from "./ui/Banner";
import { Button } from "./ui/Button";
import { Section } from "./ui/Section";

type JiraStatus = z.infer<typeof jiraStatusResponseSchema>;

interface Props {
  onConnected?: () => void;
}

export function JiraStatus({ onConnected }: Props) {
  const { clearSession } = useAuth();
  const [status, setStatus] = useState<JiraStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getJiraStatus()
      .then((s) => {
        setStatus(s);
        if (s.connected) onConnected?.();
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError) {
          if (err.code === "UNAUTHENTICATED") { clearSession(); return; }
          setError(err.message);
        } else {
          setError("Could not load Jira connection status.");
        }
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Section
      title="Jira Connection"
      description="Connect your Atlassian workspace to file NHI findings as Jira tickets."
    >
      {loading && <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>}

      {!loading && error && (
        <Banner variant="error" onDismiss={() => setError(null)}>{error}</Banner>
      )}

      {!loading && status && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-4">
          <div className="flex items-center gap-3">
            {status.connected ? (
              <>
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Connected</p>
                  {status.siteUrl && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">{status.siteUrl}</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-300 dark:bg-gray-600" />
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Not connected</p>
              </>
            )}
          </div>

          <div className="flex gap-2">
            <Button onClick={startJiraConnect}>
              {status.connected ? "Reconnect Jira" : "Connect Jira"}
            </Button>
            <Button variant="secondary" onClick={load}>Refresh</Button>
          </div>

          {!status.connected && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              You will be taken to Atlassian to authorize access. The app
              requests read and write scopes for your Jira work items only.
            </p>
          )}
        </div>
      )}
    </Section>
  );
}
