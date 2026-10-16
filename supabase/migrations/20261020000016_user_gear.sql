-- Kart Rivals : « Garage virtuel » — l'équipement personnel de chaque pilote.
-- Une ligne par pilote, une colonne par catégorie. Les marques sont des enums (texte brut, aucun logo) ;
-- null = pas d'équipement personnel (« Équipement de location » dans l'app).

-- ========== ENUMS ==========
create type public.helmet_brand as enum ('arai', 'bell', 'shoei', 'stilo', 'zamp', 'ls2', 'omp', 'sparco', 'autre');
-- Combinaisons, gants et bottines partagent la même liste.
create type public.apparel_brand as enum ('sparco', 'alpinestars', 'omp', 'freem', 'sabelt', 'puma', 'autre');
create type public.rib_protector_brand as enum ('bengio', 'tillett', 'sodi', 'omp', 'sparco', 'autre');

-- ========== USER_GEAR ==========
create table public.user_gear (
  profile_id    uuid primary key references public.profiles (id) on delete cascade,
  helmet        public.helmet_brand,
  suit          public.apparel_brand,
  gloves        public.apparel_brand,
  shoes         public.apparel_brand,
  rib_protector public.rib_protector_brand,
  updated_at    timestamptz not null default now()
);

create or replace function public.touch_user_gear()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger user_gear_touch before update on public.user_gear
  for each row execute function public.touch_user_gear();

-- ========== SÉCURITÉ ==========
-- Lisible par tous les pilotes connectés (affiché sur les profils) ; chacun ne modifie que son garage.
alter table public.user_gear enable row level security;
revoke all on public.user_gear from anon, authenticated;

grant select on public.user_gear to authenticated;
grant insert (profile_id, helmet, suit, gloves, shoes, rib_protector) on public.user_gear to authenticated;
-- profile_id figure dans l'update pour les upserts ; la policy interdit d'y mettre un autre id que le sien.
grant update (profile_id, helmet, suit, gloves, shoes, rib_protector) on public.user_gear to authenticated;

create policy "gear readable by signed-in users" on public.user_gear
  for select to authenticated using (true);
create policy "pilots create their own gear" on public.user_gear
  for insert to authenticated with check (profile_id = auth.uid());
create policy "pilots update their own gear" on public.user_gear
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
