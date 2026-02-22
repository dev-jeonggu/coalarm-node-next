const minimist = require("minimist");

const parseCliArgs = () => {
  const args = minimist(process.argv.slice(2));

  if (!args.type) {
    throw new Error(
        "필수 인자 누락: --type 옵션이 필요합니다.",
    );
  }
  const type = args.type.toLowerCase();
  const exchangeId = args.exchangeId?.toLowerCase();

  const chunkSize = args.chunkSize;
  const symbolCount = args.symbolCount;

  const debug = args.debug?.toLowerCase();
  const tps = args.tps;

  return { exchangeId, type, debug, chunkSize, symbolCount, tps };
};

module.exports = { parseCliArgs };