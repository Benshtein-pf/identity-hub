import { useCallback, useEffect, useState } from "react";
import type { z } from "zod";
import type { apiKeySummarySchema } from "@contract/apiKeys.contract";
import { createApiKey, deleteApiKey, listApiKeys } from "../api/endpoints";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Banner } from "./ui/Banner";
import { Button } from "./ui/Button";
import { Field } from "./ui/Field";
import { Section } from "./ui/Section";

type ApiKey = z.infer<typeof apiKeySummarySchema>;

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(iso));
}

export function ApiKeysSection() {
  const { clearSession } = useAuth();

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleAuthError = useCallback(
    (err: unknown, setError: (msg: string) => void) => {
      if (err instanceof ApiError) {
        if (err.code === "UNAUTHENTICATED") { clearSession(); return; }
        setError(err.message);
      } else {
        setError("An unexpected error occurred.");
      }
    },
    [clearSession]
  );

  function loadKeys() {
    setLoading(true);
    setListError(null);
    listApiKeys()
      .then((r) => setKeys(r.apiKeys))
      .catch((err: unknown) => handleAuthError(err, setListError))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadKeys(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    setNewSecret(null);
    try {
      const result = await createApiKey({
        name: name.trim() || undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined
      });
      setNewSecret(result.secret);
      setNewKeyName(result.apiKey.name);
      setName("");
      setExpiresAt("");
      loadKeys();
    } catch (err: unknown) {
      handleAuthError(err, setCreateError);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setDeleteError(null);
    try {
      await deleteApiKey(id);
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (err: unknown) {
      handleAuthError(err, setDeleteError);
    } finally {
      setDeletingId(null);
    }
  }

  async function copySecret() {
    if (!newSecret) return;
    try {
      await navigator.clipboard.writeText(newSecret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable; user can select and copy manually
    }
  }

  return (
    <div className="space-y-8">
      {newSecret && (
        <div className="rounded-lg border-2 border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950 p-4 space-y-3">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Copy this secret now. It will never be shown again.
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-400">Key: {newKeyName}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-white dark:bg-gray-900 border border-amber-200 dark:border-amber-700 px-3 py-2 text-xs font-mono text-gray-900 dark:text-gray-100 break-all">
              {newSecret}
            </code>
            <Button variant="secondary" onClick={() => { void copySecret(); }}>
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
          <Button variant="secondary" onClick={() => { setNewSecret(null); setCopied(false); }}>
            Dismiss
          </Button>
        </div>
      )}

      <Section
        title="Create API Key"
        description="Machine credentials for scanners and CI pipelines. Raw secret is shown exactly once."
      >
        {createError && (
          <Banner variant="error" onDismiss={() => setCreateError(null)}>{createError}</Banner>
        )}
        <form
          onSubmit={(e) => { void handleCreate(e); }}
          className="space-y-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4"
        >
          <Field
            label="Name (optional)"
            id="key-name"
            type="text"
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={creating}
            placeholder="ci-scanner"
          />
          <Field
            label="Expires at (optional)"
            id="key-expires"
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            disabled={creating}
            hint="Leave blank for no expiry. Revocation is the primary security control."
          />
          <Button type="submit" loading={creating}>
            Create key
          </Button>
        </form>
      </Section>

      <Section title="Active Keys">
        {deleteError && (
          <Banner variant="error" onDismiss={() => setDeleteError(null)}>{deleteError}</Banner>
        )}
        {listError && <Banner variant="error">{listError}</Banner>}

        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 italic">No API keys yet.</p>
        ) : (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Prefix</th>
                  <th className="px-4 py-2 text-left">Created</th>
                  <th className="px-4 py-2 text-left">Expires</th>
                  <th className="px-4 py-2 text-left">Last used</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {keys.map((k) => {
                  const revoked = k.revokedAt !== null;
                  return (
                    <tr key={k.id} className={revoked ? "opacity-50" : undefined}>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                        {k.name}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-400">
                        {k.keyPrefix}...
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{formatDate(k.createdAt)}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{formatDate(k.expiresAt)}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{formatDate(k.lastUsedAt)}</td>
                      <td className="px-4 py-3">
                        {revoked ? (
                          <span className="rounded-full bg-red-100 dark:bg-red-900 px-2 py-0.5 text-xs text-red-700 dark:text-red-300">
                            Revoked
                          </span>
                        ) : (
                          <span className="rounded-full bg-green-100 dark:bg-green-900 px-2 py-0.5 text-xs text-green-700 dark:text-green-300">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {!revoked && (
                          <Button
                            variant="danger"
                            loading={deletingId === k.id}
                            onClick={() => { void handleDelete(k.id); }}
                            className="text-xs px-2 py-1"
                          >
                            Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
