import type { FormEvent, ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
  error: string | null;
  submitLabel: string;
  isSubmitting: boolean;
  onSubmit: (e: FormEvent) => void;
  footer: ReactNode;
};

export function AuthFormFields({
  title,
  children,
  error,
  submitLabel,
  isSubmitting,
  onSubmit,
  footer,
}: Props) {
  return (
    <div>
      <h2 className="text-lg font-medium text-neutral-900">{title}</h2>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {children}
        {error && (
          <p
            className="text-sm text-red-600"
            role="alert"
          >
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-neutral-900 py-2.5 text-sm font-medium text-white shadow-sm transition enabled:hover:bg-neutral-800 disabled:opacity-50"
        >
          {isSubmitting ? "Please wait…" : submitLabel}
        </button>
      </form>
      <div className="mt-6 text-sm text-neutral-500">{footer}</div>
    </div>
  );
}
