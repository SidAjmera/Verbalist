-- Private, self-owned practice analysis. These records are advisory, not attested competition results.
-- Procedures stay at format version 1; this adds the separately versioned advisory rubric.
update public.debate_formats set config=jsonb_set(config,'{scoring}','{"rubric_version":"quick-v1","weights":{"reasoning":30,"evidence":20,"structure":20,"rebuttal":30},"delivery":false}'::jsonb) where id='quick';
create table public.analysis_runs (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null, session_id uuid not null,
  session_version integer not null check(session_version>=0), request_id uuid not null,
  provider text not null check(provider in ('openai','anthropic','gemini','compatible','local','mock')),
  model text not null check(char_length(model) between 1 and 160), simulated boolean not null,
  rubric_version text not null default 'quick-v1' check(rubric_version='quick-v1'),
  extractor_version text not null default 'arguments-v1' check(extractor_version='arguments-v1'),
  summary text not null check(char_length(summary) between 1 and 2000), uncertainty text not null check(char_length(uncertainty) between 1 and 2000),
  created_at timestamptz not null default now(),
  foreign key(session_id,owner_id) references public.debate_sessions(id,owner_id) on delete cascade,
  unique(id,owner_id,session_id), unique(owner_id,request_id)
);
create index analysis_runs_session_latest on public.analysis_runs(session_id,created_at desc,id desc);
create index analysis_runs_owner on public.analysis_runs(owner_id);
create table public.arguments (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null, session_id uuid not null, run_id uuid not null,
  ordinal integer not null check(ordinal between 0 and 29), data jsonb not null,
  created_at timestamptz not null default now(),
  foreign key(run_id,owner_id,session_id) references public.analysis_runs(id,owner_id,session_id) on delete cascade,
  unique(id,run_id), unique(run_id,ordinal)
);
create index arguments_owner on public.arguments(owner_id);
create table public.argument_links (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null, session_id uuid not null, run_id uuid not null,
  source_id uuid not null, target_id uuid not null, relation text not null check(relation in ('supports','rebuts','contradicts','concedes','answers')),
  explanation text not null check(char_length(explanation) between 1 and 1000), confidence numeric not null check(confidence between 0 and 1),
  foreign key(run_id,owner_id,session_id) references public.analysis_runs(id,owner_id,session_id) on delete cascade,
  foreign key(source_id,run_id) references public.arguments(id,run_id) on delete cascade,
  foreign key(target_id,run_id) references public.arguments(id,run_id) on delete cascade,
  check(source_id<>target_id), unique(run_id,source_id,target_id,relation)
);
create index argument_links_owner on public.argument_links(owner_id);
create index argument_links_source on public.argument_links(source_id,run_id);
create index argument_links_target on public.argument_links(target_id,run_id);
create table public.judge_ballots (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null, session_id uuid not null, run_id uuid not null unique,
  data jsonb not null, human_total numeric not null check(human_total between 0 and 100), ai_total numeric not null check(ai_total between 0 and 100),
  winner text not null check(winner in ('human','ai','draw')),
  foreign key(run_id,owner_id,session_id) references public.analysis_runs(id,owner_id,session_id) on delete cascade
);
create index judge_ballots_owner on public.judge_ballots(owner_id);
create table public.feedback_reports (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null, session_id uuid not null, run_id uuid not null unique, data jsonb not null,
  foreign key(run_id,owner_id,session_id) references public.analysis_runs(id,owner_id,session_id) on delete cascade
);
create index feedback_reports_owner on public.feedback_reports(owner_id);
create table public.factual_claims (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null, session_id uuid not null, run_id uuid not null,
  data jsonb not null, status text not null default 'unverified' check(status in ('verified','disputed','unverified')),
  assessment text not null default 'No research has been performed.', version integer not null default 0,
  checked_at timestamptz,
  research_model text check(char_length(research_model) between 1 and 160),
  foreign key(run_id,owner_id,session_id) references public.analysis_runs(id,owner_id,session_id) on delete cascade,
  unique(id,owner_id)
);
create index factual_claims_owner on public.factual_claims(owner_id);
create index factual_claims_run on public.factual_claims(run_id);
create table public.evidence_sources (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null, claim_id uuid not null,
  url text not null check(url ~ '^https://[^[:space:]]+$' and char_length(url)<=2000), title text not null check(char_length(title) between 1 and 300),
  retrieved_at timestamptz not null default now(),
  foreign key(claim_id,owner_id) references public.factual_claims(id,owner_id) on delete cascade,
  unique(claim_id,url)
);
create index evidence_sources_owner on public.evidence_sources(owner_id);
create table public.practice_drills (
  id text primary key, title text not null, skill text not null, prompt text not null, criteria jsonb not null, version text not null default 'drill-v1'
);
insert into public.practice_drills(id,title,skill,prompt,criteria) values
('mechanism','Build the mechanism','reasoning','Argue for or against free public transport. Explain at least two causal steps and one assumption connecting the policy to its outcome.','["Clear claim","Connected causal steps","Assumption or limitation"]'),
('evidence','Test the evidence','evidence','A speaker says: One small survey proves every student learns better online. Explain what the survey can and cannot establish, and what evidence you would seek. Do not invent a study.','["Identifies scope limitation","Separates evidence from inference","Specific verification plan"]'),
('rebuttal','Answer the strongest point','rebuttal','Your opponent argues: Continuous assessment creates constant stress and rewards students with more support at home. Rebut the strongest reasoning fairly and explain a practical safeguard.','["Fair opponent summary","Direct response to reasoning","Feasible safeguard"]'),
('weighing','Compare the impacts','structure','Compare free public transport with targeted fare subsidies. Explain whose interests matter, likely scale, and a tradeoff that could change your conclusion.','["Explicit comparison","Explained impact priority","Meaningful tradeoff"]'),
('fallacy','Repair a weak inference','reasoning','A speaker says: My opponent changed their opinion once, so their proposal must be wrong. Explain the potential reasoning problem and replace it with a substantive criticism of the proposal.','["Explains potential flaw","Avoids personal attack","Substantive replacement"]');
create table public.drill_attempts (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  drill_id text not null references public.practice_drills(id), request_id uuid not null, response text not null check(char_length(response) between 40 and 4000),
  feedback jsonb not null, score integer not null check(score between 0 and 6),
  provider text not null check(provider in ('openai','anthropic','gemini','compatible','local','mock')), model text not null check(char_length(model) between 1 and 160), simulated boolean not null,
  rubric_version text not null default 'drill-v1', created_at timestamptz not null default now(), unique(owner_id,request_id)
);
create index drill_attempts_owner_created on public.drill_attempts(owner_id,created_at desc,id desc);
create table public.user_progress (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null unique references auth.users(id) on delete cascade,
  data jsonb not null, updated_at timestamptz not null default now()
);
create table public.achievements (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  code text not null check(code in ('first_debate','three_debates','first_review','first_drill')), earned_at timestamptz not null default now(), unique(owner_id,code)
);
create index achievements_owner on public.achievements(owner_id);

do $$ declare t text; begin
  foreach t in array array['analysis_runs','arguments','argument_links','judge_ballots','feedback_reports','factual_claims','evidence_sources','drill_attempts','user_progress','achievements'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy own_data on public.%I for select to authenticated using ((select auth.uid())=owner_id)',t);
  end loop;
end $$;
alter table public.practice_drills enable row level security;
revoke all on public.practice_drills from public,anon,authenticated;
grant select on public.practice_drills to authenticated;
create policy drill_catalog on public.practice_drills for select to authenticated using(true);

create function public.learning_progress() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); result jsonb; n integer; d integer; attempts integer; averages jsonb; trend jsonb;
begin
  perform public.consume_budget('api');
  -- DISTINCT ON prevents repeated evaluations from inflating an account's averages.
  with latest as (
    select distinct on (r.session_id) r.id,r.session_id,r.created_at from public.analysis_runs r
    join public.judge_ballots b on b.run_id=r.id join public.debate_sessions s on s.id=r.session_id
    where r.owner_id=u and not r.simulated and s.status='completed' order by r.session_id,r.created_at desc,r.id desc
  ) select count(*),coalesce(jsonb_object_agg(skill,avg_score),'{}') into n,averages from (
    select skill,round(avg((b.data->'human'->skill->>'score')::numeric),2) avg_score
    from latest l join public.judge_ballots b on b.run_id=l.id
    cross join (values('reasoning'),('evidence'),('structure'),('rebuttal')) k(skill) group by skill
  ) x;
  select count(*) into n from (select distinct r.session_id from public.analysis_runs r join public.judge_ballots b on b.run_id=r.id where r.owner_id=u and not r.simulated) x;
  with latest as (
    select distinct on (r.session_id) r.*,b.human_total,b.data from public.analysis_runs r join public.judge_ballots b on b.run_id=r.id
    where r.owner_id=u and not r.simulated order by r.session_id,r.created_at desc,r.id desc
  ), recent as (select l.id,l.session_id,l.created_at,l.human_total,l.model,l.provider,l.rubric_version,l.data->'human' as skills,s.completed_at from latest l join public.debate_sessions s on s.id=l.session_id where s.status='completed' order by s.completed_at desc limit 30)
  select coalesce(jsonb_agg(to_jsonb(recent) order by completed_at),'[]') into trend from recent;
  select count(*) into d from public.debate_sessions where owner_id=u and status='completed';
  select count(*) into attempts from public.drill_attempts where owner_id=u and not simulated;
  insert into public.achievements(owner_id,code)
    select u,code from (values('first_debate',d>=1),('three_debates',d>=3),('first_review',n>=1),('first_drill',attempts>=1)) v(code,earned) where earned on conflict do nothing;
  result:=jsonb_build_object('evaluated',n,'drill_count',attempts,'skills',averages,'trend',trend,
    'simulated_reviews',(select count(*) from public.analysis_runs where owner_id=u and simulated),
    'achievements',coalesce((select jsonb_agg(to_jsonb(a) order by a.earned_at) from public.achievements a where a.owner_id=u),'[]'));
  insert into public.user_progress(owner_id,data) values(u,result) on conflict(owner_id) do update set data=excluded.data,updated_at=now();
  return result;
end $$;

create function public.save_analysis(p_session uuid,p_expected integer,p_request uuid,p_provider text,p_model text,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare s public.debate_sessions; run uuid; a jsonb; l jsonb; ref jsonb; content text; node uuid; mapping jsonb:='{}'; h numeric; ai numeric; skill text; ordinal integer:=0;
begin
  perform public.consume_budget('write');
  select * into s from public.debate_sessions where id=p_session and owner_id=auth.uid() for update;
  if not found then raise sqlstate 'PT404' using message='Not found';end if;
  select id into run from public.analysis_runs where owner_id=auth.uid() and request_id=p_request;
  if found then
    if not exists(select 1 from public.analysis_runs where id=run and session_id=p_session and session_version=p_expected) then raise sqlstate 'PT409' using message='Replay mismatch';end if;
    return run;
  end if;
  if s.version<>p_expected then raise sqlstate 'PT409' using message='Debate changed';end if;
  if s.turn_count=0 or octet_length(p_data::text)>120000 or jsonb_array_length(p_data->'arguments') not between 1 and 30 or jsonb_array_length(p_data->'links')>40 or jsonb_array_length(p_data->'claims')>10 then raise sqlstate 'PT422' using message='Invalid analysis';end if;
  -- Every supplied reference must resolve to the exact immutable transcript substring (Unicode code points).
  for ref in select jsonb_path_query(p_data,'lax $.**.ref') loop
    select t.content into content from public.debate_turns t where t.session_id=p_session and t.position=(ref->>'position')::integer;
    if content is null or (ref->>'start')::integer<0 or (ref->>'end')::integer>char_length(content) or (ref->>'end')::integer<=(ref->>'start')::integer or substring(content from (ref->>'start')::integer+1 for (ref->>'end')::integer-(ref->>'start')::integer) is distinct from ref->>'quote' then raise sqlstate 'PT422' using message='Ungrounded transcript reference';end if;
  end loop;
  insert into public.analysis_runs(owner_id,session_id,session_version,request_id,provider,model,simulated,summary,uncertainty)
    values(auth.uid(),p_session,p_expected,p_request,p_provider,p_model,p_provider='mock',p_data->>'summary',p_data->>'uncertainty') returning id into run;
  for a in select value from jsonb_array_elements(p_data->'arguments') loop
    if not a ? 'ref' or a->>'kind' not in ('claim','evidence','reasoning','counterargument','rebuttal','concession','contradiction','unanswered','potential_fallacy') or (a->>'confidence')::numeric not between 0 and 1 or (a->>'speaker') is distinct from (select speaker from public.debate_turns where session_id=p_session and position=(a->'ref'->>'position')::integer) then raise sqlstate 'PT422' using message='Invalid argument';end if;
    insert into public.arguments(owner_id,session_id,run_id,ordinal,data) values(auth.uid(),p_session,run,ordinal,a) returning id into node;
    ordinal:=ordinal+1;
    if mapping ? (a->>'key') then raise sqlstate 'PT422' using message='Duplicate node';end if;
    mapping:=mapping || jsonb_build_object(a->>'key',node);
  end loop;
  for l in select value from jsonb_array_elements(p_data->'links') loop
    if not mapping ? (l->>'source') or not mapping ? (l->>'target') then raise sqlstate 'PT422' using message='Dangling link';end if;
    insert into public.argument_links(owner_id,session_id,run_id,source_id,target_id,relation,explanation,confidence) values(auth.uid(),p_session,run,(mapping->>(l->>'source'))::uuid,(mapping->>(l->>'target'))::uuid,l->>'relation',l->>'explanation',(l->>'confidence')::numeric);
  end loop;
  for a in select value from jsonb_array_elements(p_data->'claims') loop
    if not a ? 'ref' then raise sqlstate 'PT422' using message='Claim reference required';end if;
    insert into public.factual_claims(owner_id,session_id,run_id,data) values(auth.uid(),p_session,run,a);
  end loop;
  if p_data->'ballot'<>'null'::jsonb then
    if s.status<>'completed' or p_data->'ballot'->'delivery'<>'null'::jsonb then raise sqlstate 'PT422' using message='Cannot score delivery or unfinished debate';end if;
    h:=0;ai:=0;
    foreach skill in array array['reasoning','evidence','structure','rebuttal'] loop
      if (p_data->'ballot'->'human'->skill->>'score')::numeric not between 0 and 10 or (p_data->'ballot'->'ai'->skill->>'score')::numeric not between 0 and 10 then raise sqlstate 'PT422' using message='Invalid score';end if;
      h:=h+(p_data->'ballot'->'human'->skill->>'score')::numeric*case when skill in ('reasoning','rebuttal') then 3 else 2 end;
      ai:=ai+(p_data->'ballot'->'ai'->skill->>'score')::numeric*case when skill in ('reasoning','rebuttal') then 3 else 2 end;
    end loop;
    insert into public.judge_ballots(owner_id,session_id,run_id,data,human_total,ai_total,winner) values(auth.uid(),p_session,run,p_data->'ballot',h,ai,case when abs(h-ai)<=3 then 'draw' when h>ai then 'human' else 'ai' end);
  end if;
  insert into public.feedback_reports(owner_id,session_id,run_id,data) values(auth.uid(),p_session,run,p_data->'coach');
  return run;
end $$;

create function public.analysis_detail(p_session uuid,p_run uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.analysis_runs;begin
  perform public.consume_budget('api');
  if not exists(select 1 from public.debate_sessions where id=p_session and owner_id=auth.uid()) then raise sqlstate 'PT404' using message='Not found';end if;
  select * into r from public.analysis_runs where session_id=p_session and owner_id=auth.uid() and (p_run is null or id=p_run) order by created_at desc,id desc limit 1;
  if not found then
    if p_run is not null then raise sqlstate 'PT404' using message='Review not found';end if;
    return null;
  end if;
  return jsonb_build_object('run',to_jsonb(r),'arguments',coalesce((select jsonb_agg(to_jsonb(a) order by ordinal) from public.arguments a where run_id=r.id),'[]'),
    'links',coalesce((select jsonb_agg(to_jsonb(l)) from public.argument_links l where run_id=r.id),'[]'),
    'claims',coalesce((select jsonb_agg(to_jsonb(c)) from public.factual_claims c where run_id=r.id),'[]'),
    'sources',coalesce((select jsonb_agg(to_jsonb(e)) from public.evidence_sources e join public.factual_claims c on c.id=e.claim_id where c.run_id=r.id),'[]'),
    'ballot',(select data || jsonb_build_object('human_total',human_total,'ai_total',ai_total,'winner',winner) from public.judge_ballots where run_id=r.id),
    'coach',(select data from public.feedback_reports where run_id=r.id));
end $$;

create function public.save_drill_attempt(p_drill text,p_request uuid,p_response text,p_provider text,p_model text,p_feedback jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.drill_attempts; c jsonb; total integer:=0;begin
  perform public.consume_budget('write');
  select * into a from public.drill_attempts where owner_id=auth.uid() and request_id=p_request;
  if found then
    if a.drill_id<>p_drill or a.response<>p_response then raise sqlstate 'PT409' using message='Replay mismatch';end if;return to_jsonb(a);
  end if;
  if jsonb_array_length(p_feedback->'criteria')<>3 or octet_length(p_feedback::text)>12000 then raise sqlstate 'PT422' using message='Invalid feedback';end if;
  for c in select value from jsonb_array_elements(p_feedback->'criteria') loop
    if (c->>'score')::integer not between 0 and 2 or length(c->>'quote')<3 or strpos(p_response,c->>'quote')=0 then raise sqlstate 'PT422' using message='Invalid criterion';end if;
    total:=total+(c->>'score')::integer;
  end loop;
  insert into public.drill_attempts(owner_id,drill_id,request_id,response,provider,model,simulated,feedback,score) values(auth.uid(),p_drill,p_request,p_response,p_provider,p_model,p_provider='mock',p_feedback,total) on conflict(owner_id,request_id) do nothing returning * into a;
  if a.id is null then
    select * into a from public.drill_attempts where owner_id=auth.uid() and request_id=p_request;
    if a.drill_id<>p_drill or a.response<>p_response then raise sqlstate 'PT409' using message='Replay mismatch';end if;
  end if;
  return to_jsonb(a);
end $$;

create function public.save_research(p_claim uuid,p_expected integer,p_status text,p_assessment text,p_model text,p_sources jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare c public.factual_claims;e jsonb;begin
  perform public.consume_budget('write');
  select * into c from public.factual_claims where id=p_claim and owner_id=auth.uid() for update;
  if not found then raise sqlstate 'PT404' using message='Not found';end if;
  if c.version<>p_expected then raise sqlstate 'PT409' using message='Claim changed';end if;
  if p_status not in ('verified','disputed','unverified') or length(p_model) not between 1 and 160 or length(p_assessment) not between 1 and 4000 or jsonb_array_length(p_sources)>10 or (p_status<>'unverified' and jsonb_array_length(p_sources)=0) then raise sqlstate 'PT422' using message='Missing research evidence';end if;
  delete from public.evidence_sources where claim_id=p_claim;
  for e in select value from jsonb_array_elements(p_sources) loop
    insert into public.evidence_sources(owner_id,claim_id,url,title) values(auth.uid(),p_claim,e->>'url',e->>'title') on conflict(claim_id,url) do nothing;
  end loop;
  update public.factual_claims set status=p_status,assessment=p_assessment,research_model=p_model,version=version+1,checked_at=now() where id=p_claim;
end $$;

revoke all on function public.learning_progress(),public.save_analysis(uuid,integer,uuid,text,text,jsonb),public.analysis_detail(uuid,uuid),public.save_drill_attempt(text,uuid,text,text,text,jsonb),public.save_research(uuid,integer,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.learning_progress(),public.save_analysis(uuid,integer,uuid,text,text,jsonb),public.analysis_detail(uuid,uuid),public.save_drill_attempt(text,uuid,text,text,text,jsonb),public.save_research(uuid,integer,text,text,text,jsonb) to authenticated;
