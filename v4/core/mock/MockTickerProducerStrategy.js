const mq = require('../../utils/KafkaProducer');
const MockCCXT = require('./MockCCXT');

class MockTickerProducerStrategy {
    constructor({ symbolCount = 100, tps = 100 }) {
        this.tps = tps;
        this.symbols = Array.from({ length: symbolCount }, (_, i) => `MOCK/MOCK-${i}`);
    }

    async getSymbols(exchangeId) {
        return this.symbols;
    }

    async createExchangeInstance(exchangeId) {
        return new MockCCXT({ exchangeId, tps: this.tps });
    }

    async watch({ exchange, symbols }) {
        return await exchange.watchTickers(symbols);
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

module.exports = MockTickerProducerStrategy;
