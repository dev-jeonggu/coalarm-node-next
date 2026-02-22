CREATE TABLE IF NOT EXISTS tickers (
  timestamp        TIMESTAMPTZ     NOT NULL,
  exchange         VARCHAR(50)     NOT NULL,
  base_symbol      VARCHAR(20)     NOT NULL,
  quote_symbol     VARCHAR(20)     NOT NULL,
  open             NUMERIC,
  high             NUMERIC,
  low              NUMERIC,
  close            NUMERIC,
  last             NUMERIC,
  previous_close   NUMERIC,
  change           NUMERIC,
  percentage       NUMERIC,
  base_volume      NUMERIC,
  quote_volume     NUMERIC,
  PRIMARY KEY (timestamp, exchange, base_symbol, quote_symbol)
);
