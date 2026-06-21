import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function JiraConnectedPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const status = params.get("status");
  const reason = params.get("reason");
  const success = status === "success";

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => {
      void navigate("/", { replace: true });
    }, 2000);
    return () => clearTimeout(timer);
  }, [success, navigate]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-4 text-center">
        {success ? (
          <>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
              <svg
                className="h-7 w-7 text-green-600 dark:text-green-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Jira connected</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Your Atlassian workspace is linked. Redirecting you to the dashboard...
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900">
              <svg
                className="h-7 w-7 text-red-600 dark:text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Connection failed</h1>
            {reason && (
              <p className="text-sm text-red-600 dark:text-red-400 font-mono">{reason}</p>
            )}
            <button
              className="mt-2 text-sm text-blue-600 dark:text-blue-400 underline hover:no-underline cursor-pointer"
              onClick={() => void navigate("/", { replace: true })}
            >
              Back to dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
}
