-- Add print/invoice configuration columns to system_settings

ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS company_name        text DEFAULT 'Oshali Fuel',
  ADD COLUMN IF NOT EXISTS company_address     text DEFAULT 'Windhoek, Namibia',
  ADD COLUMN IF NOT EXISTS company_tel         text DEFAULT '',
  ADD COLUMN IF NOT EXISTS company_vat         text DEFAULT '',
  ADD COLUMN IF NOT EXISTS company_email       text DEFAULT '',
  ADD COLUMN IF NOT EXISTS invoice_footer_text text DEFAULT 'Thank you for your business! Goods once sold are not returnable. E&OE.',
  ADD COLUMN IF NOT EXISTS vat_percentage      numeric DEFAULT 15,
  ADD COLUMN IF NOT EXISTS vat_label           text DEFAULT 'Incl VAT (15%)',
  ADD COLUMN IF NOT EXISTS invoice_title       text DEFAULT 'INVOICE';
