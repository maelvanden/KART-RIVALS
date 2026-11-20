-- Kart Rivals : réponse de l'exploitant aux avis des pilotes sur sa fiche.
--   - Une réponse par avis, publique : elle s'affiche sous l'avis, signée du circuit (« Réponse de SpeedPark »), pas
--     du compte qui l'a écrite. Elle disparaît avec l'avis, et se lit tant que l'avis est lisible (un avis masqué après
--     signalements masque aussi sa réponse).
--   - Écrite et modifiée par les admins du circuit et les admins appli (reply_to_review). L'auteur de l'avis est prévenu
--     à la première réponse, pas aux modifications.
--   - Retirée par ceux qui l'ont écrite, et par l'équipe Kart Rivals (admins appli et modérateurs) si elle est
--     inappropriée : dans ce cas, c'est tracé au journal.

create table public.track_review_replies (
  review_id  uuid primary key references public.track_reviews (id) on delete cascade,
  track_id   uuid not null references public.tracks (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null,
  body       text not null check (char_length(btrim(body)) between 3 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index track_review_replies_track_idx on public.track_review_replies (track_id, created_at desc);

alter table public.track_review_replies enable row level security;
revoke all on public.track_review_replies from anon, authenticated;
grant select on public.track_review_replies to authenticated;
-- Lisible quand l'avis l'est (la règle de track_reviews s'applique à la sous-requête).
create policy "replies readable with their review" on public.track_review_replies
  for select to authenticated using (exists (select 1 from public.track_reviews r where r.id = review_id));

create or replace function public.reply_to_review(p_review_id uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare
  rv track_reviews;
  v_body text := btrim(coalesce(p_body, ''));
  v_new boolean;
begin
  select * into rv from track_reviews where id = p_review_id;
  if rv.id is null or rv.hidden_at is not null then
    raise exception 'Review not found';
  end if;
  if auth.uid() is null or not public.is_track_manager(rv.track_id) then
    raise exception 'Only the track admins can edit this page';
  end if;
  if char_length(v_body) not between 3 and 500 then
    raise exception 'Reply must be 3 to 500 characters';
  end if;

  insert into track_review_replies (review_id, track_id, author_id, body)
  values (rv.id, rv.track_id, auth.uid(), v_body)
  on conflict (review_id) do update set body = excluded.body, author_id = auth.uid(), updated_at = now()
  returning (xmax = 0) into v_new;

  -- Le pilote est prévenu à la première réponse, pas quand l'exploitant corrige une faute.
  if v_new and rv.author_id <> auth.uid() then
    perform send_push(array[rv.author_id], '💬 ' || track_name(rv.track_id) || ' a répondu à ton avis',
      left(v_body, 120), '/track/' || rv.track_id);
  end if;
end $$;

create or replace function public.delete_review_reply(p_review_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  rp track_review_replies;
begin
  select * into rp from track_review_replies where review_id = p_review_id;
  if rp.review_id is null then
    raise exception 'Reply not found';
  end if;
  if auth.uid() is null or not (public.is_track_manager(rp.track_id) or public.is_app_staff()) then
    raise exception 'Only the track admins can edit this page';
  end if;
  delete from track_review_replies where review_id = rp.review_id;
  -- Retrait par l'équipe Kart Rivals : tracé au journal, avec un extrait de la réponse.
  if public.is_app_staff() then
    insert into admin_actions (action, profile_id, track_id, details)
    values ('delete_review_reply', rp.author_id, rp.track_id, jsonb_build_object('excerpt', left(rp.body, 80)));
  end if;
end $$;

revoke execute on function public.reply_to_review(uuid, text), public.delete_review_reply(uuid) from public, anon;
grant execute on function public.reply_to_review(uuid, text), public.delete_review_reply(uuid) to authenticated;
