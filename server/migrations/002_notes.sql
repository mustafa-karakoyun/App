-- Alıntılar ve notlar: kullanıcının kitabına bağlı, yalnızca sahibine görünür.
CREATE TABLE notes (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_book_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('quote', 'note')),
  text text NOT NULL,
  page integer,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  server_updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notes_user_sync ON notes (user_id, server_updated_at);
