CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  password_hash text,
  google_sub text UNIQUE,
  name text,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'premium')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Ortak katalog: aynı baskı tüm kullanıcılar için bir kez saklanır.
CREATE TABLE books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isbn13 text UNIQUE,
  title text NOT NULL,
  authors text[] NOT NULL DEFAULT '{}',
  publisher text,
  year integer,
  page_count integer,
  cover_url text,
  source text NOT NULL CHECK (source IN ('google_books', 'open_library', 'manual')),
  verified boolean NOT NULL DEFAULT false,
  normalized_title text NOT NULL,
  normalized_authors text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX books_title_trgm ON books USING gin (normalized_title gin_trgm_ops);
CREATE INDEX books_authors_trgm ON books USING gin (normalized_authors gin_trgm_ops);

-- Elle eklenen kitabı aynı bilgiyle ekleyen farklı kullanıcılar; 3 olunca kitap doğrulanır.
CREATE TABLE book_submissions (
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (book_id, user_id)
);

-- Öğrenme döngüsü: modelin okuduğu metin → kullanıcının onayladığı kitap.
CREATE TABLE scan_aliases (
  alias_key text NOT NULL,
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  confirmations integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (alias_key, book_id)
);

-- Kullanıcı kayıtları istemcide üretilen UUID'leri taşır (çevrimdışı oluşturma için).
-- updated_at istemcinin zamanı (son yazan kazanır), server_updated_at pull için sunucu zamanı.
CREATE TABLE locations (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  parent_id uuid,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  server_updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX locations_user_sync ON locations (user_id, server_updated_at);

CREATE TABLE user_books (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES books(id),
  status text NOT NULL CHECK (status IN ('to_read', 'reading', 'read', 'abandoned')),
  location_id uuid,
  added_via text NOT NULL CHECK (added_via IN ('barcode', 'shelf', 'manual')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  server_updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_books_user_sync ON user_books (user_id, server_updated_at);

CREATE TABLE loans (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_book_id uuid NOT NULL,
  borrower_name text NOT NULL,
  lent_at timestamptz NOT NULL,
  due_at timestamptz,
  returned_at timestamptz,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  server_updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX loans_user_sync ON loans (user_id, server_updated_at);

-- Raf fotoğrafı saklanmaz; yalnızca model çıktısı ve eşleşme istatistikleri.
CREATE TABLE scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('processing', 'done', 'failed')),
  model_output jsonb,
  match_stats jsonb,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scans_user_month ON scans (user_id, created_at);
