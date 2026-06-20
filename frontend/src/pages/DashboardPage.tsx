import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useDarkMode } from "../theme/DarkModeContext";
import { getJiraStatus } from "../api/endpoints";
import { ApiError } from "../api/client";
import { JiraStatus } from "../components/JiraStatus";
import { TicketsSection } from "../components/TicketsSection";
import { ApiKeysSection } from "../components/ApiKeysSection";
import { Button } from "../components/ui/Button";
import { Banner } from "../components/ui/Banner";

type NavItem = "tickets" | "apikeys" | "jira";

const navItems: { id: NavItem; label: string }[] = [
  { id: "tickets", label: "Tickets" },
  { id: "apikeys", label: "API Keys" },
  { id: "jira", label: "Jira" }
];

function SunIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <circle cx="12" cy="12" r="5" />
      <path strokeLinecap="round" d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export default function DashboardPage() {
  const { user, doLogout, clearSession } = useAuth();
  const { isDark, toggle } = useDarkMode();
  const [active, setActive] = useState<NavItem>("tickets");
  const [loggingOut, setLoggingOut] = useState(false);

  const [jiraConnected, setJiraConnected] = useState<boolean | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    getJiraStatus()
      .then((r) => setJiraConnected(r.connected))
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.code === "UNAUTHENTICATED") clearSession();
      });
  }, [clearSession]);

  useEffect(() => {
    if (active !== "jira") return;
    getJiraStatus()
      .then((r) => {
        setJiraConnected(r.connected);
        if (r.connected) setBannerDismissed(false);
      })
      .catch(() => { /* silent */ });
  }, [active]);

  const showBanner = jiraConnected === false && !bannerDismissed;

  async function handleLogout() {
    setLoggingOut(true);
    try { await doLogout(); } finally { setLoggingOut(false); }
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-6">
        <span className="text-base font-semibold text-gray-900 dark:text-gray-100">IdentityHub</span>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</span>
          <button
            onClick={toggle}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className="rounded-md p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>
          <Button
            variant="secondary"
            loading={loggingOut}
            onClick={() => { void handleLogout(); }}
          >
            Logout
          </Button>
        </div>
      </header>

      {/* Jira not-connected banner */}
      {showBanner && (
        <div className="shrink-0 border-b border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 px-6 py-2.5">
          <Banner variant="warning" onDismiss={() => setBannerDismissed(true)}>
            Jira is not connected. You cannot file tickets until you{" "}
            <button
              onClick={() => setActive("jira")}
              className="font-semibold underline hover:no-underline"
            >
              connect your Atlassian workspace
            </button>
            .
          </Banner>
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <nav className="w-44 shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 py-4">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              className={`w-full px-4 py-2.5 text-left text-sm font-medium transition-colors ${
                active === item.id
                  ? "bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-400 border-r-2 border-blue-600 dark:border-blue-400"
                  : "text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950 p-6">
          {active === "jira" && (
            <JiraStatus onConnected={() => setJiraConnected(true)} />
          )}
          {active === "tickets" && (
            <TicketsSection onGoToJira={() => setActive("jira")} />
          )}
          {active === "apikeys" && <ApiKeysSection />}
        </main>
      </div>
    </div>
  );
}
