const ccxt = require('ccxt');
require('dotenv').config();
const clean = v => (v ? String(v).trim().replace(/^['"]|['"]$/g, '') : '');

(async () => {
  const apiKey = clean(process.env.BYBIT_API_KEY) || clean(process.env.API_KEY);
  const secret = clean(process.env.BYBIT_API_SECRET) || clean(process.env.API_SECRET);
  const ex = new ccxt.bybit({
    apiKey, secret, enableRateLimit: true,
    options: { defaultType: 'swap', defaultSettle: 'USDT' },
    urls: { api: { public: 'https://api-testnet.bybit.com', private: 'https://api-testnet.bybit.com' } }
  });
  try {
    await ex.loadMarkets();
    const bal = await ex.fetchBalance();
    console.log('Auth OK. Sample USDT bal:', bal.total?.USDT ?? '(n/a)');
  } catch (e) {
    console.log('Auth FAIL:', e.message || String(e));
  }
})();
