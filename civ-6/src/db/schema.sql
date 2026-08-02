PRAGMA journal_mode = DELETE;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_en TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('leaders', 'civilizations', 'cities', 'great-people', 'great-works')),
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

CREATE TABLE IF NOT EXISTS great_works (
  entry_id TEXT PRIMARY KEY REFERENCES entries(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL UNIQUE,
  creator_id TEXT NOT NULL REFERENCES entries(id),
  game_era TEXT NOT NULL,
  pack TEXT NOT NULL,
  ruleset_profile TEXT NOT NULL,
  rulesets_json TEXT NOT NULL CHECK (json_valid(rulesets_json)),
  historical_title TEXT NOT NULL,
  creation_json TEXT NOT NULL CHECK (json_valid(creation_json)),
  attribution TEXT NOT NULL,
  holding_json TEXT NOT NULL CHECK (json_valid(holding_json)),
  work_rights_json TEXT NOT NULL CHECK (json_valid(work_rights_json)),
  image_role TEXT NOT NULL CHECK (
    image_role IN ('work', 'detail', 'manuscript', 'score', 'edition', 'performance', 'representative', 'none')
  ),
  audio_json TEXT NOT NULL CHECK (json_valid(audio_json))
);

CREATE INDEX IF NOT EXISTS great_works_creator_idx ON great_works(creator_id);

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
  creator,
  great_work,
  content=''
);
