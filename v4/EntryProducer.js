require("dotenv").config();

const ProducerFactory = require("./core/producer/ProducerFactory");
const mq = require("./utils/KafkaProducer");
const { parseCliArgs } = require("./utils/args");
const { logger } = require("./utils/logger");

const setupGracefulShutdown = (worker) => {
    const shutdown = async () => {
        logger.info(`프로세스 종료 신호 수신. 워커 중지 중...`);
        await mq.close();
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
            debug,
            chunkSize,
            tps,
            symbolCount
        } = parseCliArgs();

        const worker = ProducerFactory.create({
            exchangeId,
            type,
            debug,
            tps,
            chunkSize,
            symbolCount
        });

        logger.info(`${type} 유형의 Producer 생성 거래소: ${exchangeId ?? '지정 안함'} tps: ${tps}`);

        setupGracefulShutdown(worker);
        await mq.connect();
        await worker.run();
    } catch (e) {
        logger.error(`프로세스 비정상 종료: `, e);
        await mq.close();
        process.exit(1);
    }
})();
