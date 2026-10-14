-- Run in the SQL editor after the migration. All synthetic rows are rolled back.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
insert into public.workspace_kanji_progress_events (id, progress, played_at)
values ('codex-private-sync-verification', '{"version":1,"lessons":{},"days":{}}', now())
on conflict (user_id, id) do nothing;
insert into public.workspace_kanji_progress_events (id, progress, played_at)
values ('codex-private-sync-verification', '{"version":1,"lessons":{},"days":{}}', now())
on conflict (user_id, id) do nothing;
do $$ begin
  if (select count(*) from public.workspace_kanji_progress_events where id = 'codex-private-sync-verification') <> 1 then
    raise exception 'Own-row read or duplicate retry failed';
  end if;
end $$;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
do $$ begin
  if exists (select 1 from public.workspace_kanji_progress_events where id = 'codex-private-sync-verification') then
    raise exception 'Another account can read private progress';
  end if;
  begin
    insert into public.workspace_kanji_progress_events (user_id, id, progress, played_at)
    values ('11111111-1111-4111-8111-111111111111', 'codex-forbidden-write', '{"version":1,"lessons":{},"days":{}}', now());
    raise exception 'Another account can write private progress';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
select 'PASS: own read/write, duplicate retry, cross-account isolation; test rows rolled back' as result;
