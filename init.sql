CREATE EXTENSION IF NOT EXISTS timescaledb;

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

SELECT create_hypertable('tickers', by_range('timestamp', INTERVAL '1 day'));

ALTER TABLE tickers SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'exchange, base_symbol, quote_symbol'
);

SELECT add_compression_policy('tickers', INTERVAL '7 days');
