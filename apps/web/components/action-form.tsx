"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

export type ActionState = { ok: boolean; message: string } | null;
export type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** A form that runs a server action and shows its result message underneath. */
export function ActionForm({
  action,
  children,
  confirm,
  className,
}: {
  action: FormAction;
  children: ReactNode;
  /** If set, asks the user to confirm before submitting. */
  confirm?: string;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {state?.message ? (
        <p role="status" className={state.ok ? "notice ok" : "notice error"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function SubmitButton({ children, className, pendingText }: { children: ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? (pendingText ?? "Working…") : children}
    </button>
  );
}
