const ccxt = require('ccxt');

(async () => {
  try {
    const ex = new ccxt.binanceusdm({
      apiKey: process.env.API_KEY,
      secret: process.env.API_SECRET,
      enableRateLimit: true,
      options: { defaultType: 'future' },
      urls: { api: { public: 'https://testnet.binancefuture.com/fapi/v1', private: 'https://testnet.binancefuture.com/fapi/v1' } }
    });

    await ex.loadMarkets();

    const symbol = 'BTC/USDT';
    console.log('BUY 0.001', symbol);
    const buy = await ex.createOrder(symbol, 'market', 'buy', 0.001);
    console.log('BUY id:', buy.id);

    const trades = await ex.fetchMyTrades(symbol, undefined, 5);
    console.log('Recent trades:', trades.map(t => ({ id: t.id, side: t.side, amount: t.amount, price: t.price })));

    console.log('SELL 0.001', symbol);
    await ex.createOrder(symbol, 'market', 'sell', 0.001);
    console.log('Done');
  } catch (e) {
    console.error('TEST FAILED:', e.message);
  }
})();
