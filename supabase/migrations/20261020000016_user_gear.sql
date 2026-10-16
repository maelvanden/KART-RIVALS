-- Kart Rivals : « Garage virtuel » + boutique à points.
-- Les pilotes gagnent des points en roulant (défis, courses, Time Attack) et les dépensent dans la boutique
-- pour des équipements virtuels (casque, combinaison, gants, bottines, protège-côtes). Certains objets ne
-- s'achètent pas : ils se gagnent en atteignant un rang. Objets fictifs : aucune marque ni logo réels.
--
-- Principe de sécurité : le solde, la collection et l'équipement ne sont modifiables que par les
-- fonctions ci-dessous (security definer) ; le client n'a qu'un accès en lecture.

-- ========== ENUMS ==========
create type public.gear_slot as enum ('helmet', 'suit', 'gloves', 'shoes', 'rib_protector');
create type public.gear_rarity as enum ('starter', 'common', 'rare', 'epic', 'legendary');
create type public.point_reason as enum ('welcome', 'match', 'race', 'time_attack', 'purchase');

-- ========== SOLDE ==========
alter table public.profiles add column points int not null default 0 check (points >= 0);
grant select (points) on public.profiles to authenticated;

-- Journal de tous les mouvements de points ; le solde de profiles.points en est la somme.
create table public.point_transactions (
  id             bigint generated always as identity primary key,
  profile_id     uuid not null references public.profiles (id) on delete cascade,
  amount         int not null check (amount <> 0),
  reason         public.point_reason not null,
  elo_history_id bigint unique references public.elo_history (id) on delete set null,
  time_attack_id uuid unique references public.time_attack_sessions (id) on delete set null,
  item_id        text,
  created_at     timestamptz not null default now()
);
create index point_transactions_profile_idx on public.point_transactions (profile_id, created_at desc);
-- Un seul bonus de bienvenue par pilote.
create unique index point_transactions_welcome_key on public.point_transactions (profile_id) where reason = 'welcome';

create or replace function public.apply_point_transaction()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update profiles set points = points + new.amount where id = new.profile_id;
  return new;
end $$;

create trigger point_transactions_apply after insert on public.point_transactions
  for each row execute function public.apply_point_transaction();

-- ========== BARÈME ==========
-- Bienvenue : 200 pts. Défi ou course validé : 20 pts, +30 en cas de gain d'ELO (victoire).
-- Time Attack validé : 30 pts. Abandon (DNF) : rien.
create or replace function public.award_welcome_points()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into point_transactions (profile_id, amount, reason) values (new.id, 200, 'welcome');
  return new;
end $$;

create trigger profiles_welcome_points after insert on public.profiles
  for each row execute function public.award_welcome_points();

create or replace function public.award_result_points()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.match_id is null and new.race_id is null then
    return new; -- Time Attack : seul l'abandon passe par elo_history.
  end if;
  insert into point_transactions (profile_id, amount, reason, elo_history_id)
  values (new.profile_id,
          20 + case when new.delta > 0 then 30 else 0 end,
          case when new.match_id is not null then 'match' else 'race' end::public.point_reason,
          new.id);
  return new;
end $$;

create trigger elo_history_award_points after insert on public.elo_history
  for each row execute function public.award_result_points();

create or replace function public.award_time_attack_points()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into point_transactions (profile_id, amount, reason, time_attack_id)
  values (new.pilot_id, 30, 'time_attack', new.id)
  on conflict (time_attack_id) do nothing;
  return new;
end $$;

create trigger time_attack_award_points after update of status on public.time_attack_sessions
  for each row when (new.status = 'validated' and old.status is distinct from 'validated')
  execute function public.award_time_attack_points();

-- Rattrapage : bonus de bienvenue et points de tout l'historique déjà validé.
insert into public.point_transactions (profile_id, amount, reason)
  select id, 200, 'welcome' from public.profiles;
insert into public.point_transactions (profile_id, amount, reason, elo_history_id)
  select profile_id, 20 + case when delta > 0 then 30 else 0 end,
         case when match_id is not null then 'match' else 'race' end::public.point_reason, id
  from public.elo_history
  where match_id is not null or race_id is not null;
insert into public.point_transactions (profile_id, amount, reason, time_attack_id)
  select pilot_id, 30, 'time_attack', id from public.time_attack_sessions where status = 'validated';

-- ========== CATALOGUE ==========
-- Le visuel de chaque objet est embarqué dans l'app (assets/gear/<id>.svg) ; la base fait foi pour les prix.
create table public.gear_items (
  id          text primary key check (id ~ '^[a-z0-9-]+$'),
  slot        public.gear_slot not null,
  name        text not null,
  rarity      public.gear_rarity not null,
  -- Prix en points (0 pour l'équipement de location et les récompenses de rang).
  price       int not null default 0 check (price >= 0),
  -- Rang requis : récompense à débloquer (gratuite) si price = 0, sinon simple condition d'achat.
  unlock_rank public.rank_tier,
  sort        smallint not null default 0,
  unique (id, slot),
  -- L'équipement de location est offert à tous, sans condition.
  check (rarity <> 'starter' or (price = 0 and unlock_rank is null)),
  -- Tout objet hors location s'achète ou se gagne.
  check (rarity = 'starter' or price > 0 or unlock_rank is not null)
);
-- Exactement un équipement de location par slot.
create unique index gear_items_one_starter_per_slot on public.gear_items (slot) where rarity = 'starter';

insert into public.gear_items (id, slot, name, rarity, price, unlock_rank, sort) values
  ('helmet-rental',  'helmet', 'Casque de location',      'starter',   0,    null,      0),
  ('helmet-street',  'helmet', 'Casque Street',           'common',    150,  null,      1),
  ('helmet-neon',    'helmet', 'Casque Néon Rush',        'rare',      400,  null,      2),
  ('helmet-thunder', 'helmet', 'Casque Thunder',          'rare',      0,    'argent',  3),
  ('helmet-inferno', 'helmet', 'Casque Inferno',          'epic',      900,  null,      4),
  ('helmet-crown',   'helmet', 'Casque Couronne d''Or',   'legendary', 0,    'or',      5),

  ('suit-rental',    'suit', 'Combinaison de location',   'starter',   0,    null,      0),
  ('suit-classic',   'suit', 'Combinaison Classic',       'common',    150,  null,      1),
  ('suit-neon',      'suit', 'Combinaison Néon Rush',     'rare',      450,  null,      2),
  ('suit-thunder',   'suit', 'Combinaison Thunder',       'rare',      0,    'argent',  3),
  ('suit-carbon',    'suit', 'Combinaison Carbone',       'epic',      1000, null,      4),
  ('suit-champion',  'suit', 'Combinaison Champion',      'legendary', 0,    'platine', 5),

  ('gloves-rental',  'gloves', 'Gants de location',       'starter',   0,    null,      0),
  ('gloves-grip',    'gloves', 'Gants Grip',              'common',    100,  null,      1),
  ('gloves-neon',    'gloves', 'Gants Néon Rush',         'rare',      300,  null,      2),
  ('gloves-inferno', 'gloves', 'Gants Inferno',           'epic',      700,  null,      3),
  ('gloves-gold',    'gloves', 'Gants Or Pur',            'legendary', 0,    'or',      4),

  ('shoes-rental',   'shoes', 'Bottines de location',     'starter',   0,    null,      0),
  ('shoes-sprint',   'shoes', 'Bottines Sprint',          'common',    100,  null,      1),
  ('shoes-neon',     'shoes', 'Bottines Néon Rush',       'rare',      300,  null,      2),
  ('shoes-thunder',  'shoes', 'Bottines Thunder',         'rare',      0,    'argent',  3),
  ('shoes-carbon',   'shoes', 'Bottines Carbone',         'epic',      700,  null,      4),

  ('rib-rental',     'rib_protector', 'Protège-côtes de location', 'starter',   0,   null,      0),
  ('rib-shield',     'rib_protector', 'Protège-côtes Shield',      'common',    120, null,      1),
  ('rib-neon',       'rib_protector', 'Protège-côtes Néon',        'rare',      350, null,      2),
  ('rib-titan',      'rib_protector', 'Protège-côtes Titan',       'epic',      800, null,      3),
  ('rib-legend',     'rib_protector', 'Protège-côtes Légende',     'legendary', 0,   'diamant', 4);

-- ========== COLLECTION & ÉQUIPEMENT ==========
-- Objets possédés (l'équipement de location n'y figure pas : tout le monde l'a).
create table public.user_items (
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  item_id     text not null references public.gear_items (id),
  acquired_at timestamptz not null default now(),
  primary key (profile_id, item_id)
);

-- Objet porté dans chaque slot ; pas de ligne = équipement de location.
create table public.user_gear (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  slot       public.gear_slot not null,
  item_id    text not null,
  updated_at timestamptz not null default now(),
  primary key (profile_id, slot),
  -- L'objet appartient bien à ce slot…
  foreign key (item_id, slot) references public.gear_items (id, slot),
  -- … et au pilote.
  foreign key (profile_id, item_id) references public.user_items (profile_id, item_id) on delete cascade
);

-- ========== FONCTIONS ==========
-- Achète un objet (ou récupère une récompense de rang) ; l'équipe aussitôt. Renvoie le nouveau solde.
create or replace function public.buy_gear_item(p_item_id text)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_item gear_items;
  v_profile profiles;
begin
  select * into v_profile from profiles where id = auth.uid() for update;
  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;
  select * into v_item from gear_items where id = p_item_id;
  if not found then
    raise exception 'ITEM_NOT_FOUND';
  end if;
  if v_item.rarity = 'starter'
     or exists (select 1 from user_items where profile_id = v_profile.id and item_id = v_item.id) then
    raise exception 'ALREADY_OWNED';
  end if;
  if v_item.unlock_rank is not null and v_profile.rank < v_item.unlock_rank then
    raise exception 'RANK_REQUIRED';
  end if;
  if v_profile.points < v_item.price then
    raise exception 'NOT_ENOUGH_POINTS';
  end if;

  insert into user_items (profile_id, item_id) values (v_profile.id, v_item.id);
  if v_item.price > 0 then
    insert into point_transactions (profile_id, amount, reason, item_id)
    values (v_profile.id, -v_item.price, 'purchase', v_item.id);
  end if;
  insert into user_gear (profile_id, slot, item_id) values (v_profile.id, v_item.slot, v_item.id)
  on conflict (profile_id, slot) do update set item_id = excluded.item_id, updated_at = now();

  return v_profile.points - v_item.price;
end $$;

-- Porte un objet de sa collection (ou repasse en location avec l'objet « starter » du slot).
create or replace function public.equip_gear_item(p_item_id text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_item gear_items;
begin
  select * into v_item from gear_items where id = p_item_id;
  if not found then
    raise exception 'ITEM_NOT_FOUND';
  end if;
  if v_item.rarity = 'starter' then
    delete from user_gear where profile_id = auth.uid() and slot = v_item.slot;
    return;
  end if;
  if not exists (select 1 from user_items where profile_id = auth.uid() and item_id = v_item.id) then
    raise exception 'NOT_OWNED';
  end if;
  insert into user_gear (profile_id, slot, item_id) values (auth.uid(), v_item.slot, v_item.id)
  on conflict (profile_id, slot) do update set item_id = excluded.item_id, updated_at = now();
end $$;

-- ========== SÉCURITÉ ==========
alter table public.point_transactions enable row level security;
alter table public.gear_items enable row level security;
alter table public.user_items enable row level security;
alter table public.user_gear enable row level security;

revoke all on public.point_transactions, public.gear_items, public.user_items, public.user_gear from anon, authenticated;
grant select on public.point_transactions, public.gear_items, public.user_items, public.user_gear to authenticated;

create policy "pilots read their own point history" on public.point_transactions
  for select to authenticated using (profile_id = auth.uid());
create policy "catalog readable by signed-in users" on public.gear_items
  for select to authenticated using (true);
-- Collections et équipements visibles sur les profils des autres pilotes.
create policy "collections readable by signed-in users" on public.user_items
  for select to authenticated using (true);
create policy "gear readable by signed-in users" on public.user_gear
  for select to authenticated using (true);

revoke execute on function
  public.buy_gear_item(text), public.equip_gear_item(text),
  public.apply_point_transaction(), public.award_welcome_points(), public.award_result_points(),
  public.award_time_attack_points()
from public, anon;
grant execute on function public.buy_gear_item(text), public.equip_gear_item(text) to authenticated;
