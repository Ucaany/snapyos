-- Rollback 0091. Tidak menyentuh data credential yang sudah ada.
drop trigger if exists trg_payment_credentials_active_limit on payment_credentials;
drop function if exists enforce_active_payment_credential_limit();
drop table if exists password_reset_tokens;
drop table if exists staff_invitations;
