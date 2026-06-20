import type { ReactNode } from "react";

interface BannerProps {
  variant: "error" | "success" | "warning" | "info";
  children: ReactNode;
  onDismiss?: () => void;
}

const styles: Record<string, string> = {
  error:
    "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300",
  success:
    "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300",
  warning:
    "bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-300",
  info:
    "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300"
};

export function Banner({ variant, children, onDismiss }: BannerProps) {
  const style = styles[variant] ?? styles["info"] ?? "";
  return (
    <div className={`flex items-start gap-2 rounded-md border p-3 text-sm ${style}`}>
      <span className="flex-1">{children}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 font-medium opacity-70 hover:opacity-100"
        >
          &times;
        </button>
      )}
    </div>
  );
}
