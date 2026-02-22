class MockCCXT {
    constructor({ exchangeId = 'mock', tps = 100, maxQueueSize = 1000 }) {
        this.id = exchangeId;
        this.tps = tps;
        this.maxQueueSize = maxQueueSize;
        this.queue = [];
        this.symbols = [];
        this._startTickerGenerator();
    }

    setSymbols(symbols) {
        this.symbols = symbols;
    }

    _startTickerGenerator() {
        const intervalMs = 1000 / this.tps;
        let index = 0;

        setInterval(() => {
            if (this.symbols.length === 0 || this.queue.length >= this.maxQueueSize) return;

            const now = Date.now();
            const symbol = this.symbols[index % this.symbols.length];
            index++;

            const price = Math.random() * (130000000 - 120000000) + 120000000;
            const percentage = (Math.random() - 0.5) * 0.02;
            const volume = Math.random() * (3000 - 500) + 500;

            const ticker = {
                symbol,
                timestamp: now,
                high: price,
                low: price,
                open: price,
                close: price,
                last: price,
                previousClose: price,
                change: price,
                percentage,
                average: price,
                baseVolume: volume,
                quoteVolume: volume,
            };

            this.queue.push(ticker);
        }, intervalMs);
    }

    async watchTickers(symbols) {
        this.setSymbols(symbols);

        while (this.queue.length === 0) {
            await new Promise(res => setTimeout(res, 1));
        }

        return this.queue.shift();
    }
}

module.exports = MockCCXT;