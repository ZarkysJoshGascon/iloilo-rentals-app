// supabase/functions/_shared/brand.ts
// The logo every email shows: 380px, shown at 190px. It lives in the
// email-assets bucket, away from the site photos in hero-images that the CRM
// manages; the copy there was deleted once and every email lost its logo.
export const EMAIL_LOGO_URL =
  `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/email-assets/brand/iloilo-rentals-logo.png`
