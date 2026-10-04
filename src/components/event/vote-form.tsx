"use client";

import { useState } from "react";
import { castVotes } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";

type Props = {
  eventId: string;
  books: { id: string; title: string; author: string | null }[];
  maxVotes: number;
  initial: string[];
};

export function VoteForm({ eventId, books, maxVotes, initial }: Props) {
  const [selected, setSelected] = useState<string[]>(initial);
  const full = selected.length >= maxVotes;

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : maxVotes === 1 ? [id] : full ? cur : [...cur, id]));

  return (
    <ActionForm action={castVotes} className="space-y-4">
      <input type="hidden" name="eventId" value={eventId} />
      <ul className="space-y-2">
        {books.map((book) => {
          const checked = selected.includes(book.id);
          const disabled = !checked && full && maxVotes > 1;
          return (
            <li key={book.id}>
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${
                  checked ? "border-accent bg-accent-soft" : "border-line hover:bg-paper"
                } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <input
                  type="checkbox"
                  name="bookIds"
                  value={book.id}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(book.id)}
                  className="size-4 accent-accent"
                />
                <span>
                  <span className="font-medium">{book.title}</span>
                  {book.author && <span className="text-muted"> — {book.author}</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-3">
        <SubmitButton>{selected.length ? "Save my vote" : "Clear my votes"}</SubmitButton>
        <span className="text-sm text-muted">
          {selected.length}/{maxVotes} selected
        </span>
      </div>
    </ActionForm>
  );
}
