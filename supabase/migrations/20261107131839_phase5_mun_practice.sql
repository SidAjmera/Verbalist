-- Private, text-first educational MUN practice. No official country-policy verification.
create table public.mun_committees (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,
 committee_key text not null check(committee_key in('assembly','environment','health')),
 agenda text not null check(char_length(btrim(agenda)) between 10 and 600),procedure_version text not null default 'mun-practice-v1' check(procedure_version='mun-practice-v1'),
 status text not null default 'active' check(status in('active','paused','completed','cancelled')),
 stage text not null default 'opening' check(stage in('opening','caucus','negotiation')),
 topic text not null check(char_length(btrim(topic)) between 10 and 600),current_ordinal integer not null default 0 check(current_ordinal between 0 and 2),
 target_ordinal integer check(target_ordinal in(1,2)),message_count integer not null default 0 check(message_count between 0 and 60),version integer not null default 0,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),completed_at timestamptz,unique(id,owner_id),
 check((stage='negotiation')=(target_ordinal is not null))
);
create index mun_committees_owner on public.mun_committees(owner_id,created_at desc,id desc);
create table public.mun_delegates (
 id uuid primary key default gen_random_uuid(),committee_id uuid not null,owner_id uuid not null,
 ordinal integer not null check(ordinal between 0 and 2),role text not null check(role in('human','ai')),
 country_code text not null check(country_code in('BR','DE','IN','KE','SG','GB','US','ZA')),country_name text not null,
 brief text not null check(char_length(btrim(brief)) between 20 and 2000),sources jsonb not null default '[]' check(jsonb_typeof(sources)='array' and jsonb_array_length(sources)<=3),
 foreign key(committee_id,owner_id) references public.mun_committees(id,owner_id) on delete cascade,
 unique(committee_id,ordinal),unique(committee_id,country_code),unique(id,committee_id,owner_id),check((ordinal=0)=(role='human'))
);
create index mun_delegates_owner on public.mun_delegates(owner_id);
create table public.mun_messages (
 id uuid primary key default gen_random_uuid(),committee_id uuid not null,owner_id uuid not null,delegate_id uuid not null,
 position integer not null check(position between 0 and 59),stage text not null check(stage in('opening','caucus','negotiation')),topic text not null,
 content text not null check(char_length(btrim(content)) between 1 and 6000),request_id uuid not null,
 provider text check(provider in('openai','anthropic','gemini','compatible','local','mock')),model text check(char_length(model) between 1 and 160),simulated boolean not null default false,created_at timestamptz not null default now(),
 foreign key(delegate_id,committee_id,owner_id) references public.mun_delegates(id,committee_id,owner_id) on delete cascade,
 unique(committee_id,position),unique(committee_id,request_id),check((provider is null)=(model is null)),check(simulated=(provider is not distinct from 'mock'))
);
create index mun_messages_owner on public.mun_messages(owner_id);
create table public.mun_drafts (
 id uuid primary key default gen_random_uuid(),committee_id uuid not null,owner_id uuid not null,draft text not null default '' check(char_length(draft)<=6000),version integer not null default 0,
 foreign key(committee_id,owner_id) references public.mun_committees(id,owner_id) on delete cascade,unique(committee_id,owner_id)
);
create index mun_drafts_owner on public.mun_drafts(owner_id);
do $$ declare t text;begin
 foreach t in array array['mun_committees','mun_delegates','mun_messages','mun_drafts'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy own_mun on public.%I for select to authenticated using(owner_id=(select auth.uid()) and private.verified_member())',t);
 end loop;
end $$;

create function public.mun_detail(p_committee uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.consume_budget('api');
 if not exists(select 1 from public.mun_committees where id=p_committee and owner_id=auth.uid()) then raise sqlstate 'PT404' using message='Practice not found';end if;
 return jsonb_build_object('committee',(select to_jsonb(c) from public.mun_committees c where id=p_committee),
 'delegates',(select jsonb_agg(to_jsonb(d) order by ordinal) from public.mun_delegates d where committee_id=p_committee),
 'messages',coalesce((select jsonb_agg(to_jsonb(m) order by position) from public.mun_messages m where committee_id=p_committee),'[]'),
 'draft',coalesce((select to_jsonb(d) from public.mun_drafts d where committee_id=p_committee and owner_id=auth.uid()),'{"draft":"","version":0}'::jsonb));
end $$;
create function public.create_mun(p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare c uuid;item jsonb;i integer:=0;country text;name text;source jsonb;begin
 perform public.consume_budget('create');
 if jsonb_typeof(p_data->'delegates') is distinct from 'array' or jsonb_array_length(p_data->'delegates')<>3 then raise sqlstate 'PT422' using message='Three distinct delegate briefs required';end if;
 insert into public.mun_committees(owner_id,committee_key,agenda,topic) values(auth.uid(),p_data->>'committee_key',btrim(p_data->>'agenda'),btrim(p_data->>'agenda')) returning id into c;
 for item in select value from jsonb_array_elements(p_data->'delegates') loop
  country:=item->>'country_code';name:=case country when 'BR' then 'Brazil' when 'DE' then 'Germany' when 'IN' then 'India' when 'KE' then 'Kenya' when 'SG' then 'Singapore' when 'GB' then 'United Kingdom' when 'US' then 'United States' when 'ZA' then 'South Africa' else null end;
  if name is null or jsonb_typeof(coalesce(item->'sources','[]'))<>'array' then raise sqlstate 'PT422' using message='Invalid delegate';end if;
  for source in select value from jsonb_array_elements(coalesce(item->'sources','[]')) loop
   if jsonb_typeof(source)<>'string' or char_length(source#>>'{}')>2000 or (source#>>'{}')!~'^https://[^[:space:]@]+$' then raise sqlstate 'PT422' using message='Invalid research link';end if;
  end loop;
  insert into public.mun_delegates(committee_id,owner_id,ordinal,role,country_code,country_name,brief,sources) values(c,auth.uid(),i,case when i=0 then 'human' else 'ai' end,country,name,item->>'brief',coalesce(item->'sources','[]'));
  i:=i+1;
 end loop;return c;
end $$;
create function public.mun_save_draft(p_committee uuid,p_expected integer,p_text text) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.mun_drafts;begin
 perform public.consume_budget('write');
 perform 1 from public.mun_committees where id=p_committee and owner_id=auth.uid() and status in('active','paused') for update;
 if not found then raise sqlstate 'PT404' using message='Active practice not found';end if;
 insert into public.mun_drafts(committee_id,owner_id) values(p_committee,auth.uid()) on conflict do nothing;
 update public.mun_drafts set draft=p_text,version=version+1 where committee_id=p_committee and owner_id=auth.uid() and version=p_expected returning * into d;
 if not found then raise sqlstate 'PT409' using message='Draft changed';end if;return to_jsonb(d);
end $$;
create function public.mun_append(p_committee uuid,p_expected integer,p_draft integer,p_request uuid,p_text text,p_provider text,p_model text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.mun_committees;d public.mun_delegates;prior public.mun_messages;dv integer;begin
 perform public.consume_budget('write');
 select * into c from public.mun_committees where id=p_committee and owner_id=auth.uid() for update;
 if not found then raise sqlstate 'PT404' using message='Practice not found';end if;
 select * into prior from public.mun_messages where committee_id=p_committee and request_id=p_request;
 if found then
  if prior.content is distinct from btrim(p_text) or prior.provider is distinct from p_provider or prior.model is distinct from p_model then raise sqlstate 'PT409' using message='Replay mismatch';end if;
  return public.mun_detail(p_committee);
 end if;
 if c.version<>p_expected then raise sqlstate 'PT409' using message='Practice changed';end if;
 if c.status<>'active' or c.message_count>=60 then raise sqlstate 'PT422' using message='Active speaking slot required';end if;
 select * into d from public.mun_delegates where committee_id=p_committee and ordinal=c.current_ordinal;
 if (d.role='human')<>(p_provider is null) or (p_provider is null)<>(p_model is null) then raise sqlstate 'PT422' using message='Wrong speaker';end if;
 if d.role='human' then
  insert into public.mun_drafts(committee_id,owner_id) values(p_committee,auth.uid()) on conflict do nothing;
  select version into dv from public.mun_drafts where committee_id=p_committee and owner_id=auth.uid() for update;
  if p_draft is null or p_draft<>dv then raise sqlstate 'PT409' using message='Draft changed';end if;
  update public.mun_drafts set draft='',version=version+1 where committee_id=p_committee and owner_id=auth.uid();
 elsif p_draft is not null then raise sqlstate 'PT422' using message='AI cannot consume a human draft';end if;
 insert into public.mun_messages(committee_id,owner_id,delegate_id,position,stage,topic,content,request_id,provider,model,simulated) values(p_committee,auth.uid(),d.id,c.message_count,c.stage,c.topic,btrim(p_text),p_request,p_provider,p_model,p_provider is not distinct from 'mock');
 update public.mun_committees set message_count=message_count+1,version=version+1,updated_at=clock_timestamp(),
 current_ordinal=case when c.stage='negotiation' then case when c.current_ordinal=0 then c.target_ordinal else 0 end else (c.current_ordinal+1)%3 end,
 stage=case when c.stage='opening' and c.message_count=2 then 'caucus' else stage end where id=p_committee;
 return public.mun_detail(p_committee);
end $$;
create function public.mun_command(p_committee uuid,p_expected integer,p_action text,p_topic text,p_target integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.mun_committees;begin
 perform public.consume_budget('write');select * into c from public.mun_committees where id=p_committee and owner_id=auth.uid() for update;
 if not found then raise sqlstate 'PT404' using message='Practice not found';end if;
 if c.version<>p_expected then raise sqlstate 'PT409' using message='Practice changed';end if;
 if p_action='pause' and c.status='active' then update public.mun_committees set status='paused' where id=c.id;
 elsif p_action='resume' and c.status='paused' then update public.mun_committees set status='active' where id=c.id;
 elsif p_action='finish' and c.status in('active','paused') and c.message_count>0 then update public.mun_committees set status='completed',completed_at=clock_timestamp() where id=c.id;
 elsif p_action='cancel' and c.status in('active','paused') then update public.mun_committees set status='cancelled',completed_at=clock_timestamp() where id=c.id;
 elsif p_action in('caucus','negotiate') and c.status='active' and c.stage<>'opening' and c.current_ordinal=0 then
  if p_topic is null or char_length(btrim(p_topic)) not between 10 and 400 or (p_action='negotiate' and (p_target is null or p_target not in(1,2))) then raise sqlstate 'PT422' using message='Topic and negotiation partner required';end if;
  update public.mun_committees set stage=case when p_action='caucus' then 'caucus' else 'negotiation' end,topic=btrim(p_topic),target_ordinal=case when p_action='negotiate' then p_target else null end where id=c.id;
 else raise sqlstate 'PT422' using message='Invalid practice transition';end if;
 update public.mun_committees set version=version+1,updated_at=clock_timestamp() where id=c.id;return public.mun_detail(c.id);
end $$;
revoke all on function public.mun_detail(uuid),public.create_mun(jsonb),public.mun_save_draft(uuid,integer,text),public.mun_append(uuid,integer,integer,uuid,text,text,text),public.mun_command(uuid,integer,text,text,integer) from public,anon,authenticated;
grant execute on function public.mun_detail(uuid),public.create_mun(jsonb),public.mun_save_draft(uuid,integer,text),public.mun_append(uuid,integer,integer,uuid,text,text,text),public.mun_command(uuid,integer,text,text,integer) to authenticated;
