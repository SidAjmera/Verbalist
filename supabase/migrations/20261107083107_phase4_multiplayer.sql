-- Private shared practice. No public transcripts or automatic AI rankings.
create table public.tournaments (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(char_length(title) between 3 and 100),motion text not null check(char_length(motion) between 10 and 600),host_alias text not null check(char_length(host_alias) between 2 and 40),
 capacity integer not null check(capacity in(2,4,8)),status text not null default 'lobby' check(status in('lobby','active','completed','cancelled')),
 preparation_seconds integer not null default 60 check(preparation_seconds between 0 and 900),speaking_seconds integer not null default 120 check(speaking_seconds between 30 and 600),
 version integer not null default 0,winner_id uuid references auth.users(id) on delete set null,created_at timestamptz not null default now()
);
create index tournaments_owner on public.tournaments(owner_id,created_at desc);
create table public.tournament_entries (
 id uuid primary key default gen_random_uuid(),tournament_id uuid not null references public.tournaments(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,
 alias text not null check(char_length(alias) between 2 and 40),joined_at timestamptz not null default now(),unique(tournament_id,user_id)
);
create index tournament_entries_user on public.tournament_entries(user_id);
create table public.debate_rooms (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,tournament_id uuid references public.tournaments(id) on delete cascade,
 motion text not null check(char_length(motion) between 10 and 600),status text not null default 'lobby' check(status in('lobby','active','paused','completed','cancelled')),
 version integer not null default 0,turn_count integer not null default 0 check(turn_count between 0 and 6),
 preparation_seconds integer not null check(preparation_seconds between 0 and 900),speaking_seconds integer not null check(speaking_seconds between 30 and 600),
 clock_phase text not null default 'idle' check(clock_phase in('idle','preparation','ready','speaking','expired')),
 clock_remaining_ms integer not null default 0 check(clock_remaining_ms between 0 and 900000),clock_started_at timestamptz,
 forfeit_side text check(forfeit_side in('proposition','opposition')),created_at timestamptz not null default now(),completed_at timestamptz
);
create index debate_rooms_owner on public.debate_rooms(owner_id);
create index debate_rooms_tournament on public.debate_rooms(tournament_id);
create table public.room_memberships (
 id uuid primary key default gen_random_uuid(),room_id uuid not null references public.debate_rooms(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in('proposition','opposition','judge','spectator')),alias text not null check(char_length(alias) between 2 and 40),active boolean not null default true,
 ready boolean not null default false,voice_muted boolean not null default false,ranking_consent boolean not null default false,joined_at timestamptz not null default now(),unique(room_id,user_id)
);
create index room_memberships_user on public.room_memberships(user_id);
create unique index room_roles on public.room_memberships(room_id,role) where active and role<>'spectator';
create table public.invitations (
 id uuid primary key default gen_random_uuid(),created_by uuid not null references auth.users(id) on delete cascade,
 room_id uuid references public.debate_rooms(id) on delete cascade,tournament_id uuid references public.tournaments(id) on delete cascade,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),role text not null check(role in('proposition','opposition','judge','spectator','entrant')),
 uses integer not null default 0,max_uses integer not null check(max_uses between 1 and 8),expires_at timestamptz not null,revoked boolean not null default false,
 check((room_id is null)<>(tournament_id is null)),created_at timestamptz not null default now()
);
create index invitations_room on public.invitations(room_id);
create index invitations_tournament on public.invitations(tournament_id);
create index invitations_creator on public.invitations(created_by);
create table public.room_drafts (
 id uuid primary key default gen_random_uuid(),room_id uuid not null references public.debate_rooms(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,
 draft text not null default '' check(char_length(draft)<=8000),version integer not null default 0,unique(room_id,user_id)
);
create index room_drafts_user on public.room_drafts(user_id);
create table public.room_turns (
 id uuid primary key default gen_random_uuid(),room_id uuid not null references public.debate_rooms(id) on delete cascade,author_id uuid not null references auth.users(id) on delete cascade,
 side text not null check(side in('proposition','opposition')),position integer not null check(position between 0 and 5),content text not null check(char_length(btrim(content)) between 1 and 8000),request_id uuid not null,
 created_at timestamptz not null default now(),unique(room_id,position),unique(room_id,request_id)
);
create index room_turns_author on public.room_turns(author_id);
create table public.room_events (
 id uuid primary key default gen_random_uuid(),room_id uuid not null references public.debate_rooms(id) on delete cascade,actor_id uuid not null references auth.users(id) on delete cascade,
 action text not null,reason text not null default '' check(char_length(reason)<=2000),created_at timestamptz not null default now()
);
create index room_events_room on public.room_events(room_id,created_at);
create index room_events_actor on public.room_events(actor_id);
create table public.room_ballots (
 id uuid primary key default gen_random_uuid(),room_id uuid not null references public.debate_rooms(id) on delete cascade,requested_by uuid not null references auth.users(id) on delete cascade,
 source_version integer not null,request_id uuid not null,provider text not null check(provider in('openai','anthropic','gemini','compatible','local','mock')),model text not null check(char_length(model) between 1 and 160),
 simulated boolean not null,payload jsonb not null,rubric_version text not null default 'quick-v1',created_at timestamptz not null default now(),unique(room_id,request_id)
);
create index room_ballots_room on public.room_ballots(room_id,created_at desc);
create index room_ballots_requester on public.room_ballots(requested_by);
create table public.room_results (
 id uuid primary key default gen_random_uuid(),room_id uuid not null unique references public.debate_rooms(id) on delete cascade,reviewer_id uuid not null references auth.users(id) on delete cascade,
 winner text not null check(winner in('proposition','opposition','draw')),reason text not null check(char_length(reason) between 10 and 2000),
 ballot_id uuid references public.room_ballots(id) on delete cascade,basis text not null check(basis in('manual','ai_assisted')),ranked boolean not null,request_id uuid not null,created_at timestamptz not null default now()
);
create index room_results_reviewer on public.room_results(reviewer_id);
create table public.ranking_profiles (
 id uuid primary key default gen_random_uuid(),user_id uuid not null unique references auth.users(id) on delete cascade,
 handle text not null check(handle ~ '^[A-Za-z0-9_]{3,30}$'),opted_in boolean not null default false,version integer not null default 0
);
create unique index ranking_handles on public.ranking_profiles(lower(handle)) where opted_in;
create table public.rankings (
 id uuid primary key default gen_random_uuid(),result_id uuid not null references public.room_results(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,
 outcome text not null check(outcome in('win','draw','loss')),points integer not null check(points in(0,1,3)),unique(result_id,user_id)
);
create index rankings_user on public.rankings(user_id);
create table public.tournament_matches (
 id uuid primary key default gen_random_uuid(),tournament_id uuid not null references public.tournaments(id) on delete cascade,round integer not null check(round between 1 and 3),slot integer not null check(slot between 1 and 4),
 proposition_id uuid references auth.users(id) on delete cascade,opposition_id uuid references auth.users(id) on delete cascade,winner_id uuid references auth.users(id) on delete set null,
 room_id uuid unique references public.debate_rooms(id) on delete set null,scheduled_at timestamptz,result_id uuid references public.room_results(id) on delete set null,
 unique(tournament_id,round,slot)
);
create index tournament_matches_prop on public.tournament_matches(proposition_id);
create index tournament_matches_opp on public.tournament_matches(opposition_id);
create index tournament_matches_winner on public.tournament_matches(winner_id);
create index tournament_matches_result on public.tournament_matches(result_id);
create index room_results_ballot on public.room_results(ballot_id);
create table public.room_presence (
 id uuid primary key default gen_random_uuid(),room_id uuid not null references public.debate_rooms(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,
 connection_id uuid not null,voice boolean not null default false,last_seen timestamptz not null default now(),unique(room_id,user_id)
);
create index room_presence_user on public.room_presence(user_id);
create table public.room_signals (
 id bigint generated always as identity primary key,room_id uuid not null references public.debate_rooms(id) on delete cascade,sender_id uuid not null references auth.users(id) on delete cascade,target_id uuid not null references auth.users(id) on delete cascade,
 sender_connection uuid not null,target_connection uuid not null,kind text not null check(kind in('description','candidate')),payload jsonb not null check(octet_length(payload::text)<=14000),expires_at timestamptz not null default(now()+interval '60 seconds')
);
create index room_signals_target on public.room_signals(room_id,target_id,id);
create index room_signals_sender on public.room_signals(sender_id);
create index room_signals_expiry on public.room_signals(expires_at);

create function private.verified_member() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null and not coalesce(is_anonymous,false)) $$;
create function private.room_access(p_room uuid) returns boolean language sql stable security definer set search_path='' as $$ select private.verified_member() and exists(select 1 from public.room_memberships where room_id=p_room and user_id=auth.uid() and active) $$;
create function private.tournament_access(p_t uuid) returns boolean language sql stable security definer set search_path='' as $$ select private.verified_member() and (exists(select 1 from public.tournaments where id=p_t and owner_id=auth.uid()) or exists(select 1 from public.tournament_entries where tournament_id=p_t and user_id=auth.uid())) $$;
revoke all on function private.verified_member(),private.room_access(uuid),private.tournament_access(uuid) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.verified_member(),private.room_access(uuid),private.tournament_access(uuid) to authenticated;
do $$ declare t text;begin
 foreach t in array array['tournaments','tournament_entries','debate_rooms','room_memberships','invitations','room_drafts','room_turns','room_events','room_ballots','room_results','ranking_profiles','rankings','tournament_matches','room_presence','room_signals'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  if t not in('invitations','room_signals') then execute format('grant select on public.%I to authenticated',t);end if;
 end loop;
end $$;
create policy room_read on public.debate_rooms for select to authenticated using(private.room_access(id));
create policy members_read on public.room_memberships for select to authenticated using((user_id=(select auth.uid()) and private.verified_member()) or private.room_access(room_id));
create policy drafts_read on public.room_drafts for select to authenticated using(user_id=(select auth.uid()) and private.verified_member());
create policy turns_read on public.room_turns for select to authenticated using((author_id=(select auth.uid()) and private.verified_member()) or private.room_access(room_id));
create policy events_read on public.room_events for select to authenticated using(private.room_access(room_id));
create policy ballots_read on public.room_ballots for select to authenticated using(private.room_access(room_id));
create policy results_read on public.room_results for select to authenticated using(private.room_access(room_id));
create policy presence_read on public.room_presence for select to authenticated using(private.room_access(room_id) and last_seen>now()-interval '15 seconds');
create policy tournament_read on public.tournaments for select to authenticated using(private.tournament_access(id));
create policy entries_read on public.tournament_entries for select to authenticated using(private.tournament_access(tournament_id));
create policy matches_read on public.tournament_matches for select to authenticated using(private.tournament_access(tournament_id));
create policy ranking_profile_read on public.ranking_profiles for select to authenticated using(user_id=(select auth.uid()) and private.verified_member());
create policy rankings_read on public.rankings for select to authenticated using(user_id=(select auth.uid()) and private.verified_member());

-- Extend existing distributed budgets without changing prior limits.
create or replace function public.consume_budget(p_kind text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();lim integer;n integer;w bigint:=floor(extract(epoch from clock_timestamp())/60);begin
 if not private.verified_member() then raise insufficient_privilege using message='Verified account required';end if;
 lim:=case p_kind when 'ai' then 15 when 'api' then 240 when 'write' then 120 when 'export' then 3 when 'create' then 10 when 'signal' then 180 when 'live' then 180 else null end;
 if lim is null then raise sqlstate 'PT422' using message='Invalid budget';end if;
 insert into private.rate_budgets(user_id,kind,window_start,requests) values(u,p_kind,w,1) on conflict(user_id,kind) do update set window_start=excluded.window_start,requests=case when private.rate_budgets.window_start=w then private.rate_budgets.requests+1 else 1 end returning requests into n;
 if n>lim then raise sqlstate 'PT429' using message='Rate limit reached';end if;
end $$;

create function private.normalize_room(p_room uuid) returns void language plpgsql set search_path='' as $$
declare r public.debate_rooms;begin
 select * into r from public.debate_rooms where id=p_room for update;
 if r.status='active' and r.clock_phase in('preparation','speaking') and r.clock_started_at is not null and r.clock_remaining_ms<=floor(extract(epoch from(clock_timestamp()-r.clock_started_at))*1000) then
  update public.debate_rooms set clock_phase=case when r.clock_phase='preparation' then 'ready' else 'expired' end,clock_remaining_ms=case when r.clock_phase='preparation' then r.speaking_seconds*1000 else 0 end,clock_started_at=null,version=version+1 where id=p_room;
 end if;
end $$;
revoke all on function private.normalize_room(uuid) from public,anon,authenticated;

create function public.room_detail(p_room uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.consume_budget('api');
 if not private.room_access(p_room) then raise sqlstate 'PT404' using message='Room not found';end if;
 perform private.normalize_room(p_room);
 return jsonb_build_object('room',(select to_jsonb(r) from public.debate_rooms r where id=p_room),'self_id',auth.uid(),'server_time',clock_timestamp(),
 'members',(select coalesce(jsonb_agg(to_jsonb(m) order by joined_at),'[]') from public.room_memberships m where room_id=p_room and active),
 'turns',(select coalesce(jsonb_agg(to_jsonb(t) order by position),'[]') from public.room_turns t where room_id=p_room),
 'draft',coalesce((select to_jsonb(d) from public.room_drafts d where room_id=p_room and user_id=auth.uid()),jsonb_build_object('draft','','version',0)),
 'events',(select coalesce(jsonb_agg(to_jsonb(e) order by created_at),'[]') from (select * from public.room_events where room_id=p_room order by created_at desc limit 100) e),
 'invites',case when exists(select 1 from public.debate_rooms r join public.room_memberships m on m.room_id=r.id where r.id=p_room and m.user_id=auth.uid() and m.active and (r.owner_id=auth.uid() or m.role='judge')) then coalesce((select jsonb_agg(to_jsonb(i)) from (select id,role,expires_at,uses,max_uses,revoked from public.invitations where room_id=p_room order by created_at desc limit 30) i),'[]') else '[]'::jsonb end,
 'ballot',(select to_jsonb(b) from public.room_ballots b where room_id=p_room order by created_at desc,id desc limit 1),
 'result',(select to_jsonb(r) from public.room_results r where room_id=p_room));
end $$;

create function public.create_room(p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare r uuid;role text:=p_data->>'role';begin
 perform public.consume_budget('create');
 if role not in('proposition','judge') then raise sqlstate 'PT422' using message='Invalid host role';end if;
 insert into public.debate_rooms(owner_id,motion,preparation_seconds,speaking_seconds) values(auth.uid(),btrim(p_data->>'motion'),(p_data->>'preparation_seconds')::integer,(p_data->>'speaking_seconds')::integer) returning id into r;
 insert into public.room_memberships(room_id,user_id,role,alias) values(r,auth.uid(),role,p_data->>'alias');return r;
end $$;

create function public.create_invitation(p_room uuid,p_tournament uuid,p_role text,p_hash text,p_minutes integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare n integer:=1;i public.invitations;begin
 perform public.consume_budget('write');
 if p_minutes not between 5 and 1440 or (p_room is null)=(p_tournament is null) then raise sqlstate 'PT422' using message='Invalid invitation';end if;
 if p_room is not null then
  if not exists(select 1 from public.debate_rooms r join public.room_memberships m on m.room_id=r.id where r.id=p_room and m.user_id=auth.uid() and m.active and (r.owner_id=auth.uid() or m.role='judge') and r.status in('lobby','active','paused') and (r.status='lobby' or p_role='spectator')) or p_role not in('proposition','opposition','judge','spectator') then raise insufficient_privilege using message='Invitation not permitted';end if;
 else
  select capacity into n from public.tournaments where id=p_tournament and owner_id=auth.uid() and status='lobby';
  if not found or p_role<>'entrant' then raise insufficient_privilege using message='Invitation not permitted';end if;
 end if;
 insert into public.invitations(created_by,room_id,tournament_id,role,token_hash,max_uses,expires_at) values(auth.uid(),p_room,p_tournament,p_role,p_hash,n,clock_timestamp()+make_interval(mins=>p_minutes)) returning * into i;
 return jsonb_build_object('id',i.id,'role',i.role,'expires_at',i.expires_at,'max_uses',i.max_uses);
end $$;

create function public.accept_invitation(p_hash text,p_alias text) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.invitations;r public.debate_rooms;t public.tournaments;begin
 perform public.consume_budget('write');
 if char_length(p_alias) not between 2 and 40 then raise sqlstate 'PT422' using message='Alias required';end if;
 select * into i from public.invitations where token_hash=p_hash;
 if not found or i.revoked or i.expires_at<=clock_timestamp() then raise sqlstate 'PT404' using message='Invitation unavailable';end if;
 if i.room_id is not null then
  select * into r from public.debate_rooms where id=i.room_id for update;
  select * into i from public.invitations where id=i.id for update;
  if i.revoked or i.expires_at<=clock_timestamp() then raise sqlstate 'PT404' using message='Invitation unavailable';end if;
  if private.room_access(r.id) then return jsonb_build_object('kind','room','id',r.id);end if;
  if i.uses>=i.max_uses or r.status not in('lobby','active','paused') or (r.status<>'lobby' and i.role<>'spectator') or (select count(*) from public.room_memberships where room_id=r.id and active)>=10 then raise sqlstate 'PT422' using message='Room is full or invitation used';end if;
  if i.role<>'spectator' and exists(select 1 from public.room_memberships where room_id=r.id and active and role=i.role) then raise sqlstate 'PT409' using message='Role is occupied';end if;
  insert into public.room_memberships(room_id,user_id,role,alias) values(r.id,auth.uid(),i.role,p_alias) on conflict(room_id,user_id) do update set role=excluded.role,alias=excluded.alias,active=true,ready=false,voice_muted=false,ranking_consent=false;
  update public.debate_rooms set version=version+1 where id=r.id;
 else
  select * into t from public.tournaments where id=i.tournament_id for update;
  select * into i from public.invitations where id=i.id for update;
  if i.revoked or i.expires_at<=clock_timestamp() then raise sqlstate 'PT404' using message='Invitation unavailable';end if;
  if exists(select 1 from public.tournament_entries where tournament_id=t.id and user_id=auth.uid()) then return jsonb_build_object('kind','tournament','id',t.id);end if;
  if i.uses>=i.max_uses or t.status<>'lobby' or t.owner_id=auth.uid() or (select count(*) from public.tournament_entries where tournament_id=t.id)>=t.capacity then raise sqlstate 'PT422' using message='Tournament unavailable or full';end if;
  insert into public.tournament_entries(tournament_id,user_id,alias) values(t.id,auth.uid(),p_alias);
  update public.tournaments set version=version+1 where id=t.id;
 end if;
 update public.invitations set uses=uses+1 where id=i.id;
 return jsonb_build_object('kind',case when i.room_id is null then 'tournament' else 'room' end,'id',coalesce(i.room_id,i.tournament_id));
end $$;

create function public.room_command(p_room uuid,p_expected integer,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.debate_rooms;m public.room_memberships;manager boolean;reason text:=coalesce(p_data->>'reason','');remaining integer;begin
 perform public.consume_budget('write');
 if not private.room_access(p_room) then raise sqlstate 'PT404' using message='Room not found';end if;
 select * into r from public.debate_rooms where id=p_room for update;
 if r.version<>p_expected then raise sqlstate 'PT409' using message='Room changed';end if;
 select * into m from public.room_memberships where room_id=p_room and user_id=auth.uid() and active;
 manager:=r.owner_id=auth.uid() or m.role='judge';
 if p_action='ready' then
  if r.status<>'lobby' or m.role not in('proposition','opposition') then raise sqlstate 'PT422' using message='Cannot change readiness';end if;
  update public.room_memberships set ready=(p_data->>'ready')::boolean,ranking_consent=coalesce((p_data->>'ranking_consent')::boolean,false) where id=m.id;
 elsif p_action='start' then
  if not manager or r.status<>'lobby' or (select count(*) from public.room_memberships where room_id=p_room and active and ready and role in('proposition','opposition'))<>2 or exists(select 1 from public.tournament_matches where room_id=p_room and scheduled_at>clock_timestamp()) then raise sqlstate 'PT422' using message='Both players must be ready and schedule reached';end if;
  update public.debate_rooms set status='active',clock_phase=case when preparation_seconds>0 then 'preparation' else 'ready' end,clock_remaining_ms=case when preparation_seconds>0 then preparation_seconds*1000 else speaking_seconds*1000 end,clock_started_at=case when preparation_seconds>0 then clock_timestamp() else null end where id=p_room;
 elsif p_action='speak' then
  if r.status<>'active' or r.clock_phase not in('preparation','ready') or not(m.role=case when r.turn_count%2=0 then 'proposition' else 'opposition' end or m.role='judge') then raise sqlstate 'PT422' using message='Not your speaking period';end if;
  update public.debate_rooms set clock_phase='speaking',clock_remaining_ms=speaking_seconds*1000,clock_started_at=clock_timestamp() where id=p_room;
 elsif p_action in('pause','resume','finish','cancel') then
  if not manager or char_length(reason) not between 3 and 2000 or r.status in('completed','cancelled') then raise insufficient_privilege using message='Moderator required';end if;
  if p_action='pause' and r.status='active' then
   remaining:=greatest(0,r.clock_remaining_ms-case when r.clock_started_at is null then 0 else floor(extract(epoch from(clock_timestamp()-r.clock_started_at))*1000)::integer end);
   update public.debate_rooms set status='paused',clock_remaining_ms=case when remaining=0 and clock_phase='preparation' then speaking_seconds*1000 else remaining end,clock_phase=case when remaining=0 and clock_phase='preparation' then 'ready' when remaining=0 and clock_phase='speaking' then 'expired' else clock_phase end,clock_started_at=null where id=p_room;
  elsif p_action='resume' and r.status='paused' then update public.debate_rooms set status='active',clock_started_at=case when clock_phase in('preparation','speaking') then clock_timestamp() else null end where id=p_room;
  elsif p_action='finish' and r.status in('active','paused') and r.turn_count>=2 then update public.debate_rooms set status='completed',completed_at=clock_timestamp(),clock_phase='idle',clock_started_at=null,clock_remaining_ms=0 where id=p_room;
  elsif p_action='cancel' then update public.debate_rooms set status='cancelled',clock_phase='idle',clock_started_at=null,clock_remaining_ms=0 where id=p_room;
  else raise sqlstate 'PT422' using message='Invalid status transition';end if;
 elsif p_action in('mute','remove') then
  if not manager or (p_data->>'user_id')::uuid=r.owner_id then raise insufficient_privilege using message='Cannot moderate this member';end if;
  if p_action='mute' then update public.room_memberships set voice_muted=(p_data->>'muted')::boolean where room_id=p_room and user_id=(p_data->>'user_id')::uuid and active;
  else
   if exists(select 1 from public.room_memberships where room_id=p_room and user_id=(p_data->>'user_id')::uuid and active and role in('proposition','opposition')) and r.status in('active','paused') then update public.debate_rooms set status='cancelled',clock_phase='idle',clock_started_at=null,clock_remaining_ms=0 where id=p_room;end if;
   update public.room_memberships set active=false where room_id=p_room and user_id=(p_data->>'user_id')::uuid;
   delete from public.room_presence where room_id=p_room and user_id=(p_data->>'user_id')::uuid;
  end if;
 elsif p_action='revoke_invite' then
  if not manager then raise insufficient_privilege using message='Moderator required';end if;
  update public.invitations set revoked=true where id=(p_data->>'invite_id')::uuid and room_id=p_room;
 elsif p_action='concede' then
  if m.role not in('proposition','opposition') or r.status not in('active','paused') or char_length(reason)<10 then raise sqlstate 'PT422' using message='Cannot concede';end if;
  update public.debate_rooms set status='completed',forfeit_side=m.role,completed_at=clock_timestamp(),clock_phase='idle',clock_started_at=null,clock_remaining_ms=0 where id=p_room;
 else raise sqlstate 'PT422' using message='Unknown room action';end if;
 update public.debate_rooms set version=version+1 where id=p_room;
 insert into public.room_events(room_id,actor_id,action,reason) values(p_room,auth.uid(),p_action,reason);
 return public.room_detail(p_room);
end $$;

create function public.room_save_draft(p_room uuid,p_expected integer,p_text text) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.room_drafts;begin
 perform public.consume_budget('write');
 if not private.room_access(p_room) or not exists(select 1 from public.room_memberships where room_id=p_room and user_id=auth.uid() and role in('proposition','opposition') and active) then raise insufficient_privilege using message='Player required';end if;
 insert into public.room_drafts(room_id,user_id) values(p_room,auth.uid()) on conflict do nothing;
 update public.room_drafts set draft=p_text,version=version+1 where room_id=p_room and user_id=auth.uid() and version=p_expected returning * into d;
 if not found then raise sqlstate 'PT409' using message='Draft changed';end if;return to_jsonb(d);
end $$;

create function public.room_submit_turn(p_room uuid,p_expected integer,p_draft integer,p_request uuid,p_text text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.debate_rooms;m public.room_memberships;t public.room_turns;dv integer;begin
 perform public.consume_budget('write');
 if not private.room_access(p_room) then raise sqlstate 'PT404' using message='Room not found';end if;
 select * into r from public.debate_rooms where id=p_room for update;
 select * into t from public.room_turns where room_id=p_room and request_id=p_request;
 if found then if t.author_id<>auth.uid() or t.content<>btrim(p_text) then raise sqlstate 'PT409' using message='Replay mismatch';end if;return public.room_detail(p_room);end if;
 select * into m from public.room_memberships where room_id=p_room and user_id=auth.uid() and active;
 select version into dv from public.room_drafts where room_id=p_room and user_id=auth.uid() for update;
 if r.version<>p_expected or coalesce(dv,0)<>p_draft then raise sqlstate 'PT409' using message='Room or draft changed';end if;
 if r.status<>'active' or r.clock_phase not in('speaking','expired') or m.role<>(case when r.turn_count%2=0 then 'proposition' else 'opposition' end) then raise sqlstate 'PT422' using message='Not your turn';end if;
 insert into public.room_turns(room_id,author_id,side,position,content,request_id) values(p_room,auth.uid(),m.role,r.turn_count,btrim(p_text),p_request);
 update public.room_drafts set draft='',version=version+1 where room_id=p_room and user_id=auth.uid();
 update public.debate_rooms set turn_count=turn_count+1,version=version+1,status=case when turn_count=5 then 'completed' else 'active' end,completed_at=case when turn_count=5 then clock_timestamp() else null end,
 clock_phase=case when turn_count=5 then 'idle' when preparation_seconds>0 then 'preparation' else 'ready' end,clock_remaining_ms=case when turn_count=5 then 0 when preparation_seconds>0 then preparation_seconds*1000 else speaking_seconds*1000 end,
 clock_started_at=case when turn_count<>5 and preparation_seconds>0 then clock_timestamp() else null end where id=p_room;
 return public.room_detail(p_room);
end $$;

create function public.create_tournament(p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare t uuid;begin
 perform public.consume_budget('create');
 insert into public.tournaments(owner_id,title,motion,host_alias,capacity,preparation_seconds,speaking_seconds) values(auth.uid(),p_data->>'title',p_data->>'motion',p_data->>'alias',(p_data->>'capacity')::integer,(p_data->>'preparation_seconds')::integer,(p_data->>'speaking_seconds')::integer) returning id into t;return t;
end $$;
create function public.tournament_detail(p_tournament uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.consume_budget('api');if not private.tournament_access(p_tournament) then raise sqlstate 'PT404' using message='Tournament not found';end if;
 return jsonb_build_object('tournament',(select to_jsonb(t) from public.tournaments t where id=p_tournament),'self_id',auth.uid(),
 'entries',coalesce((select jsonb_agg(to_jsonb(e) order by joined_at,id) from public.tournament_entries e where tournament_id=p_tournament),'[]'),
 'matches',coalesce((select jsonb_agg(to_jsonb(m) order by round,slot) from public.tournament_matches m where tournament_id=p_tournament),'[]'),
 'invites',case when exists(select 1 from public.tournaments where id=p_tournament and owner_id=auth.uid()) then coalesce((select jsonb_agg(to_jsonb(i)) from (select id,role,expires_at,uses,max_uses,revoked from public.invitations where tournament_id=p_tournament order by created_at desc limit 30) i),'[]') else '[]'::jsonb end);
end $$;

create function private.match_room(p_match uuid) returns uuid language plpgsql set search_path='' as $$
declare m public.tournament_matches;t public.tournaments;r uuid;begin
 select * into m from public.tournament_matches where id=p_match for update;
 if m.room_id is not null then return m.room_id;end if;
 if m.proposition_id is null or m.opposition_id is null then return null;end if;
 select * into t from public.tournaments where id=m.tournament_id;
 insert into public.debate_rooms(owner_id,tournament_id,motion,preparation_seconds,speaking_seconds) values(t.owner_id,t.id,t.motion,t.preparation_seconds,t.speaking_seconds) returning id into r;
 insert into public.room_memberships(room_id,user_id,role,alias) values(r,t.owner_id,'judge',t.host_alias);
 insert into public.room_memberships(room_id,user_id,role,alias) select r,user_id,case when user_id=m.proposition_id then 'proposition' when user_id=m.opposition_id then 'opposition' else 'spectator' end,alias from public.tournament_entries where tournament_id=t.id;
 update public.tournament_matches set room_id=r where id=p_match;return r;
end $$;
revoke all on function private.match_room(uuid) from public,anon,authenticated;

create function public.tournament_command(p_tournament uuid,p_expected integer,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tournaments;entrants uuid[];rd integer;slots integer;slotno integer;m uuid;when_at timestamptz;begin
 perform public.consume_budget('write');select * into t from public.tournaments where id=p_tournament and owner_id=auth.uid() for update;
 if not found then raise insufficient_privilege using message='Organizer required';end if;
 if t.version<>p_expected then raise sqlstate 'PT409' using message='Tournament changed';end if;
 if p_action='seed' then
  select array_agg(user_id order by joined_at,id) into entrants from public.tournament_entries where tournament_id=t.id;
  if t.status<>'lobby' or coalesce(array_length(entrants,1),0)<>t.capacity then raise sqlstate 'PT422' using message='Fill the roster before seeding';end if;
  rd:=1;slots:=t.capacity/2;
  while slots>=1 loop
   for slotno in 1..slots loop
    insert into public.tournament_matches(tournament_id,round,slot,proposition_id,opposition_id) values(t.id,rd,slotno,case when rd=1 then entrants[slotno*2-1] else null end,case when rd=1 then entrants[slotno*2] else null end) returning id into m;
    if rd=1 then perform private.match_room(m);end if;
   end loop;slots:=slots/2;rd:=rd+1;
  end loop;
  update public.tournaments set status='active' where id=t.id;
 elsif p_action='schedule' then
  when_at:=(p_data->>'scheduled_at')::timestamptz;
  if t.status not in('lobby','active') or (when_at is not null and (when_at<clock_timestamp()-interval '1 minute' or when_at>clock_timestamp()+interval '365 days')) or not exists(select 1 from public.tournament_matches m left join public.debate_rooms r on r.id=m.room_id where m.id=(p_data->>'match_id')::uuid and m.tournament_id=t.id and m.result_id is null and (m.room_id is null or r.status='lobby')) then raise sqlstate 'PT422' using message='Cannot schedule this match';end if;
  update public.tournament_matches set scheduled_at=when_at where id=(p_data->>'match_id')::uuid and tournament_id=t.id;
 elsif p_action='cancel' then
  if t.status not in('lobby','active') then raise sqlstate 'PT422' using message='Cannot cancel';end if;
  update public.tournaments set status='cancelled' where id=t.id;
  update public.debate_rooms set status='cancelled',clock_phase='idle',clock_remaining_ms=0,clock_started_at=null,version=version+1 where tournament_id=t.id and status in('lobby','active','paused');
 elsif p_action='revoke_invite' then update public.invitations set revoked=true where id=(p_data->>'invite_id')::uuid and tournament_id=t.id;
 else raise sqlstate 'PT422' using message='Unknown tournament action';end if;
 update public.tournaments set version=version+1 where id=t.id;return public.tournament_detail(t.id);
end $$;

create function public.save_room_ballot(p_room uuid,p_expected integer,p_request uuid,p_provider text,p_model text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.debate_rooms;ref jsonb;content text;ballot public.room_ballots;s text;k text;begin
 perform public.consume_budget('write');
 select * into r from public.debate_rooms where id=p_room for update;
 if not private.room_access(p_room) or not exists(select 1 from public.room_memberships where room_id=p_room and user_id=auth.uid() and active and role='judge') then raise insufficient_privilege using message='Independent judge required';end if;
 select * into ballot from public.room_ballots where room_id=p_room and request_id=p_request;
 if found then return to_jsonb(ballot);end if;
 if r.version<>p_expected then raise sqlstate 'PT409' using message='Room changed';end if;
 if r.status<>'completed' or r.turn_count<2 or p_payload->'delivery'<>'null'::jsonb or octet_length(p_payload::text)>60000 then raise sqlstate 'PT422' using message='Completed transcript required';end if;
 for ref in select jsonb_path_query(p_payload,'lax $.**.ref') loop
  select t.content into content from public.room_turns t where room_id=p_room and position=(ref->>'position')::integer;
  if content is null or (ref->>'start')::integer<0 or (ref->>'end')::integer>char_length(content) or (ref->>'end')::integer<=(ref->>'start')::integer or substring(content from (ref->>'start')::integer+1 for (ref->>'end')::integer-(ref->>'start')::integer) is distinct from ref->>'quote' then raise sqlstate 'PT422' using message='Ungrounded excerpt';end if;
 end loop;
 foreach s in array array['proposition','opposition'] loop
  foreach k in array array['reasoning','evidence','structure','rebuttal'] loop
   if coalesce((p_payload->s->k->>'score')::numeric not between 0 and 10,true) or s is distinct from (select side from public.room_turns where room_id=p_room and position=(p_payload->s->k->'ref'->>'position')::integer) then raise sqlstate 'PT422' using message='Invalid score attribution';end if;
  end loop;
 end loop;
 insert into public.room_ballots(room_id,requested_by,source_version,request_id,provider,model,simulated,payload) values(p_room,auth.uid(),p_expected,p_request,p_provider,p_model,p_provider='mock',p_payload) returning * into ballot;update public.debate_rooms set version=version+1 where id=p_room;return to_jsonb(ballot);
end $$;

create function public.confirm_room_result(p_room uuid,p_expected integer,p_request uuid,p_winner text,p_reason text,p_basis text,p_ballot uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.debate_rooms;m public.tournament_matches;parent public.tournament_matches;b public.room_ballots;res public.room_results;eligible boolean;u uuid;side text;t public.tournaments;begin
 perform public.consume_budget('write');
 select * into r from public.debate_rooms where id=p_room for update;
 if not private.room_access(p_room) or not exists(select 1 from public.room_memberships where room_id=p_room and user_id=auth.uid() and active and role='judge') then raise insufficient_privilege using message='Independent judge required';end if;
 select * into res from public.room_results where room_id=p_room;
 if found then
  if res.request_id<>p_request or res.reviewer_id<>auth.uid() or res.winner<>p_winner or res.reason<>p_reason then raise sqlstate 'PT409' using message='Result already confirmed';end if;return to_jsonb(res);
 end if;
 if r.version<>p_expected then raise sqlstate 'PT409' using message='Room changed';end if;
 if r.status<>'completed' or p_winner not in('proposition','opposition','draw') or char_length(p_reason) not between 10 and 2000 or p_basis not in('manual','ai_assisted') or (r.forfeit_side is not null and p_winner<>case when r.forfeit_side='proposition' then 'opposition' else 'proposition' end) then raise sqlstate 'PT422' using message='Invalid reviewed result';end if;
 if p_basis='ai_assisted' then
  select * into b from public.room_ballots where id=p_ballot and room_id=p_room and source_version<=p_expected;
  if not found then raise sqlstate 'PT422' using message='Current advisory ballot required';end if;
 elsif p_ballot is not null then raise sqlstate 'PT422' using message='Manual review has no AI ballot';end if;
 if r.tournament_id is not null then
  select * into t from public.tournaments where id=r.tournament_id for update;
  if t.status<>'active' or p_winner='draw' then raise sqlstate 'PT422' using message='Active bracket requires a reviewed winner';end if;
 end if;
 eligible:=(p_basis='manual' or not b.simulated) and (select count(*) from public.room_memberships rm join public.ranking_profiles rp on rp.user_id=rm.user_id and rp.opted_in where rm.room_id=p_room and rm.active and rm.ranking_consent and rm.role in('proposition','opposition'))=2;
 insert into public.room_results(room_id,reviewer_id,winner,reason,ballot_id,basis,ranked,request_id) values(p_room,auth.uid(),p_winner,p_reason,p_ballot,p_basis,eligible,p_request) returning * into res;
 if eligible then
  insert into public.rankings(result_id,user_id,outcome,points) select res.id,user_id,case when p_winner='draw' then 'draw' when role=p_winner then 'win' else 'loss' end,case when p_winner='draw' then 1 when role=p_winner then 3 else 0 end from public.room_memberships where room_id=p_room and active and role in('proposition','opposition');
 end if;
 if r.tournament_id is not null then
  select user_id into u from public.room_memberships where room_id=p_room and active and role=p_winner;
  update public.tournament_matches set winner_id=u,result_id=res.id where room_id=p_room returning * into m;
  select * into parent from public.tournament_matches where tournament_id=r.tournament_id and round=m.round+1 and slot=(m.slot+1)/2 for update;
  if found then
   update public.tournament_matches set proposition_id=case when m.slot%2=1 then u else proposition_id end,opposition_id=case when m.slot%2=0 then u else opposition_id end where id=parent.id;
   perform private.match_room(parent.id);
  else update public.tournaments set status='completed',winner_id=u where id=r.tournament_id;end if;
  update public.tournaments set version=version+1 where id=r.tournament_id;
 end if;
 update public.debate_rooms set version=version+1 where id=p_room;
 insert into public.room_events(room_id,actor_id,action,reason) values(p_room,auth.uid(),'confirm_result',p_reason);
 return to_jsonb(res);
end $$;

create function public.set_ranking_profile(p_expected integer,p_handle text,p_opted boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.ranking_profiles;begin
 perform public.consume_budget('write');
 insert into public.ranking_profiles(user_id,handle) values(auth.uid(),p_handle) on conflict(user_id) do nothing;
 update public.ranking_profiles set handle=p_handle,opted_in=p_opted,version=version+1 where user_id=auth.uid() and version=p_expected returning * into p;
 if not found then raise sqlstate 'PT409' using message='Profile changed';end if;return to_jsonb(p);
end $$;
create function public.practice_leaderboard() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.consume_budget('api');
 return coalesce((select jsonb_agg(to_jsonb(x) order by rank,handle) from (
  select dense_rank() over(order by coalesce(sum(r.points),0) desc,count(*) filter(where r.outcome='win') desc) as rank,p.handle,coalesce(sum(r.points),0) as points,count(r.id) as matches,count(*) filter(where r.outcome='win') as wins,count(*) filter(where r.outcome='draw') as draws,count(*) filter(where r.outcome='loss') as losses
  from public.ranking_profiles p join public.rankings r on r.user_id=p.user_id where p.opted_in group by p.user_id,p.handle order by points desc,wins desc,p.handle limit 100
 ) x),'[]');
end $$;

create function public.room_connect(p_room uuid,p_connection uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.consume_budget('api');if not private.room_access(p_room) then raise sqlstate 'PT404' using message='Room not found';end if;
 insert into public.room_presence(room_id,user_id,connection_id) values(p_room,auth.uid(),p_connection) on conflict(room_id,user_id) do update set connection_id=p_connection,voice=false,last_seen=clock_timestamp();
end $$;
create function public.room_voice(p_room uuid,p_connection uuid,p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.consume_budget('signal');
 if not private.room_access(p_room) or (p_enabled and not exists(select 1 from public.debate_rooms where id=p_room and status in('lobby','active','paused'))) then raise sqlstate 'PT404' using message='Room unavailable';end if;
 update public.room_presence set voice=p_enabled,last_seen=clock_timestamp() where room_id=p_room and user_id=auth.uid() and connection_id=p_connection;
 if not found then raise sqlstate 'PT409' using message='Connection replaced';end if;
end $$;
create function public.room_send_signal(p_room uuid,p_connection uuid,p_target uuid,p_target_connection uuid,p_kind text,p_payload jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.consume_budget('signal');
 if not private.room_access(p_room) or p_target=auth.uid() or p_kind not in('description','candidate') or octet_length(p_payload::text)>14000 or not exists(
  select 1 from public.room_presence s join public.room_presence t on t.room_id=s.room_id
  join public.room_memberships sm on sm.room_id=s.room_id and sm.user_id=s.user_id and sm.active
  join public.room_memberships tm on tm.room_id=t.room_id and tm.user_id=t.user_id and tm.active
  join public.debate_rooms r on r.id=s.room_id and r.status in('lobby','active','paused')
  where s.room_id=p_room and s.user_id=auth.uid() and s.connection_id=p_connection and s.voice and s.last_seen>clock_timestamp()-interval '15 seconds'
  and t.user_id=p_target and t.connection_id=p_target_connection and t.voice and t.last_seen>clock_timestamp()-interval '15 seconds'
  and (sm.role in('proposition','opposition') or tm.role in('proposition','opposition'))
 ) then raise insufficient_privilege using message='Signal not authorized';end if;
 insert into public.room_signals(room_id,sender_id,target_id,sender_connection,target_connection,kind,payload) values(p_room,auth.uid(),p_target,p_connection,p_target_connection,p_kind,p_payload);
end $$;
create function public.room_live_tick(p_room uuid,p_connection uuid,p_after bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 perform public.consume_budget('live');if not private.room_access(p_room) then raise sqlstate 'PT404' using message='Room not found';end if;
 update public.room_presence set last_seen=clock_timestamp() where room_id=p_room and user_id=auth.uid() and connection_id=p_connection;
 if not found then raise sqlstate 'PT409' using message='Connection replaced';end if;
 perform private.normalize_room(p_room);
 delete from public.room_signals where expires_at<=clock_timestamp();
 result:=jsonb_build_object('version',(select version from public.debate_rooms where id=p_room),
  'peers',coalesce((select jsonb_agg(jsonb_build_object('user_id',p.user_id,'connection_id',p.connection_id,'voice',p.voice,'muted',m.voice_muted)) from public.room_presence p join public.room_memberships m on m.room_id=p.room_id and m.user_id=p.user_id and m.active where p.room_id=p_room and p.last_seen>clock_timestamp()-interval '15 seconds'),'[]'),
  'signals',coalesce((select jsonb_agg(to_jsonb(x) order by id) from (select id,sender_id,sender_connection,kind,payload from public.room_signals where room_id=p_room and target_id=auth.uid() and target_connection=p_connection and id>p_after and expires_at>clock_timestamp() order by id limit 200) x),'[]'));
 return result;
end $$;
create function public.room_disconnect(p_room uuid,p_connection uuid) returns void language plpgsql security definer set search_path='' as $$
begin delete from public.room_presence where room_id=p_room and user_id=auth.uid() and connection_id=p_connection;end $$;

-- Removing an account removes shared records containing that participant, including derived credits.
create function private.erase_multiplayer() returns trigger language plpgsql security definer set search_path='' as $$
begin
 delete from public.tournaments where owner_id=old.id or id in(select tournament_id from public.tournament_entries where user_id=old.id);
 delete from public.debate_rooms where owner_id=old.id or id in(select room_id from public.room_memberships where user_id=old.id);
 return old;
end $$;
revoke all on function private.erase_multiplayer() from public,anon,authenticated;
create trigger erase_multiplayer before delete on auth.users for each row execute function private.erase_multiplayer();

-- Do not leave default PUBLIC execute grants on exposed definer RPCs.
do $$ declare fn record;begin
 for fn in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('room_detail','create_room','create_invitation','accept_invitation','room_command','room_save_draft','room_submit_turn','create_tournament','tournament_detail','tournament_command','save_room_ballot','confirm_room_result','set_ranking_profile','practice_leaderboard','room_connect','room_voice','room_send_signal','room_live_tick','room_disconnect') loop
  execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
  execute format('grant execute on function %s to authenticated',fn.signature);
 end loop;
end $$;
