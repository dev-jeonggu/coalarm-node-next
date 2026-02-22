const mq = require('../../utils/KafkaConsumer');
const { saveBatchTickers } = require('../../utils/query');

class TickerConsumerStrategy {
    constructor() {}

    async save({ exchangeId, tickers }) {
        await saveBatchTickers({ exchangeId, tickers });
    }

    async sendToDLQ(messages) {
        await mq.sendToDLQ(messages);
    }

    async consume({ topic, onBatch }) {
        await mq.consume({ topic, onBatch });
    }
}

module.exports = TickerConsumerStrategy;
