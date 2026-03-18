-- Role-based access control for admin endpoints.

create table if not exists user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'admin', 'super_admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_roles_role on user_roles(role);

create or replace function set_user_roles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_roles_updated_at on user_roles;
create trigger trg_user_roles_updated_at
before update on user_roles
for each row execute function set_user_roles_updated_at();

alter table user_roles enable row level security;

drop policy if exists "users read own role" on user_roles;
create policy "users read own role"
on user_roles for select
using (auth.uid() = user_id);
