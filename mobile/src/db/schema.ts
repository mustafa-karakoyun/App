import { integer, sqliteTable, text, index } from 'drizzle-orm/sqlite-core';

// Cihazdaki veri tabanı sunucudaki şemanın kullanıcıya ait kısmının aynısı.
// Zaman damgaları ISO 8601 metin; silme gerçek silme değil deleted_at işareti.

/** Kullanıcının kitaplarına ait katalog satırları (ve henüz sunucuya gitmemiş yerel kitaplar). */
export const books = sqliteTable(
  'books',
  {
    id: text('id').primaryKey(),
    isbn13: text('isbn13'),
    title: text('title').notNull(),
    /** JSON dizi */
    authors: text('authors').notNull().default('[]'),
    publisher: text('publisher'),
    year: integer('year'),
    pageCount: integer('page_count'),
    coverUrl: text('cover_url'),
    /** Sunucuya henüz yüklenmemiş kapak fotoğrafı. */
    localCoverUri: text('local_cover_uri'),
    source: text('source').notNull(),
    verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
    normalizedTitle: text('normalized_title').notNull(),
    normalizedAuthors: text('normalized_authors').notNull().default(''),
    /**
     * synced: sunucu kataloğunda var.
     * pending_isbn: çevrimdışı barkodla eklendi, bilgisi internet gelince dolacak.
     * pending_manual: elle eklendi, sunucuya henüz gönderilmedi.
     */
    syncState: text('sync_state', { enum: ['synced', 'pending_isbn', 'pending_manual'] })
      .notNull()
      .default('synced'),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('books_isbn').on(t.isbn13), index('books_title').on(t.normalizedTitle)],
);

export const locations = sqliteTable('locations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  parentId: text('parent_id'),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const userBooks = sqliteTable(
  'user_books',
  {
    id: text('id').primaryKey(),
    bookId: text('book_id').notNull(),
    status: text('status', { enum: ['to_read', 'reading', 'read', 'abandoned'] }).notNull(),
    locationId: text('location_id'),
    addedVia: text('added_via', { enum: ['barcode', 'shelf', 'manual'] }).notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (t) => [index('user_books_book').on(t.bookId), index('user_books_location').on(t.locationId)],
);

export const loans = sqliteTable(
  'loans',
  {
    id: text('id').primaryKey(),
    userBookId: text('user_book_id').notNull(),
    borrowerName: text('borrower_name').notNull(),
    lentAt: text('lent_at').notNull(),
    dueAt: text('due_at'),
    returnedAt: text('returned_at'),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
    /** Yalnızca bu cihazda: planlanmış iade hatırlatmasının kimliği. */
    notificationId: text('notification_id'),
  },
  (t) => [index('loans_user_book').on(t.userBookId)],
);

/** Kitaptan alıntılar ve kullanıcının notları. */
export const notes = sqliteTable(
  'notes',
  {
    id: text('id').primaryKey(),
    userBookId: text('user_book_id').notNull(),
    kind: text('kind', { enum: ['quote', 'note'] }).notNull(),
    text: text('text').notNull(),
    page: integer('page'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (t) => [index('notes_user_book').on(t.userBookId)],
);

/** Sunucuya gönderilecek yerel değişiklikler ("giden kutusu"). */
export const outbox = sqliteTable('outbox', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tableName: text('table_name', { enum: ['locations', 'user_books', 'loans', 'notes'] }).notNull(),
  recordId: text('record_id').notNull(),
  createdAt: text('created_at').notNull(),
});

/** İnternet yokken çekilen ya da işlenmeyi bekleyen raf fotoğrafları. */
export const pendingScans = sqliteTable('pending_scans', {
  id: text('id').primaryKey(),
  photoUri: text('photo_uri').notNull(),
  status: text('status', { enum: ['queued', 'processing', 'done', 'failed'] }).notNull(),
  /** Sunucunun ScanResponse yanıtı (JSON), onay listesi bundan açılır. */
  result: text('result'),
  error: text('error'),
  createdAt: text('created_at').notNull(),
});

export const kv = sqliteTable('kv', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export type BookRow = typeof books.$inferSelect;
export type LocationRow = typeof locations.$inferSelect;
export type UserBookRow = typeof userBooks.$inferSelect;
export type LoanRow = typeof loans.$inferSelect;
export type PendingScanRow = typeof pendingScans.$inferSelect;
export type NoteRow = typeof notes.$inferSelect;
