const ccxt = require('ccxt');
const ccxtpro = ccxt.pro;
const mq = require('../../utils/KafkaProducer');

class TickerProducerStrategy {
    constructor() {}

    async getSymbols(exchangeId) {
        const exchange = new ccxtpro[exchangeId]({
            enableRateLimit: true,
            options: { defaultType: "spot" },
        });

        await exchange.loadMarkets();

        return Object.values(exchange.markets)
            .filter(m => ['KRW', 'USDT'].includes(m.quote) && m.active)
            .map(m => m.symbol);
    }

    async createExchangeInstance(exchangeId) {
        return new ccxtpro[exchangeId]({
            enableRateLimit: true,
            options: { defaultType: "spot" },
        });
    }

    async watch({ exchange, symbols }) {
        const ticker = await exchange.watchTickers(symbols);
        return Object.values(ticker)[0];
    }

    async publish({ exchangeName, routingKey, message, onComplete }) {
        const ok = await mq.publish({
            exchangeName,
            routingKey,
            message: Buffer.from(JSON.stringify(message)),
            onComplete,
        });
        return ok;
    }
}

module.exports = TickerProducerStrategy;
