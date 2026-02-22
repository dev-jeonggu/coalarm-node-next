const {logger} = require("../../utils/logger");
const BaseProducer = require("./BaseProducer");

class TickerProducer extends BaseProducer {
    constructor({ exchangeId, chunkSize, strategy }) {
        super();
        this.exchangeId = exchangeId;
        this.chunkSize = chunkSize;
        this.strategy = strategy;
        this.retryBuffers = new Map();
        this.metrics = {
            watchCount: new Map(),
            watchErrorCount: new Map(),
            watchLatencySum: new Map(),
            publishCount: new Map(),
            publishErrorCount: new Map(),
            publishLatencySum: new Map(),
            backPressureCount: new Map(),
            retryBufferLength: new Map()
        };
    }

    async run() {
        this.metricsInterval = setInterval(async () => {
            await this.reportToMonitor({
                producerId: process.env.PRODUCER_ID ?? `${process.pid}`,
                ...this._getAveragedMetrics()
            });
            this._clearMetric();
        }, 1000);

        const symbols = await this.strategy.getSymbols(this.exchangeId);
        const chunks = [];

        for (let i = 0; i < symbols.length; i += this.chunkSize) {
            chunks.push(symbols.slice(i, i + this.chunkSize));
        }

        await Promise.allSettled(chunks.map(async (chunk, idx) => {
            const exchange = await this.strategy.createExchangeInstance(this.exchangeId);
            this.retryBuffers.set(idx, []);
            this.startWatching(idx, exchange, chunk);
        }));

        this._startFlushRetryLoop();
    }

    stop() {
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
        }
    }

    async startWatching(idx, exchange, symbols) {
        logger.info(`[TickerProducer] ${idx} 번째 Producer 연결 시작`);

        while (true) {
            let ticker;
            try {
                const watchStart = Date.now();
                ticker = await this.strategy.watch({exchange, symbols});
                const latency = Date.now() - watchStart;

                this._incMap(this.metrics.watchCount, idx);
                this._addLatency(this.metrics.watchLatencySum, idx, latency);
            } catch (e) {
                this._incMap(this.metrics.watchErrorCount, idx);
                logger.error(`[TickerProducer] ${this.exchangeId}의 ${idx} 번째 Producer에서 watch 에러 발생: ${e.message}`);
                continue;
            }

            try {
                const publishStart = Date.now();
                const ok = await this.strategy.publish({
                    exchangeName: process.env.KAFKA_TOPIC || process.env.MQ_EXCHANGE_NAME,
                    routingKey: `ticker.${exchange.id}.${ticker.symbol}`,
                    message: ticker,
                    onComplete: (e, ok) => {
                        if (e) {
                            this._incMap(this.metrics.publishErrorCount, idx);
                            logger.warn(`[TickerProducer] ${this.exchangeId} ${idx} 번째 Producer에서 publish 실패: ${e.message}`);
                            this._enqueueRetryBuffer(idx, exchange, ticker);
                        } else {
                            const latency = Date.now() - publishStart;
                            this._incMap(this.metrics.publishCount, idx);
                            this._addLatency(this.metrics.publishLatencySum, idx, latency);
                        }
                    }
                })

                if (!ok) {
                    logger.info(`retry buffer enqueue`)
                    this._incMap(this.metrics.backPressureCount, idx);
                    this._enqueueRetryBuffer(idx, exchange, ticker);
                }

            } catch (e) {
                this._incMap(this.metrics.publishErrorCount, idx);
                logger.error(`[TickerProducer] ${this.exchangeId} ${idx} 번째 Producer에서 publish 에러 발생: ${e.message}`);
                this._enqueueRetryBuffer(idx, exchange, ticker);
            }
        }
    }

    async flushAllRetryBuffers() {
        for (const [idx, buffer] of this.retryBuffers.entries()) {
            if (!buffer.length) continue;

            const remaining = [];
            for (const item of buffer) {
                logger.info(`retry publish`)
                await this.strategy.publish({
                    ...item,
                    onComplete: (e, ok) => {
                        if (e) {
                            remaining.push(item);
                        }
                    }
                });
            }
            this.retryBuffers.set(idx, remaining);
        }
    }

    _enqueueRetryBuffer(idx, exchange, ticker) {
        if (!this.retryBuffers.has(idx)) this.retryBuffers.set(idx, []);
        this.retryBuffers.get(idx).push({
            exchangeName: process.env.KAFKA_TOPIC || process.env.MQ_EXCHANGE_NAME,
            routingKey: `ticker.${exchange.id}.${ticker.symbol}`,
            message: ticker,
        });
        this.metrics.retryBufferLength.set(idx, this.retryBuffers.get(idx).length);
    }

    _startFlushRetryLoop() {
        const flushRetryLoop = async () => {
            try {
                await this.flushAllRetryBuffers();
            } catch (e) {
                logger.error(`[TickerProducer] 재시도 버퍼 flush 실패: ${e.message}`);
            } finally {
                setTimeout(flushRetryLoop, 3000);
            }
        };

        flushRetryLoop();
    }

    _incMap(map, key) {
        map.set(key, (map.get(key) || 0) + 1);
    }

    _addLatency(map, key, latency) {
        map.set(key, (map.get(key) || 0) + latency);
    }

    _clearMetric() {
        for (const metric of Object.values(this.metrics)) {
            metric.clear();
        }
    }

    _getAveragedMetrics() {
        const result = {};

        let totalWatchLatency = 0;
        let totalWatchCount = 0;
        for (const [idx, sum] of this.metrics.watchLatencySum.entries()) {
            totalWatchLatency += sum;
            totalWatchCount += this.metrics.watchCount.get(idx) || 0;
        }
        result["producerAvgWatchLatency"] = totalWatchCount > 0 ? totalWatchLatency / totalWatchCount : 0;

        let totalPublishLatency = 0;
        let totalPublishCount = 0;
        for (const [idx, sum] of this.metrics.publishLatencySum.entries()) {
            totalPublishLatency += sum;
            totalPublishCount += this.metrics.publishCount.get(idx) || 0;
        }
        result["producerAvgPublishLatency"] = totalPublishCount > 0 ? totalPublishLatency / totalPublishCount : 0;

        result["producerWatchTotal"] = Array.from(this.metrics.watchCount.values()).reduce((a, b) => a + b, 0);
        result["producerWatchErrorTotal"] = Array.from(this.metrics.watchErrorCount.values()).reduce((a, b) => a + b, 0);
        result["producerPublishTotal"] = Array.from(this.metrics.publishCount.values()).reduce((a, b) => a + b, 0);
        result["producerPublishErrorTotal"] = Array.from(this.metrics.publishErrorCount.values()).reduce((a, b) => a + b, 0);
        result["producerRetryBufferLength"] = Array.from(this.metrics.retryBufferLength.values()).reduce((a, b) => a + b, 0);
        result["producerBackPressureCount"] = Array.from(this.metrics.backPressureCount.values()).reduce((a, b) => a + b, 0);

        return result;
    }
}

module.exports = TickerProducer;
