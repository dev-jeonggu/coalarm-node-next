const axios = require("axios");
const {logger} = require("../../utils/logger");

class BaseProducer {
    constructor() {
    }
    async run() {
        throw new Error("하위 클래스를 생성하고 run() 메서드를 오버라이딩");
    }

    async reportToMonitor(metric) {
        try {
            await axios.post(process.env.MONITORING_CONSUMER_URL, metric)
        } catch (e) {
            logger.error(`[BaseProducer] 메트릭 전송 실패: ${e.message}`);
        }
    }
}

module.exports = BaseProducer;
