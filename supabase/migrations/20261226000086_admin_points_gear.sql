-- Kart Rivals : points et boutique côté admin appli.
--   - admin_pilot_wallet : solde, journal de points et collection d'un pilote.
--   - admin_adjust_points : crédit (geste commercial, lot de tournoi…) ou retrait de points, toujours motivé. Un
--     retrait ne fait jamais passer le solde sous zéro.
--   - admin_grant_item / admin_revoke_item : offre un objet du catalogue, ou le retire (sans remboursement).
--   - admin_gear_catalog / admin_set_gear_price : catalogue avec le nombre de propriétaires, et prix des objets en
--     vente. Les visuels étant embarqués dans l'appli, on ne crée pas d'objet d'ici.
-- Chaque décision est tracée au journal et le pilote est prévenu.

-- Motif affiché dans le journal de points (ajustements admin).
alter table public.point_transactions add column if not exists note text check (char_length(note) <= 140);

create or replace function public.admin_pilot_wallet(p_profile uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  p profiles;
begin
  perform public.require_app_admin();
  select * into p from profiles where id = p_profile;
  if p.id is null then
    raise exception 'Pilot not found';
  end if;
  return jsonb_build_object(
    'id', p.id, 'username', p.username, 'points', p.points, 'rank', p.rank,
    'earned_30d', (select coalesce(sum(amount), 0) from point_transactions
                    where profile_id = p.id and amount > 0 and created_at > now() - interval '30 days'),
    'spent_30d', (select coalesce(-sum(amount), 0) from point_transactions
                   where profile_id = p.id and amount < 0 and created_at > now() - interval '30 days'),
    'transactions', coalesce((select jsonb_agg(x.t order by x.created_at desc, x.id desc) from (
                        select t.created_at, t.id,
                               jsonb_build_object('id', t.id, 'amount', t.amount, 'reason', t.reason, 'note', t.note,
                                                  'item', g.name, 'created_at', t.created_at) as t
                          from point_transactions t
                          left join gear_items g on g.id = t.item_id
                         where t.profile_id = p.id
                         order by t.created_at desc, t.id desc
                         limit 60) x), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
                         'id', g.id, 'name', g.name, 'slot', g.slot, 'rarity', g.rarity, 'price', g.price,
                         'acquired_at', i.acquired_at,
                         'worn', exists (select 1 from user_gear w where w.profile_id = p.id and w.item_id = g.id))
                         order by i.acquired_at desc)
                         from user_items i join gear_items g on g.id = i.item_id
                        where i.profile_id = p.id), '[]'::jsonb));
end $$;

-- p_amount > 0 : crédit ; < 0 : retrait (plafonné au solde). Renvoie le nouveau solde.
create or replace function public.admin_adjust_points(p_profile uuid, p_amount int, p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare
  p profiles;
  v_amount int;
  v_reason text := left(btrim(coalesce(p_reason, '')), 140);
begin
  perform public.require_app_admin();
  select * into p from profiles where id = p_profile for update;
  if p.id is null then
    raise exception 'Pilot not found';
  end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 5000 then
    raise exception 'Invalid points amount';
  end if;
  if char_length(v_reason) < 3 then
    raise exception 'A reason is required';
  end if;
  v_amount := greatest(p_amount, -p.points);
  if v_amount = 0 then
    raise exception 'Pilot has no points to remove';
  end if;

  insert into point_transactions (profile_id, amount, reason, note) values (p.id, v_amount, 'admin_adjustment', v_reason);
  insert into admin_actions (action, profile_id, details)
  values ('adjust_points', p.id,
          jsonb_build_object('amount', v_amount, 'before', p.points, 'after', p.points + v_amount, 'reason', v_reason));
  perform send_push(array[p.id],
    case when v_amount > 0 then '🎁 +' || v_amount || ' points' else v_amount || ' points' end,
    case when v_amount > 0 then 'L’équipe Kart Rivals t’offre ' || v_amount || ' points : '
         else 'L’équipe Kart Rivals a retiré ' || -v_amount || ' points de ton solde : ' end || v_reason,
    '/shop');
  return p.points + v_amount;
end $$;

create or replace function public.admin_grant_item(p_profile uuid, p_item_id text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_item gear_items;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 140), '');
begin
  perform public.require_app_admin();
  if not exists (select 1 from profiles where id = p_profile) then
    raise exception 'Pilot not found';
  end if;
  select * into v_item from gear_items where id = p_item_id;
  if v_item.id is null then
    raise exception 'ITEM_NOT_FOUND';
  end if;
  if v_item.rarity = 'starter' then
    raise exception 'ALREADY_OWNED';
  end if;
  insert into user_items (profile_id, item_id) values (p_profile, v_item.id) on conflict do nothing;
  if not found then
    raise exception 'ALREADY_OWNED';
  end if;

  insert into admin_actions (action, profile_id, details)
  values ('grant_item', p_profile, jsonb_build_object('item_id', v_item.id, 'item', v_item.name, 'reason', v_reason));
  perform send_push(array[p_profile], '🎁 Nouvel objet dans ton garage',
    'L’équipe Kart Rivals t’offre « ' || v_item.name || ' »' || coalesce(' : ' || v_reason, '.'), '/shop');
end $$;

create or replace function public.admin_revoke_item(p_profile uuid, p_item_id text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_item gear_items;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 140), '');
begin
  perform public.require_app_admin();
  select * into v_item from gear_items where id = p_item_id;
  if v_item.id is null then
    raise exception 'ITEM_NOT_FOUND';
  end if;
  -- Porté : le pilote repasse à l'équipement de location pour cet emplacement.
  delete from user_gear where profile_id = p_profile and item_id = v_item.id;
  delete from user_items where profile_id = p_profile and item_id = v_item.id;
  if not found then
    raise exception 'NOT_OWNED';
  end if;

  insert into admin_actions (action, profile_id, details)
  values ('revoke_item', p_profile, jsonb_build_object('item_id', v_item.id, 'item', v_item.name, 'reason', v_reason));
  perform send_push(array[p_profile], 'Objet retiré de ton garage',
    'L’équipe Kart Rivals a retiré « ' || v_item.name || ' »' || coalesce(' : ' || v_reason, '.'), '/shop');
end $$;

create or replace function public.admin_gear_catalog()
returns table (id text, slot public.gear_slot, name text, rarity public.gear_rarity, price int,
               unlock_rank public.rank_tier, sort smallint, owners int, bought_30d int)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_app_admin();
  return query
    select g.id, g.slot, g.name, g.rarity, g.price, g.unlock_rank, g.sort,
           (select count(*)::int from user_items i where i.item_id = g.id),
           (select count(*)::int from point_transactions t
             where t.item_id = g.id and t.reason = 'purchase' and t.created_at > now() - interval '30 days')
      from gear_items g
     order by g.sort, g.id;
end $$;

-- Prix d'un objet en vente. Les objets de location et les récompenses de rang (gratuites) ne changent pas de prix.
create or replace function public.admin_set_gear_price(p_item_id text, p_price int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_item gear_items;
begin
  perform public.require_app_admin();
  select * into v_item from gear_items where id = p_item_id for update;
  if v_item.id is null then
    raise exception 'ITEM_NOT_FOUND';
  end if;
  if v_item.price = 0 then
    raise exception 'This item is not for sale';
  end if;
  if p_price is null or p_price < 1 or p_price > 100000 then
    raise exception 'Invalid price';
  end if;
  if p_price = v_item.price then
    return;
  end if;
  update gear_items set price = p_price where id = v_item.id;
  insert into admin_actions (action, details)
  values ('set_gear_price', jsonb_build_object('item_id', v_item.id, 'item', v_item.name,
                                               'before', v_item.price, 'after', p_price));
end $$;

revoke execute on function public.admin_pilot_wallet(uuid), public.admin_adjust_points(uuid, int, text),
  public.admin_grant_item(uuid, text, text), public.admin_revoke_item(uuid, text, text),
  public.admin_gear_catalog(), public.admin_set_gear_price(text, int) from public, anon;
grant execute on function public.admin_pilot_wallet(uuid), public.admin_adjust_points(uuid, int, text),
  public.admin_grant_item(uuid, text, text), public.admin_revoke_item(uuid, text, text),
  public.admin_gear_catalog(), public.admin_set_gear_price(text, int) to authenticated;
