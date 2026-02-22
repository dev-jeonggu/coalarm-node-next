require("dotenv").config();

const ConsumerFactory = require("./core/consumer/ConsumerFactory");
const mq = require("./utils/KafkaConsumer");
const db = require("./utils/db");
const { parseCliArgs } = require("./utils/args");
const { logger } = require("./utils/logger");

const setupGracefulShutdown = (worker) => {
    const shutdown = async () => {
        logger.info(`프로세스 종료 신호 수신. 워커 중지 중...`);
        await mq.close();
        await db.close();
        worker.stop();
        setTimeout(() => {
            logger.info(`프로세스 정상 종료`);
            process.exit(0);
        }, 1000);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
};

(async () => {
    try {
        const {
            exchangeId,
            type,
        } = parseCliArgs();

        const worker = ConsumerFactory.create({
            exchangeId,
            type,
        });

        logger.info(`${type} 유형의 Consumer 생성 거래소: ${exchangeId ?? '지정 안함'})`);

        setupGracefulShutdown(worker);
        await mq.connect();
        await db.connect();
        await worker.run();
    } catch (e) {
        logger.error(`프로세스 비정상 종료: `, e);
        await mq.close();
        await db.close();
        process.exit(1);
    }
})();
