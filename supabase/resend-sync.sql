-- ============================================================
-- Cosa manca — iscrizione al segmento Resend "Cosa-manca" (facoltativa)
-- Esegui DOPO schema.sql. Chi spunta "Voglio ricevere aggiornamenti
-- sull'app" viene aggiunto al segmento; chi toglie la spunta, rimosso.
-- ============================================================

-- 1) Estensione per le chiamate HTTP dal database (di solito è già attiva).
create extension if not exists pg_net with schema extensions;

-- 2) Segreti nel Vault di Supabase (restano nel database, non finiscono nel repository).
--    Sostituisci i valori ed esegui queste due righe UNA volta sola:
--
--    select vault.create_secret('re_LA_TUA_CHIAVE_A_PIENO_ACCESSO', 'resend_api_key');
--    select vault.create_secret('ID-DEL-SEGMENTO-COSA-MANCA', 'resend_segment_cosa_manca');
--
--    La chiave Resend deve avere il permesso "Full access": la chiave "Sending access"
--    non può creare contatti né modificare i segmenti. Non usare mai questa chiave nel frontend.

-- 3) Funzione di sincronizzazione.
create or replace function public.sync_resend_contact() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  api_key text;
  seg text;
  hdr jsonb;
  mail_path text;
begin
  -- Agisce solo alla creazione del profilo o quando cambia la scelta.
  if tg_op = 'UPDATE' and new.marketing_opt_in is not distinct from old.marketing_opt_in then
    return new;
  end if;

  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'resend_api_key';
  select decrypted_secret into seg from vault.decrypted_secrets where name = 'resend_segment_cosa_manca';
  if api_key is null or seg is null then
    return new; -- non configurato: nessun effetto
  end if;

  hdr := jsonb_build_object('Authorization', 'Bearer ' || api_key, 'Content-Type', 'application/json');
  mail_path := replace(new.email, '+', '%2B');

  if new.marketing_opt_in then
    -- Contatto nuovo: lo crea già dentro il segmento.
    perform net.http_post(
      url := 'https://api.resend.com/contacts',
      headers := hdr,
      body := jsonb_build_object(
        'email', new.email,
        'first_name', new.display_name,
        'unsubscribed', false,
        'segments', jsonb_build_array(jsonb_build_object('id', seg))
      )
    );
    -- Contatto già presente in Resend (es. iscritto ad altri segmenti): lo aggiunge al segmento.
    -- Le due chiamate sono indipendenti: quella che non serve fallisce senza danni.
    perform net.http_post(
      url := 'https://api.resend.com/contacts/' || mail_path || '/segments/' || seg,
      headers := hdr,
      body := '{}'::jsonb
    );
  elsif tg_op = 'UPDATE' and old.marketing_opt_in then
    -- Toglie solo dal segmento Cosa-manca; il contatto resta negli altri segmenti.
    perform net.http_delete(
      url := 'https://api.resend.com/contacts/' || mail_path || '/segments/' || seg,
      headers := hdr
    );
  end if;

  return new;
end $$;

revoke all on function public.sync_resend_contact() from public, anon, authenticated;

drop trigger if exists profiles_resend_sync on public.profiles;
create trigger profiles_resend_sync
  after insert or update of marketing_opt_in on public.profiles
  for each row execute function public.sync_resend_contact();

-- Per controllare l'esito delle chiamate (ultime 20):
--   select id, status_code, left(content, 200) from net._http_response order by id desc limit 20;
