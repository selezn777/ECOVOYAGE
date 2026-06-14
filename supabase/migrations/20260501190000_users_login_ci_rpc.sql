-- Регистронезависимое сравнение логина без ILIKE/LIKE (где _ и % — маски).
-- Используется API входа и проверки занятости логина в профиле.

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
set search_path = public
as $$
  select u.id, u.full_name, u.role, u.avatar_url
  from public.users u
  where lower(trim(u.login)) = lower(trim(p_login))
    and u.password = p_password
  limit 1;
$$;

comment on function public.match_user_by_login_password(text, text) is
  'Вход: одна строка пользователя по логину (без учёта регистра) и паролю.';

create or replace function public.users_login_taken_by_other(p_login text, p_exclude_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id is distinct from p_exclude_id
      and lower(trim(u.login)) = lower(trim(p_login))
  );
$$;

comment on function public.users_login_taken_by_other(text, uuid) is
  'true, если логин уже занят другим пользователем (регистр не важен).';

revoke all on function public.match_user_by_login_password(text, text) from public;
revoke all on function public.users_login_taken_by_other(text, uuid) from public;

grant execute on function public.match_user_by_login_password(text, text) to service_role;
grant execute on function public.users_login_taken_by_other(text, uuid) to service_role;
