const db = require('./db');

// DB에 티커 데이터 배치 저장
const saveBatchTickers = async ({exchangeId, tickers}) => {
    if (!tickers || tickers.length === 0) return;

    const q = `
    INSERT INTO tickers (
      timestamp, exchange, base_symbol, quote_symbol, open, high, low, close, last, previous_close,
      change, percentage, base_volume, quote_volume
    ) VALUES
    ${tickers.map((_, i) => `
      (
        to_timestamp($${i * 14 + 1} / 1000.0), $${i * 14 + 2}, $${i * 14 + 3}, $${i * 14 + 4},
        $${i * 14 + 5}, $${i * 14 + 6}, $${i * 14 + 7}, $${i * 14 + 8}, $${i * 14 + 9},
        $${i * 14 + 10}, $${i * 14 + 11}, $${i * 14 + 12}, $${i * 14 + 13}, $${i * 14 + 14}
      )
    `).join(',')}
    ON CONFLICT (timestamp, exchange, base_symbol, quote_symbol) DO NOTHING;
  `;

    const values = tickers.flatMap((ticker) => {
        const [baseSymbol, quoteSymbol] = ticker.symbol.split('/');

        return [
            ticker.timestamp,
            exchangeId,
            baseSymbol,
            quoteSymbol,
            ticker.open,
            ticker.high,
            ticker.low,
            ticker.close,
            ticker.last,
            ticker.previousClose,
            ticker.change,
            ticker.percentage,
            ticker.baseVolume,
            ticker.quoteVolume,
        ]
    });

    await db.query(q, values);
};

module.exports = {
    saveBatchTickers
}
