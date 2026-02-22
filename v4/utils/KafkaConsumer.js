require("dotenv").config();
const { Kafka } = require("kafkajs");
const { logger } = require("./logger");

class KafkaConsumer {
    constructor() {
        this.consumer = null;
        this.dlqProducer = null;
    }

    async connect() {
        if (this.consumer) return;

        const kafka = new Kafka({
            clientId: process.env.KAFKA_CLIENT_ID || "coalarm-consumer",
            brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
        });

        this.consumer = kafka.consumer({
            groupId: process.env.KAFKA_GROUP_ID || "coalarm-consumer-group",
        });

        this.dlqProducer = kafka.producer({ allowAutoTopicCreation: true });

        await this.consumer.connect();
        await this.dlqProducer.connect();
        logger.info("[Kafka] Consumer 연결에 성공했습니다");
    }

    async close() {
        if (this.consumer) await this.consumer.disconnect();
        if (this.dlqProducer) await this.dlqProducer.disconnect();
        this.consumer = null;
        this.dlqProducer = null;
    }

    async consume({ topic, onBatch }) {
        await this.consumer.subscribe({ topics: [topic], fromBeginning: false });

        await this.consumer.run({
            eachBatchAutoResolve: false,
            eachBatch: async ({ batch, resolveOffset, heartbeat, commitOffsetsIfNecessary }) => {
                await onBatch({
                    messages: batch.messages,
                    resolveOffset,
                    heartbeat,
                    commitOffsetsIfNecessary,
                });
            },
        });
    }

    async sendToDLQ(messages) {
        const dlqTopic = process.env.KAFKA_DLQ_TOPIC || "ticker.dlq";
        await this.dlqProducer.send({
            topic: dlqTopic,
            messages: messages.map((m) => ({ key: m.key, value: m.value })),
        });
        logger.warn(`[Kafka] DLQ로 ${messages.length}개 메시지 이동: ${dlqTopic}`);
    }
}

module.exports = new KafkaConsumer();
