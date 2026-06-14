-- Настройка pgcrypto для хеширования паролей в users
create extension if not exists "pgcrypto";

-- Функция для проверки пользователя с использованием crypt
create or replace function public.match_user_by_login_password(p_login text, p_password text)
returns table (
  id uuid,
  full_name text,
  role app_role,
  avatar_url text
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select u.id, u.full_name, u.role, u.avatar_url
  from public.users u
  where lower(trim(u.login)) = lower(trim(p_login))
    and u.password = crypt(p_password, u.password)
  limit 1;
$$;

-- Функция для обновления пароля сотрудника
create or replace function public.update_user_password(p_user_id uuid, p_new_password text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  update public.users
  set password = crypt(p_new_password, gen_salt('bf', 8))
  where id = p_user_id;
$$;

revoke all on function public.update_user_password(uuid, text) from public;
grant execute on function public.update_user_password(uuid, text) to service_role;

-- Хешируем текущие пароли (если они еще не захешированы)
update public.users
set password = crypt(password, gen_salt('bf', 8))
where password not like '$2a$%' and password not like '$2b$%';
