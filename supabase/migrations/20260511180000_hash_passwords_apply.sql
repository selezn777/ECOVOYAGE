-- Хешируем все plain-text пароли и создаём триггер автохеширования
-- (Предыдущая миграция была помечена applied но не выполнялась из-за pgbouncer)

create extension if not exists "pgcrypto";

-- Обновляем функцию логина с правильным search_path
create or replace function public.match_user_by_login_password(p_login text, p_password text)
returns table (id uuid, full_name text, role app_role, avatar_url text)
language plpgsql stable security definer
set search_path = public, extensions
as $$
begin
  return query
    select u.id, u.full_name, u.role, u.avatar_url
    from public.users u
    where lower(trim(u.login)) = lower(trim(p_login))
      and u.password = extensions.crypt(p_password, u.password)
    limit 1;
end;
$$;

-- Функция обновления пароля
create or replace function public.update_user_password(p_user_id uuid, p_new_password text)
returns void language plpgsql security definer
set search_path = public, extensions
as $$
begin
  update public.users
  set password = extensions.crypt(p_new_password, extensions.gen_salt('bf', 8))
  where id = p_user_id;
end;
$$;

revoke all on function public.update_user_password(uuid, text) from public;
grant execute on function public.update_user_password(uuid, text) to service_role;

-- Триггер автохеширования при INSERT/UPDATE
create or replace function public.hash_user_password()
returns trigger language plpgsql security definer
set search_path = public, extensions
as $$
begin
  if (TG_OP = 'INSERT') or (NEW.password is distinct from OLD.password) then
    if NEW.password not like '$2a$%' and NEW.password not like '$2b$%' then
      NEW.password := extensions.crypt(NEW.password, extensions.gen_salt('bf', 8));
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists hash_password_on_upsert on public.users;
create trigger hash_password_on_upsert
  before insert or update on public.users
  for each row execute function public.hash_user_password();

-- Хешируем все текущие plain-text пароли
update public.users
set password = extensions.crypt(password, extensions.gen_salt('bf', 8))
where password not like '$2a$%' and password not like '$2b$%';
