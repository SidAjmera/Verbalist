-- Voice preferences contain no credentials, audio or session consent.
alter table public.user_preferences drop constraint user_preferences_input_mode_check;
alter table public.user_preferences drop constraint user_preferences_output_mode_check;
alter table public.user_preferences add constraint user_preferences_input_mode_check check(input_mode in ('text','voice'));
alter table public.user_preferences add constraint user_preferences_output_mode_check check(output_mode in ('text','voice','both'));
alter table public.user_preferences add column speech_language text not null default 'en-US' check(speech_language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$');
alter table public.user_preferences add column speech_rate numeric not null default 1 check(speech_rate between 0.75 and 1.5);
alter table public.user_preferences add column speech_voice text not null default '' check(char_length(speech_voice)<=200);
alter table public.user_preferences alter column theme set default 'dark';
update public.user_preferences set theme='dark',version=version+1 where theme='system';

alter table public.debate_sessions add column timed boolean not null default false;
alter table public.debate_sessions add column clock_phase text not null default 'idle' check(clock_phase in ('idle','preparation','ready','speaking','expired'));
alter table public.debate_sessions add column clock_remaining_ms integer not null default 0 check(clock_remaining_ms between 0 and 900000);
alter table public.debate_sessions add column clock_started_at timestamptz;

create function private.manage_debate_clock() returns trigger
language plpgsql set search_path='' as $$
declare v_human boolean; v_remaining integer;
begin
  v_human := (new.turn_count%2=0)=(new.side='proposition');
  if not new.timed then new.clock_phase:='idle';new.clock_remaining_ms:=0;new.clock_started_at:=null;return new;end if;
  if TG_OP='INSERT' or new.turn_count<>old.turn_count then
    if TG_OP='UPDATE' and not ((old.turn_count%2=0)=(old.side='proposition')) then null;
    elsif TG_OP='UPDATE' and old.clock_phase not in ('speaking','expired') then
      raise sqlstate 'PT422' using message='Start the speaking clock before submitting';
    end if;
    if new.status='completed' or not v_human then
      new.clock_phase:='idle';new.clock_remaining_ms:=0;new.clock_started_at:=null;
    elsif new.preparation_seconds>0 then
      new.clock_phase:='preparation';new.clock_remaining_ms:=new.preparation_seconds*1000;new.clock_started_at:=clock_timestamp();
    else new.clock_phase:='ready';new.clock_remaining_ms:=new.speaking_seconds*1000;new.clock_started_at:=null;
    end if;
  elsif new.status='completed' then
    new.clock_phase:='idle';new.clock_remaining_ms:=0;new.clock_started_at:=null;
  elsif old.status='active' and new.status='paused' then
    v_remaining:=greatest(0,old.clock_remaining_ms-case when old.clock_started_at is null then 0 else floor(extract(epoch from (clock_timestamp()-old.clock_started_at))*1000)::integer end);
    new.clock_remaining_ms:=v_remaining;new.clock_started_at:=null;
    if v_remaining=0 and old.clock_phase='preparation' then new.clock_phase:='ready';new.clock_remaining_ms:=new.speaking_seconds*1000;
    elsif v_remaining=0 and old.clock_phase='speaking' then new.clock_phase:='expired';end if;
  elsif old.status='paused' and new.status='active' and new.clock_phase in ('preparation','speaking') then
    new.clock_started_at:=clock_timestamp();
  end if;
  return new;
end;
$$;
revoke all on function private.manage_debate_clock() from public,anon,authenticated;
create trigger verbalist_debate_clock before insert or update on public.debate_sessions for each row execute function private.manage_debate_clock();

create or replace function public.create_debate(p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_row public.debate_sessions;
begin
  perform public.consume_budget('create');
  insert into public.debate_sessions(owner_id,motion,side,difficulty,persona,preparation_seconds,speaking_seconds,timed)
  values(auth.uid(),btrim(p_data->>'motion'),p_data->>'side',p_data->>'difficulty',p_data->>'persona',(p_data->>'preparation_seconds')::integer,(p_data->>'speaking_seconds')::integer,coalesce((p_data->>'timed')::boolean,false)) returning * into v_row;
  insert into public.debate_participants(session_id,owner_id,kind,side) values
  (v_row.id,v_row.owner_id,'human',v_row.side),(v_row.id,v_row.owner_id,'ai',case when v_row.side='proposition' then 'opposition' else 'proposition' end);
  return to_jsonb(v_row);
end;
$$;

create function public.start_speaking(p_session uuid,p_expected integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_row public.debate_sessions;
begin
  perform public.consume_budget('write');
  select * into v_row from public.debate_sessions where id=p_session and owner_id=auth.uid() for update;
  if not found then raise sqlstate 'PT404' using message='Not found';end if;
  if v_row.version<>p_expected then raise sqlstate 'PT409' using message='Debate changed';end if;
  if not v_row.timed or v_row.status<>'active' or not ((v_row.turn_count%2=0)=(v_row.side='proposition')) or v_row.clock_phase not in ('preparation','ready') then
    raise sqlstate 'PT422' using message='Cannot start this speaking clock';end if;
  update public.debate_sessions set clock_phase='speaking',clock_remaining_ms=speaking_seconds*1000,clock_started_at=clock_timestamp(),version=version+1,updated_at=now() where id=p_session returning * into v_row;
  return to_jsonb(v_row);
end;
$$;
revoke all on function public.start_speaking(uuid,integer) from public,anon,authenticated;
grant execute on function public.start_speaking(uuid,integer) to authenticated;

create or replace function public.update_account(p_kind text,p_version integer,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform public.consume_budget('write');
  if p_kind='profile' then
    update public.profiles set display_name=p_data->>'display_name',username=nullif(p_data->>'username',''),avatar_url=nullif(p_data->>'avatar_url',''),version=version+1,updated_at=now()
    where id=auth.uid() and version=p_version returning to_jsonb(profiles.*) into v_result;
  elsif p_kind='preferences' then
    update public.user_preferences set theme=p_data->>'theme',provider=p_data->>'provider',model=p_data->>'model',difficulty=p_data->>'difficulty',
    input_mode=coalesce(p_data->>'input_mode','text'),output_mode=coalesce(p_data->>'output_mode','text'),
    speech_language=coalesce(p_data->>'speech_language',speech_language),speech_rate=coalesce((p_data->>'speech_rate')::numeric,speech_rate),speech_voice=coalesce(p_data->>'speech_voice',speech_voice),version=version+1,updated_at=now()
    where user_id=auth.uid() and version=p_version returning to_jsonb(user_preferences.*) into v_result;
  else raise sqlstate 'PT422' using message='Invalid account operation';end if;
  if v_result is null then raise sqlstate 'PT409' using message='Account record changed';end if;
  return v_result;
end;
$$;
