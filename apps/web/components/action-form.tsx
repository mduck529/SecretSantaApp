"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { burst, sleighBells } from "./festive/effects";

export type ActionState = { ok: boolean; message: string; complete?: boolean } | null;
export type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** A form that runs a server action and shows its result message underneath. */
export function ActionForm({
  action,
  children,
  confirm,
  className,
  celebrate,
}: {
  action: FormAction;
  children: ReactNode;
  /** If set, asks the user to confirm before submitting. */
  confirm?: string;
  className?: string;
  /** Confetti and sleigh bells when the action succeeds. */
  celebrate?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (celebrate && state?.ok) {
      burst(ref.current);
      sleighBells();
    }
  }, [state, celebrate]);

  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        const submitter = (e.nativeEvent as SubmitEvent).submitter;
        if (confirm && !submitter?.hasAttribute("data-skip-confirm") && !window.confirm(confirm)) e.preventDefault();
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

export function SubmitButton({
  children,
  className,
  pendingText,
  name,
  value,
  skipConfirm,
}: {
  children: ReactNode;
  className?: string;
  pendingText?: string;
  name?: string;
  value?: string;
  /** Don't show the form's confirm dialog for this button (e.g. "send me a test"). */
  skipConfirm?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      name={name}
      value={value}
      data-skip-confirm={skipConfirm ? "" : undefined}
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? (pendingText ?? "Working…") : children}
    </button>
  );
}
