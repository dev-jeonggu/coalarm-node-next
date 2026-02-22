// Producer
const TickerProducer = require("./TickerProducer");

// Strategy
const TickerProducerStrategy = require("../strategy/TickerProducerStrategy")

// Mock
const MockTickerProducerStrategy = require("../mock/MockTickerProducerStrategy");

class ProducerFactory {
  static create({
      exchangeId,
      type,
      debug,
      tps,
      chunkSize,
      symbolCount
  }) {
    switch (type) {
      case "ticker":
        return new TickerProducer({
          exchangeId,
          chunkSize,
          strategy: debug ? new MockTickerProducerStrategy({
                  tps,
                  symbolCount
              })
              : new TickerProducerStrategy()
        });
      default:
        throw new Error(`일치하는 워커 타입이 존재하지 않습니다: ${type}`);
    }
  }
}

module.exports = ProducerFactory;
