// Producer
const TickerConsumer = require("./TickerConsumer");

// Strategy
const TickerConsumerStrategy = require("../strategy/TickerConsumerStrategy")

class ConsumerFactory {
  static create({
      exchangeId,
      type,
  }) {
    switch (type) {
      case "ticker":
        return new TickerConsumer({
          exchangeId,
          strategy: new TickerConsumerStrategy()
        });
      default:
        throw new Error(`일치하는 워커 타입이 존재하지 않습니다: ${type}`);
    }
  }
}

module.exports = ConsumerFactory;
