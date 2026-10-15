-- 0018_messages_idempotency_key.sql
-- chat-respond persists the user's message server-side, unconditionally,
-- before calling Claude (save-first reliability — the message must never
-- be lost even if the AI call fails). But this had no idempotency guard: if
-- the client's 45s timeout fires while the server-side call is still in
-- flight, a client retry re-sends the same text to chat-respond, which
-- inserts the user's message a SECOND time once it actually reaches that
-- insert — a real duplicate-message bug (not hypothetical: the Claude call
-- itself has no explicit timeout of its own, only the longer Supabase
-- platform default, so it can genuinely still be running well past the
-- client's 45s window).
--
-- idempotency_key is generated once per send attempt on the CLIENT (not
-- regenerated on retry) and passed through to this insert — a unique
-- constraint here means a retried insert with the same key is a no-op
-- (ON CONFLICT DO NOTHING) rather than a second row. Nullable (not every
-- insert path needs one — e.g. assistant messages, the welcome message,
-- and brain-dump messages don't have the same retry-duplication risk this
-- was built for) and a partial unique index (WHERE NOT NULL) so multiple
-- NULLs don't collide with each other.
alter table messages add column if not exists idempotency_key text;

create unique index if not exists messages_idempotency_key_idx
  on messages (idempotency_key)
  where idempotency_key is not null;
