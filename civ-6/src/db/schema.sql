PRAGMA journal_mode = DELETE;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_en TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('leaders', 'civilizations', 'cities', 'great-people')),
  subcategory TEXT NOT NULL DEFAULT '',
  city_roles_json TEXT NOT NULL DEFAULT '[]',
  era TEXT NOT NULL,
  lifespan TEXT NOT NULL DEFAULT '',
  civilization TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL,
  image TEXT NOT NULL DEFAULT '',
  image_alt TEXT NOT NULL DEFAULT '',
  image_credit TEXT NOT NULL DEFAULT '',
  image_license TEXT NOT NULL DEFAULT '',
  image_source TEXT NOT NULL DEFAULT '',
  accent TEXT NOT NULL DEFAULT 'cobalt',
  featured INTEGER NOT NULL DEFAULT 0,
  quote TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL,
  body TEXT NOT NULL,
  related_json TEXT NOT NULL DEFAULT '[]',
  sources_json TEXT NOT NULL,
  reading_minutes INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS entries_category_idx ON entries(category);
CREATE INDEX IF NOT EXISTS entries_era_idx ON entries(era);
CREATE INDEX IF NOT EXISTS entries_featured_idx ON entries(featured DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
  slug UNINDEXED,
  name,
  name_en,
  summary,
  tags,
  civilization,
  region,
  subcategory,
  city_roles,
  content=''
);
