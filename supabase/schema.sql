-- ============================================================
-- nishTees — Supabase schema
-- Run this in Supabase Studio -> SQL Editor -> New query.
--
-- Money is stored in PAISE (integers) everywhere. Never floats.
-- Prices are GST-INCLUSIVE (what the customer sees and pays).
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. Catalogue
-- ------------------------------------------------------------

create table if not exists products (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  description text,
  -- GST-inclusive selling price, in paise. 999.00 -> 99900
  price_paise integer not null check (price_paise > 0),
  hsn_code    text not null default '6109',        -- knitted t-shirts
  gst_rate    numeric(4,2) not null default 5.00,  -- 5% up to Rs 2,500/piece
  gsm         integer,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists variants (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  sku        text unique not null,                  -- NT-SN-BLK-M
  size       text not null,                         -- S / M / L / XL / XXL
  stock      integer not null default 0 check (stock >= 0),
  weight_g   integer not null default 400,          -- for Shiprocket
  created_at timestamptz not null default now(),
  unique (product_id, size)
);

create index if not exists variants_product_idx on variants(product_id);

-- ------------------------------------------------------------
-- 2. Orders
-- ------------------------------------------------------------

-- Human-readable order numbers: NT-1001, NT-1002, ...
create sequence if not exists order_number_seq start 1001;

create type order_status as enum (
  'awaiting_payment',   -- prepaid, Razorpay order created, not yet paid
  'payment_failed',
  'cod_unconfirmed',    -- COD placed, not yet confirmed by phone
  'confirmed',          -- paid, or COD confirmed. Ready to pack.
  'shipped',
  'delivered',
  'cancelled',
  'returned',
  'refunded'
);

create type payment_method as enum ('prepaid', 'cod');

create table if not exists orders (
  id                  uuid primary key default gen_random_uuid(),
  order_number        text unique not null
                        default 'NT-' || nextval('order_number_seq'),

  status              order_status not null default 'awaiting_payment',
  payment_method      payment_method not null,

  -- Razorpay references
  razorpay_order_id   text unique,
  razorpay_payment_id text,

  -- Money, all in paise, all computed server-side
  subtotal_paise      integer not null check (subtotal_paise >= 0),
  shipping_paise      integer not null default 0 check (shipping_paise >= 0),
  total_paise         integer not null check (total_paise > 0),
  -- GST component already contained inside total (inclusive pricing)
  gst_paise           integer not null default 0,

  -- Customer
  customer_name       text not null,
  customer_email      text not null,
  customer_phone      text not null,

  -- Shipping address
  address_line1       text not null,
  address_line2       text,
  city                text not null,
  state               text not null,
  pincode             text not null,

  -- Fulfilment
  courier             text,
  awb_number          text,
  shipped_at          timestamptz,
  delivered_at        timestamptz,

  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists orders_status_idx     on orders(status);
create index if not exists orders_created_idx    on orders(created_at desc);
create index if not exists orders_rzp_order_idx  on orders(razorpay_order_id);

create table if not exists order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references orders(id) on delete cascade,
  variant_id       uuid not null references variants(id),

  -- Denormalised snapshot: the catalogue may change later,
  -- the invoice must not.
  sku              text not null,
  product_name     text not null,
  size             text not null,
  unit_price_paise integer not null check (unit_price_paise > 0),
  quantity         integer not null check (quantity > 0),
  line_total_paise integer not null check (line_total_paise > 0)
);

create index if not exists order_items_order_idx on order_items(order_id);

-- ------------------------------------------------------------
-- 3. Webhook idempotency + audit
--    Razorpay retries webhooks. Without this you will
--    decrement stock twice for the same payment.
-- ------------------------------------------------------------

create table if not exists webhook_events (
  id           uuid primary key default gen_random_uuid(),
  event_id     text unique not null,   -- x-razorpay-event-id header
  event_type   text not null,
  payload      jsonb not null,
  processed_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 4. Atomic stock decrement
--    Called only after a payment is verified.
--    Locks the rows so two concurrent orders cannot oversell.
-- ------------------------------------------------------------

create or replace function decrement_stock(p_order_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  item record;
  current_stock integer;
begin
  for item in
    select variant_id, quantity
    from order_items
    where order_id = p_order_id
    order by variant_id            -- consistent lock order, avoids deadlock
  loop
    select stock into current_stock
    from variants
    where id = item.variant_id
    for update;                    -- row lock

    if current_stock < item.quantity then
      raise exception 'INSUFFICIENT_STOCK: variant % has % left, needed %',
        item.variant_id, current_stock, item.quantity;
    end if;

    update variants
    set stock = stock - item.quantity
    where id = item.variant_id;
  end loop;
end;
$$;

-- Restore stock on a cancellation or return.
create or replace function restore_stock(p_order_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  item record;
begin
  for item in
    select variant_id, quantity from order_items where order_id = p_order_id
  loop
    update variants set stock = stock + item.quantity where id = item.variant_id;
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- 5. updated_at trigger
-- ------------------------------------------------------------

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists orders_touch on orders;
create trigger orders_touch
  before update on orders
  for each row execute function touch_updated_at();

-- ------------------------------------------------------------
-- 6. Row Level Security
--    Everything is locked down. Your Worker uses the SERVICE ROLE
--    key, which bypasses RLS. The browser must never talk to these
--    tables directly.
-- ------------------------------------------------------------

alter table products       enable row level security;
alter table variants       enable row level security;
alter table orders         enable row level security;
alter table order_items    enable row level security;
alter table webhook_events enable row level security;

-- Public may read the active catalogue (used if you fetch the
-- catalogue at build time with the anon key). No write policies
-- exist anywhere, deliberately.
drop policy if exists "public reads active products" on products;
create policy "public reads active products"
  on products for select
  using (is_active = true);

drop policy if exists "public reads variants" on variants;
create policy "public reads variants"
  on variants for select
  using (true);

-- ------------------------------------------------------------
-- 7. Seed data — replace with your real designs
-- ------------------------------------------------------------

insert into products (slug, name, description, price_paise, gsm)
values (
  'static-noise-black',
  'Static Noise Oversized Tee — Black',
  '240 GSM heavyweight cotton, drop-shoulder cut, bio-washed and pre-shrunk.',
  99900,
  240
)
on conflict (slug) do nothing;

insert into variants (product_id, sku, size, stock)
select p.id, 'NT-SN-BLK-' || s.size, s.size, s.stock
from products p
cross join (values ('S', 8), ('M', 12), ('L', 12), ('XL', 8)) as s(size, stock)
where p.slug = 'static-noise-black'
on conflict (sku) do nothing;
