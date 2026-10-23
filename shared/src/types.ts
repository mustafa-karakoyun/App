// İstemci ve sunucunun paylaştığı veri tipleri. Alan adları API'de snake_case.

export const READING_STATUSES = ['to_read', 'reading', 'read', 'abandoned'] as const;
export type ReadingStatus = (typeof READING_STATUSES)[number];

export const ADDED_VIA = ['barcode', 'shelf', 'manual'] as const;
export type AddedVia = (typeof ADDED_VIA)[number];

export type BookSource = 'catalog' | 'google_books' | 'open_library' | 'manual';

/** Ortak katalogdaki kitap (baskı). */
export interface Book {
  id: string;
  isbn13: string | null;
  title: string;
  authors: string[];
  publisher: string | null;
  year: number | null;
  page_count: number | null;
  cover_url: string | null;
  source: BookSource;
  verified: boolean;
}

/** Senkronize edilen kullanıcı kayıtlarının ortak alanları. Zaman damgaları ISO 8601. */
interface SyncedRecord {
  id: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface UserBook extends SyncedRecord {
  book_id: string;
  status: ReadingStatus;
  location_id: string | null;
  added_via: AddedVia;
  created_at: string;
}

export interface Location extends SyncedRecord {
  name: string;
  parent_id: string | null;
}

export interface Loan extends SyncedRecord {
  user_book_id: string;
  borrower_name: string;
  lent_at: string;
  due_at: string | null;
  returned_at: string | null;
}

export interface SyncChanges {
  locations: Location[];
  user_books: UserBook[];
  loans: Loan[];
}

export interface SyncPushRequest {
  changes: SyncChanges;
}

export interface SyncPushResponse {
  /** Sunucuda daha yeni sürümü olduğu için yok sayılan kayıt id'leri. */
  rejected: string[];
}

export interface SyncPullResponse {
  changes: SyncChanges;
  /** Kullanıcının kitaplarına ait katalog satırları. */
  books: Book[];
  /** Bir sonraki pull'da `since` olarak gönderilecek sunucu zamanı. */
  server_time: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface ScanCandidate {
  book: Book;
  score: number;
}

export interface ScanItem {
  position: number;
  raw_text: string;
  title: string | null;
  author: string | null;
  publisher: string | null;
  confidence: number;
  group: 'matched' | 'verify' | 'not_found';
  /** Puana göre sıralı adaylar; "eşleşti"de ilk aday seçili gelir. */
  candidates: ScanCandidate[];
}

export interface ScanResponse {
  scan_id: string;
  items: ScanItem[];
  unreadable_count: number;
  stats: { matched: number; verify: number; not_found: number };
  quota: Quota;
}

export interface Quota {
  used: number;
  limit: number;
  resets_at: string;
}

export interface ManualBookInput {
  isbn13?: string | null;
  title: string;
  authors: string[];
  publisher?: string | null;
  year?: number | null;
  page_count?: number | null;
}

export interface ApiError {
  error: string;
  message: string;
}
