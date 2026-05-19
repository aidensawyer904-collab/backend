CREATE TABLE IF NOT EXISTS tickets (
  id                  VARCHAR(30)    NOT NULL,
  email               VARCHAR(255)   NOT NULL,
  subject             VARCHAR(100)   NOT NULL,
  description         TEXT           NOT NULL,
  status              VARCHAR(20)    NOT NULL DEFAULT 'open',
  timestamp           BIGINT         NOT NULL,
  closed_at           BIGINT,
  replied_at          BIGINT,
  human_requested_at  BIGINT,
  human_requested     TINYINT(1)     NOT NULL DEFAULT 0,
  closed              TINYINT(1)     NOT NULL DEFAULT 0,
  closed_by           VARCHAR(100),
  last_reply          TEXT,
  replied_by          VARCHAR(100),
  initial_message     TEXT,
  conversation        TEXT,
  responses           JSON,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX IF NOT EXISTS idx_closed        ON tickets (closed);
CREATE INDEX IF NOT EXISTS idx_timestamp     ON tickets (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_human_request ON tickets (human_requested);