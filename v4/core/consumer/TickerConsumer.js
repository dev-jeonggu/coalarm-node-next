const { logger } = require('../../utils/logger');
const BaseConsumer = require('./BaseConsumer');

class TickerConsumer extends BaseConsumer {
    constructor({ exchangeId, strategy }) {
        super();
        this.exchangeId = exchangeId;
        this.strategy = strategy;
        this.BATCH_SIZE = parseInt(process.env.DB_BATCH_SIZE || "50", 10);
        this.metrics = {
            totalConsumed: 0,
            sendToDLQTotal: 0,
            recoverableRetryTotal: 0,
            batchLatencySum: 0,
            batchCount: 0
        };
    }

    async run() {
        this._startMetricsReporting();

        await this.strategy.consume({
            topic: process.env.KAFKA_TOPIC || "ticker",
            onBatch: async ({ messages, resolveOffset, heartbeat, commitOffsetsIfNecessary }) => {
                // exchangeId가 지정된 경우 key로 필터링 (key 형식: ticker.{exchangeId}.{symbol})
                const filtered = this.exchangeId
                    ? messages.filter(msg => {
                        const key = msg.key?.toString() || '';
                        return key.startsWith(`ticker.${this.exchangeId}.`);
                    })
                    : messages;

                for (let i = 0; i < filtered.length; i += this.BATCH_SIZE) {
                    const batch = filtered.slice(i, i + this.BATCH_SIZE);

                    let tickers;
                    try {
                        tickers = batch.map(msg => JSON.parse(msg.value.toString()));
                    } catch (e) {
                        logger.error('[TickerConsumer] 메시지 파싱 실패로 인해 DLQ로 메시지를 이동합니다.', e);
                        await this.strategy.sendToDLQ(batch);
                        this.metrics.sendToDLQTotal += batch.length;
                        batch.forEach(msg => resolveOffset(msg.offset));
                        await heartbeat();
                        continue;
                    }

                    const start = Date.now();
                    try {
                        await this.strategy.save({ exchangeId: this.exchangeId, tickers });

                        const latency = Date.now() - start;
                        this.metrics.batchLatencySum += latency;
                        this.metrics.batchCount += 1;
                        this.metrics.totalConsumed += tickers.length;

                        batch.forEach(msg => resolveOffset(msg.offset));
                        await commitOffsetsIfNecessary();
                        await heartbeat();
                    } catch (e) {
                        const isRecoverable = this._isRecoverableError(e);
                        logger.error(`[TickerConsumer] DB 저장 실패로 인해 ${isRecoverable ? '재시도합니다.' : 'DLQ로 메시지를 이동합니다.'}`, e);

                        if (isRecoverable) {
                            this.metrics.recoverableRetryTotal += batch.length;
                            throw e; // Kafka가 오프셋을 커밋하지 않아 재전달됨
                        } else {
                            await this.strategy.sendToDLQ(batch);
                            this.metrics.sendToDLQTotal += batch.length;
                            batch.forEach(msg => resolveOffset(msg.offset));
                            await commitOffsetsIfNecessary();
                        }
                    }
                }
            }
        });
    }

    stop() {
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
        }
    }

    _startMetricsReporting() {
        this.metricsInterval = setInterval(async () => {
            try {
                await this._reportMetrics();
            } catch (e) {
                logger.error('[TickerConsumer] 메트릭 전송 실패', e);
            } finally {
                this._clearMetrics();
            }
        }, 1000);
    }

    async _reportMetrics() {
        const { totalConsumed, sendToDLQTotal, recoverableRetryTotal, batchLatencySum, batchCount } = this.metrics;
        const avgBatchLatency = batchCount > 0 ? batchLatencySum / batchCount : 0;

        await this.reportToMonitor({
            consumerId: process.env.CONSUMER_ID ?? `${process.pid}`,
            consumerTotalConsumed: totalConsumed,
            consumerSendToDLQTotal: sendToDLQTotal,
            consumerRecoverableRetryTotal: recoverableRetryTotal,
            consumerAvgBatchLatency: avgBatchLatency
        });
    }

    _clearMetrics() {
        for (const key of Object.keys(this.metrics)) {
            this.metrics[key] = 0;
        }
    }

    _isRecoverableError(error) {
        const recoverableErrors = ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND'];
        return recoverableErrors.includes(error.code);
    }
}

module.exports = TickerConsumer;
