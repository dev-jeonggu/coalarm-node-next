require("dotenv").config();
const { Kafka } = require("kafkajs");
const { logger } = require("./logger");

class KafkaProducer {
    constructor() {
        this.producer = null;
    }

    async connect() {
        if (this.producer) return;

        const kafka = new Kafka({
            clientId: process.env.KAFKA_CLIENT_ID || "coalarm-producer",
            brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
        });

        this.producer = kafka.producer({ allowAutoTopicCreation: true });
        await this.producer.connect();
        logger.info("[Kafka] Producer 연결에 성공했습니다");
    }

    async close() {
        if (this.producer) {
            await this.producer.disconnect();
            this.producer = null;
        }
    }

    async publish({ exchangeName, routingKey, message, onComplete }) {
        try {
            await this.producer.send({
                topic: exchangeName,
                messages: [{ key: routingKey, value: message }],
            });
            if (onComplete) onComplete(null, true);
            return true;
        } catch (e) {
            logger.error(`[Kafka] 메시지 발행 실패: ${e.message}`);
            if (onComplete) onComplete(e, false);
            return false;
        }
    }
}

module.exports = new KafkaProducer();
