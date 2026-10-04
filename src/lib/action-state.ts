/** Return shape for server actions used with useActionState. */
export type ActionState = { error?: string; success?: string } | undefined;

/** Postgres exceptions raised in our RPCs carry user-facing messages. */
export function errorMessage(error: { message: string } | null | undefined, fallback = "Something went wrong.") {
  return error?.message || fallback;
}
