-- Link your auth user as the owner of a demo school so you can test the portal.
update schools set auth_user_id = (select id from auth.users where email = 'senseibradlemley@gmail.com')
where slug = 'demo-dojo-1';
select name, slug, (auth_user_id is not null) as linked from schools where slug = 'demo-dojo-1';
