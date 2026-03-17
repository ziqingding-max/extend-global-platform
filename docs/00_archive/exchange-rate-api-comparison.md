# Exchange Rate API Comparison for EOR SaaS

## Summary

We need exchange rate data for **99 unique currencies** across 125 countries. Below is a comparison of viable API providers.

## API Comparison

| Provider | Currencies | Free Tier | Update Freq | Rate Limit (Free) | API Key Required | Notes |
|---|---|---|---|---|---|---|
| **ExchangeRate-API** (open.er-api.com) | **166** | Yes (Open Access) | Daily | Rate-limited (1 req/24h safe) | No | **Covers all 99/99 currencies.** Attribution required. Reliable 15+ years. |
| **ExchangeRate-API** (Free Plan) | **166** | Yes | Daily | 1,500 req/month | Yes (free signup) | Same data, no attribution needed. |
| **ExchangeRate-API** (Pro) | **166** | $10/mo | Every 60 min | 30,000 req/month | Yes | Best for production use. |
| **Fixer.io** | **170** | Yes (limited) | Daily | 100 req/month | Yes | Only EUR base on free tier. Owned by APILayer. |
| **Currencyapi.com** | **170+** | Yes | Daily | 300 req/month | Yes | Good coverage, generous free tier. |
| **Open Exchange Rates** | **200+** | Yes | Hourly | 1,000 req/month | Yes | Most currencies. USD base only on free tier. |
| **Frankfurter** | **30** | Yes (open) | Daily | Unlimited | No | ECB data only. Too few currencies for our needs. |
| **AbstractAPI** | **80+** | Yes | Daily | 20,000 req/month | Yes | Decent but fewer currencies. |

## Recommendation

### Primary: ExchangeRate-API (Open Access)
- **URL:** `https://open.er-api.com/v6/latest/USD`
- **Coverage:** 166 currencies — covers **all 99** of our required currencies
- **Cost:** Free, no API key needed
- **Update:** Daily (sufficient for EOR payroll; we only need monthly rates)
- **Reliability:** 15+ years track record, excellent uptime

### Backup 1: Currencyapi.com
- **URL:** `https://api.currencyapi.com/v3/latest`
- **Coverage:** 170+ currencies
- **Cost:** Free tier (300 req/month), paid plans from $9.99/mo
- **API Key:** Required (free signup)
- **Good for:** If ExchangeRate-API becomes unavailable

### Backup 2: Open Exchange Rates
- **URL:** `https://openexchangerates.org/api/latest.json`
- **Coverage:** 200+ currencies (most comprehensive)
- **Cost:** Free tier (1,000 req/month), paid from $12/mo
- **API Key:** Required (free signup)
- **Limitation:** USD base only on free tier (fine for us since we use USD as base)

## Implementation Notes

1. Our existing `exchange_rates` table stores rates with `baseCurrency` and `targetCurrency` fields
2. We should fetch rates daily via a cron job or on-demand when processing payroll
3. The ExchangeRate-API open endpoint returns all rates in a single call (no need for per-currency requests)
4. For payroll, we typically lock the exchange rate at the time of payroll processing
5. Current system already has an exchange rate fetch mechanism — we just need to ensure the API covers all currencies (which ExchangeRate-API does)
