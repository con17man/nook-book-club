"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/action-state";
import { buttonStyles } from "./ui";

type Props = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
};

/** A <form> bound to a server action that shows its error/success message. */
export function ActionForm({ action, children, className }: Props) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className}>
      {children}
      {state?.error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p role="status" className="mt-3 text-sm text-success">
          {state.success}
        </p>
      )}
    </form>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  pendingText,
  className = "",
  ...props
}: {
  children: ReactNode;
  variant?: keyof typeof buttonStyles;
  pendingText?: string;
  className?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" {...props} disabled={pending || props.disabled} className={`${buttonStyles[variant]} ${className}`}>
      {pending ? (pendingText ?? "Saving…") : children}
    </button>
  );
}
