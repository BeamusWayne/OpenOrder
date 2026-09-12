CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE customer_kind AS ENUM ('guest', 'registered');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE cart_status AS ENUM ('open', 'checked_out');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE order_status AS ENUM (
    'draft_confirmed', 'paid', 'accepted', 'making', 'ready', 'completed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'succeeded', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE fulfillment_kind AS ENUM ('pickup', 'delivery');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE thread_status AS ENUM ('active', 'paused', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE message_role AS ENUM ('system', 'user', 'assistant', 'tool');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  kind customer_kind NOT NULL DEFAULT 'guest',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id),
  name text NOT NULL,
  city text NOT NULL,
  address text NOT NULL,
  latitude numeric(9, 6) NOT NULL,
  longitude numeric(9, 6) NOT NULL,
  rating numeric(2, 1) NOT NULL,
  open_hour integer NOT NULL,
  close_hour integer NOT NULL,
  supports_pickup boolean NOT NULL DEFAULT true,
  supports_delivery boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stores_brand_idx ON stores(brand_id);

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id),
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES categories(id),
  name text NOT NULL,
  description text NOT NULL
);

CREATE TABLE IF NOT EXISTS skus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES items(id),
  name text NOT NULL,
  size text NOT NULL,
  base_price_cents integer NOT NULL
);

CREATE TABLE IF NOT EXISTS modifier_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES items(id),
  name text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  min_select integer NOT NULL DEFAULT 1,
  max_select integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS modifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES modifier_groups(id),
  name text NOT NULL,
  price_delta_cents integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS inventory (
  sku_id uuid PRIMARY KEY REFERENCES skus(id),
  quantity integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  store_id uuid NOT NULL REFERENCES stores(id),
  thread_id uuid,
  status cart_status NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS carts_customer_open_idx ON carts(customer_id, status);

CREATE TABLE IF NOT EXISTS cart_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES carts(id),
  sku_id uuid NOT NULL REFERENCES skus(id),
  quantity integer NOT NULL,
  modifier_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  unit_price_cents integer NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  store_id uuid NOT NULL REFERENCES stores(id),
  cart_id uuid NOT NULL REFERENCES carts(id),
  status order_status NOT NULL DEFAULT 'draft_confirmed',
  fulfillment fulfillment_kind NOT NULL DEFAULT 'pickup',
  total_cents integer NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_unique ON orders(customer_id, idempotency_key);
CREATE INDEX IF NOT EXISTS orders_customer_idx ON orders(customer_id);

CREATE TABLE IF NOT EXISTS order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id),
  sku_id uuid NOT NULL REFERENCES skus(id),
  name_snapshot text NOT NULL,
  quantity integer NOT NULL,
  unit_price_cents integer NOT NULL,
  modifiers_snapshot jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id),
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id),
  status payment_status NOT NULL DEFAULT 'pending',
  amount_cents integer NOT NULL,
  provider text NOT NULL DEFAULT 'mock',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  status thread_status NOT NULL DEFAULT 'active',
  interrupt jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES threads(id),
  role message_role NOT NULL,
  content text,
  tool_call_id text,
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_thread_idx ON messages(thread_id, created_at);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key text PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers(id),
  route text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS metric_counters (
  name text PRIMARY KEY,
  value bigint NOT NULL DEFAULT 0
);
