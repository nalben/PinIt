-- Adds a "blocked" role to boardguests to prevent re-joining after removal.
-- Apply manually on the target MySQL database.

ALTER TABLE boardguests
  MODIFY COLUMN role ENUM('guest', 'editer', 'blocked')
  NOT NULL
  DEFAULT 'guest';

