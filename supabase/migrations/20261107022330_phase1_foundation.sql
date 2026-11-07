-- Phase 1 only. All timestamps and record identifiers originate in PostgreSQL.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Debater' check (char_length(display_name) between 1 and 80),
  username text check (username ~ '^[a-zA-Z0-9_]{3,30}$'),
  avatar_url text check (avatar_url is null or (char_length(avatar_url) <= 1000 and avatar_url ~ '^https://')),
  version integer not null default 0 check (version >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index profiles_username_unique on public.profiles(lower(username)) where username is not null;

create table public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  theme text not null default 'system' check (theme in ('system','light','dark')),
  provider text not null default 'openai' check (provider in ('openai','anthropic','gemini','compatible','local','mock')),
  model text not null default 'gpt-4.1-mini' check (char_length(model) <= 160),
  difficulty text not null default 'intermediate' check (difficulty in ('beginner','intermediate','advanced')),
  input_mode text not null default 'text' check (input_mode = 'text'),
  output_mode text not null default 'text' check (output_mode = 'text'),
  version integer not null default 0 check (version >= 0),
  updated_at timestamptz not null default now()
);

create table public.debate_formats (
  id text primary key, name text not null, version integer not null default 1,
  enabled boolean not null default false, config jsonb not null,
  created_at timestamptz not null default now()
);
insert into public.debate_formats (id,name,enabled,config) values
('quick','Quick Debate',true,'{"rounds":3,"max_turns":6,"speaking_order":["proposition","opposition"],"speeches":["opening","rebuttal","closing"],"pause_allowed":true,"cross_examination":false,"scoring":null}');

create table public.debate_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  format_id text not null default 'quick' references public.debate_formats(id),
  format_version integer not null default 1,
  motion text not null check (char_length(btrim(motion)) between 10 and 600),
  side text not null check (side in ('proposition','opposition')),
  difficulty text not null check (difficulty in ('beginner','intermediate','advanced')),
  persona text not null check (persona in ('analyst','socratic','challenger')),
  status text not null default 'active' check (status in ('active','paused','completed')),
  max_turns integer not null default 6 check (max_turns = 6),
  turn_count integer not null default 0 check (turn_count between 0 and 6),
  draft text not null default '' check (char_length(draft) <= 8000),
  draft_version integer not null default 0 check (draft_version >= 0),
  version integer not null default 0 check (version >= 0),
  preparation_seconds integer not null default 60 check (preparation_seconds between 0 and 900),
  speaking_seconds integer not null default 120 check (speaking_seconds between 30 and 600),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id,owner_id),
  check ((status = 'completed') = (completed_at is not null))
);
create index debate_sessions_owner_updated on public.debate_sessions(owner_id,updated_at desc,id desc);
create index debate_sessions_owner_completed on public.debate_sessions(owner_id,completed_at desc) where completed_at is not null;

create table public.debate_participants (
  id uuid primary key default gen_random_uuid(), session_id uuid not null,
  owner_id uuid not null, kind text not null check (kind in ('human','ai')),
  side text not null check (side in ('proposition','opposition')),
  created_at timestamptz not null default now(),
  foreign key (session_id,owner_id) references public.debate_sessions(id,owner_id) on delete cascade,
  unique(session_id,kind), unique(session_id,side), unique(id,session_id)
);
create index debate_participants_owner on public.debate_participants(owner_id);

create table public.debate_turns (
  id uuid primary key default gen_random_uuid(), session_id uuid not null, owner_id uuid not null,
  participant_id uuid not null,
  speaker text not null check (speaker in ('human','ai')),
  position integer not null check (position between 0 and 5),
  content text not null check (char_length(btrim(content)) between 1 and 8000),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (session_id,owner_id) references public.debate_sessions(id,owner_id) on delete cascade,
  foreign key (participant_id,session_id) references public.debate_participants(id,session_id) on delete cascade,
  unique(session_id,position), unique(session_id,request_id)
);
create index debate_turns_owner on public.debate_turns(owner_id);

create table private.rate_budgets (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null, window_start bigint not null, requests integer not null,
  primary key(user_id,kind)
);
alter table private.rate_budgets enable row level security;

create function private.bootstrap_account() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,display_name) values (new.id, 'Debater');
  insert into public.user_preferences(user_id) values (new.id);
  return new;
end;
$$;
revoke all on function private.bootstrap_account() from public,anon,authenticated;
create trigger verbalist_account_created after insert on auth.users for each row execute function private.bootstrap_account();
-- Also support existing accounts when applying the first migration to a dedicated project.
insert into public.profiles(id) select id from auth.users on conflict do nothing;
insert into public.user_preferences(user_id) select id from auth.users on conflict do nothing;

alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.debate_formats enable row level security;
alter table public.debate_sessions enable row level security;
alter table public.debate_participants enable row level security;
alter table public.debate_turns enable row level security;
create policy own_profile on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy own_preferences on public.user_preferences for select to authenticated using ((select auth.uid()) = user_id);
create policy enabled_formats on public.debate_formats for select to authenticated using (enabled);
create policy own_sessions on public.debate_sessions for select to authenticated using ((select auth.uid()) = owner_id);
create policy own_participants on public.debate_participants for select to authenticated using ((select auth.uid()) = owner_id);
create policy own_turns on public.debate_turns for select to authenticated using ((select auth.uid()) = owner_id);
revoke all on public.profiles,public.user_preferences,public.debate_formats,public.debate_sessions,public.debate_participants,public.debate_turns from public,anon,authenticated;
grant select on public.profiles,public.user_preferences,public.debate_formats,public.debate_sessions,public.debate_participants,public.debate_turns to authenticated;
-- Mutations are restricted to validated, ownership-checking RPCs, not arbitrary Data API writes.

create function public.consume_budget(p_kind text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_limit integer; v_count integer;
v_window bigint := floor(extract(epoch from clock_timestamp())/60);
begin
  if v_user is null or not exists(select 1 from auth.users where id=v_user and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then
    raise insufficient_privilege using message='Verified account required';
  end if;
  v_limit := case p_kind when 'ai' then 15 when 'api' then 240 when 'write' then 120 when 'export' then 3 when 'create' then 10 else null end;
  if v_limit is null then raise sqlstate 'PT422' using message='Invalid budget'; end if;
  insert into private.rate_budgets(user_id,kind,window_start,requests) values(v_user,p_kind,v_window,1)
  on conflict(user_id,kind) do update set
    requests=case when private.rate_budgets.window_start=excluded.window_start then private.rate_budgets.requests+1 else 1 end,
    window_start=excluded.window_start returning requests into v_count;
  if v_count > v_limit then raise sqlstate 'PT429' using message='Rate budget exhausted'; end if;
end;
$$;

create function public.create_debate(p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_row public.debate_sessions;
begin
  perform public.consume_budget('create');
  insert into public.debate_sessions(owner_id,motion,side,difficulty,persona,preparation_seconds,speaking_seconds)
  values(auth.uid(),btrim(p_data->>'motion'),p_data->>'side',p_data->>'difficulty',p_data->>'persona',(p_data->>'preparation_seconds')::integer,(p_data->>'speaking_seconds')::integer)
  returning * into v_row;
  insert into public.debate_participants(session_id,owner_id,kind,side) values
    (v_row.id,v_row.owner_id,'human',v_row.side),
    (v_row.id,v_row.owner_id,'ai',case when v_row.side='proposition' then 'opposition' else 'proposition' end);
  return to_jsonb(v_row);
end;
$$;

create function public.append_turn(p_session uuid,p_expected integer,p_speaker text,p_content text,p_request uuid,p_draft_version integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_row public.debate_sessions; v_existing public.debate_turns; v_next text; v_participant uuid;
begin
  perform public.consume_budget('write');
  select * into v_row from public.debate_sessions where id=p_session and owner_id=auth.uid() for update;
  if not found then raise sqlstate 'PT404' using message='Not found'; end if;
  select * into v_existing from public.debate_turns where session_id=p_session and request_id=p_request;
  if found then
    if v_existing.speaker<>p_speaker or v_existing.content<>btrim(p_content) then raise sqlstate 'PT409' using message='Idempotency key reused'; end if;
    return to_jsonb(v_row);
  end if;
  if v_row.version<>p_expected or v_row.status<>'active' or v_row.turn_count>=v_row.max_turns then raise sqlstate 'PT409' using message='Stale or finished debate'; end if;
  v_next := case when (v_row.turn_count%2=0)=(v_row.side='proposition') then 'human' else 'ai' end;
  if p_speaker is distinct from v_next then raise sqlstate 'PT409' using message='Wrong speaking order'; end if;
  if p_speaker='human' and p_draft_version is distinct from v_row.draft_version then raise sqlstate 'PT409' using message='Draft changed'; end if;
  select id into v_participant from public.debate_participants where session_id=p_session and kind=p_speaker;
  insert into public.debate_turns(session_id,owner_id,participant_id,speaker,position,content,request_id)
  values(p_session,auth.uid(),v_participant,p_speaker,v_row.turn_count,btrim(p_content),p_request);
  update public.debate_sessions set turn_count=turn_count+1,version=version+1,updated_at=now(),
    draft=case when p_speaker='human' then '' else draft end,
    draft_version=draft_version+case when p_speaker='human' then 1 else 0 end,
    status=case when turn_count+1=max_turns then 'completed' else status end,
    completed_at=case when turn_count+1=max_turns then now() else completed_at end
    where id=p_session returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create function public.save_draft(p_session uuid,p_expected integer,p_draft text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_row public.debate_sessions;
begin
  perform public.consume_budget('write');
  select * into v_row from public.debate_sessions where id=p_session and owner_id=auth.uid() for update;
  if not found then raise sqlstate 'PT404' using message='Not found'; end if;
  if v_row.draft_version<>p_expected or v_row.status='completed' then raise sqlstate 'PT409' using message='Draft changed'; end if;
  update public.debate_sessions set draft=p_draft,draft_version=draft_version+1,updated_at=now() where id=p_session returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create function public.change_status(p_session uuid,p_expected integer,p_status text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_row public.debate_sessions;
begin
  perform public.consume_budget('write');
  select * into v_row from public.debate_sessions where id=p_session and owner_id=auth.uid() for update;
  if not found then raise sqlstate 'PT404' using message='Not found'; end if;
  if v_row.version<>p_expected or v_row.status='completed' then raise sqlstate 'PT409' using message='Debate changed'; end if;
  if p_status not in ('active','paused','completed') or (p_status='completed' and v_row.turn_count<2) then raise sqlstate 'PT422' using message='Cannot finish before both sides speak'; end if;
  update public.debate_sessions set status=p_status,version=version+1,updated_at=now(),
    completed_at=case when p_status='completed' then now() else null end
    where id=p_session returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create function public.update_account(p_kind text,p_version integer,p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform public.consume_budget('write');
  if p_kind='profile' then
    update public.profiles set display_name=p_data->>'display_name',username=nullif(p_data->>'username',''),avatar_url=nullif(p_data->>'avatar_url',''),version=version+1,updated_at=now()
    where id=auth.uid() and version=p_version returning to_jsonb(profiles.*) into v_result;
  elsif p_kind='preferences' then
    update public.user_preferences set theme=p_data->>'theme',provider=p_data->>'provider',model=p_data->>'model',difficulty=p_data->>'difficulty',input_mode='text',output_mode='text',version=version+1,updated_at=now()
    where user_id=auth.uid() and version=p_version returning to_jsonb(user_preferences.*) into v_result;
  else raise sqlstate 'PT422' using message='Invalid account operation';
  end if;
  if v_result is null then raise sqlstate 'PT409' using message='Account record changed'; end if;
  return v_result;
end;
$$;

create function public.dashboard_stats() returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_streak integer:=0; v_day date := (now() at time zone 'UTC')::date; v_recent jsonb;
begin
  if not exists(select 1 from public.debate_sessions where owner_id=auth.uid() and status='completed' and (completed_at at time zone 'UTC')::date=v_day) then v_day:=v_day-1; end if;
  while exists(select 1 from public.debate_sessions where owner_id=auth.uid() and status='completed' and (completed_at at time zone 'UTC')::date=v_day) loop v_streak:=v_streak+1; v_day:=v_day-1; end loop;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.updated_at desc),'[]') into v_recent from (select * from public.debate_sessions where owner_id=auth.uid() order by updated_at desc limit 5) s;
  return jsonb_build_object(
    'completed',(select count(*) from public.debate_sessions where owner_id=auth.uid() and status='completed'),
    'active',(select count(*) from public.debate_sessions where owner_id=auth.uid() and status<>'completed'),
    'total_turns',(select count(*) from public.debate_turns where owner_id=auth.uid() and speaker='human'),
    'streak',v_streak,
    'practiced_formats',(select coalesce(jsonb_agg(distinct format_id),'[]') from public.debate_sessions where owner_id=auth.uid() and status='completed'),
    'recent',v_recent
  );
end;
$$;

revoke all on function public.consume_budget(text),public.create_debate(jsonb),public.append_turn(uuid,integer,text,text,uuid,integer),public.save_draft(uuid,integer,text),public.change_status(uuid,integer,text),public.update_account(text,integer,jsonb),public.dashboard_stats() from public,anon,authenticated;
grant execute on function public.consume_budget(text),public.create_debate(jsonb),public.append_turn(uuid,integer,text,text,uuid,integer),public.save_draft(uuid,integer,text),public.change_status(uuid,integer,text),public.update_account(text,integer,jsonb),public.dashboard_stats() to authenticated;
