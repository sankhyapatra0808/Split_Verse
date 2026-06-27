import { Router } from "express";
import { db } from "../config/db.js";
const router = Router();
const supportedCurrencies = [
    "INR",
    "CAD",
    "USD",
    "EUR",
    "GBP",
    "AED",
    "AUD",
    "SGD",
    "CHF",
    "JPY",
    "CNY",
];
const supportedCurrencySet = new Set(supportedCurrencies);
const fallbackRatesFromInr = {
    INR: 1,
    CAD: 0.0165,
    USD: 0.01057,
    EUR: 0.011,
    GBP: 0.0095,
    AED: 0.03884,
    AUD: 0.018,
    SGD: 0.016,
    CHF: 0.0098,
    JPY: 1.87,
    CNY: 0.086,
};
function getNumberEnv(name, fallback) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}
function getProvider() {
    return process.env.EXCHANGE_RATE_PROVIDER || "frankfurter";
}
function getCacheTtlMinutes() {
    return getNumberEnv("EXCHANGE_RATE_CACHE_TTL_MINUTES", 360);
}
function getStaleFallbackHours() {
    return getNumberEnv("EXCHANGE_RATE_STALE_FALLBACK_HOURS", 168);
}
function normalizeCurrency(value, fallback) {
    const normalized = String(value || fallback).trim().toUpperCase();
    return supportedCurrencySet.has(normalized)
        ? normalized
        : fallback;
}
function normalizeSymbols(value, baseCurrency) {
    const rawSymbols = String(value || "")
        .split(",")
        .map((symbol) => symbol.trim().toUpperCase())
        .filter(Boolean);
    const symbols = rawSymbols.length > 0 ? rawSymbols : [...supportedCurrencies];
    return Array.from(new Set(symbols.filter((symbol) => supportedCurrencySet.has(symbol) && symbol !== baseCurrency)));
}
function getFallbackRate(baseCurrency, targetCurrency) {
    const baseRate = fallbackRatesFromInr[baseCurrency] || 1;
    const targetRate = fallbackRatesFromInr[targetCurrency] || 1;
    return targetRate / baseRate;
}
function rowsToRates(baseCurrency, targetCurrencies, rows) {
    const rates = {
        [baseCurrency]: 1,
    };
    const rowMap = new Map(rows.map((row) => [row.target_currency, row]));
    targetCurrencies.forEach((currency) => {
        const row = rowMap.get(currency);
        const rate = Number(row?.rate);
        if (Number.isFinite(rate) && rate > 0) {
            rates[currency] = rate;
        }
    });
    return rates;
}
function fallbackPayload(baseCurrency, targetCurrencies) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + getCacheTtlMinutes() * 60_000);
    const rates = {
        [baseCurrency]: 1,
    };
    targetCurrencies.forEach((currency) => {
        rates[currency] = getFallbackRate(baseCurrency, currency);
    });
    return {
        base: baseCurrency,
        rates,
        source: "fallback",
        provider: getProvider(),
        fetchedAt: null,
        expiresAt: expiresAt.toISOString(),
    };
}
async function getCachedRows(baseCurrency, targetCurrencies, stale = false) {
    if (targetCurrencies.length === 0) {
        return [];
    }
    const staleWindow = `${getStaleFallbackHours()} hours`;
    const result = await db.query(`
    SELECT target_currency, rate, provider, fetched_at, expires_at
    FROM exchange_rate_cache
    WHERE base_currency = $1
    AND target_currency = ANY($2::text[])
    ${stale ? "AND fetched_at >= NOW() - $3::interval" : "AND expires_at > NOW()"}
    ORDER BY fetched_at DESC;
    `, stale ? [baseCurrency, targetCurrencies, staleWindow] : [baseCurrency, targetCurrencies]);
    return result.rows;
}
function rowsCoverAllTargets(rows, targetCurrencies) {
    const cachedTargets = new Set(rows.map((row) => row.target_currency));
    return targetCurrencies.every((currency) => cachedTargets.has(currency));
}
function getRowsMetadata(rows) {
    const sortedByFetched = [...rows].sort((left, right) => new Date(right.fetched_at).getTime() - new Date(left.fetched_at).getTime());
    const sortedByExpiry = [...rows].sort((left, right) => new Date(left.expires_at).getTime() - new Date(right.expires_at).getTime());
    return {
        provider: sortedByFetched[0]?.provider || getProvider(),
        fetchedAt: sortedByFetched[0]
            ? new Date(sortedByFetched[0].fetched_at).toISOString()
            : null,
        expiresAt: sortedByExpiry[0]
            ? new Date(sortedByExpiry[0].expires_at).toISOString()
            : null,
    };
}
function buildFrankfurterUrl(endpoint, baseCurrency, targetCurrencies, apiKey) {
    const url = new URL(endpoint);
    url.searchParams.set("from", baseCurrency);
    url.searchParams.set("to", targetCurrencies.join(","));
    if (apiKey) {
        url.searchParams.set("apikey", apiKey);
    }
    return url;
}
function buildOpenExchangeRateUrl(endpoint, baseCurrency, apiKey) {
    const normalizedEndpoint = endpoint.replace(/\/+$/, "");
    const url = new URL(`${normalizedEndpoint}/${baseCurrency}`);
    if (apiKey) {
        url.searchParams.set("apikey", apiKey);
    }
    return url;
}
function shouldUseOpenExchangeRateShape(provider, endpoint) {
    const normalizedProvider = provider.toLowerCase();
    const normalizedEndpoint = endpoint.toLowerCase();
    return (normalizedProvider.includes("open-er") ||
        normalizedProvider.includes("open_exchange") ||
        normalizedEndpoint.includes("open.er-api.com") ||
        normalizedEndpoint.includes("/v6/latest"));
}
async function fetchProviderRates(provider, endpoint, apiKey, baseCurrency, targetCurrencies) {
    const url = shouldUseOpenExchangeRateShape(provider, endpoint)
        ? buildOpenExchangeRateUrl(endpoint, baseCurrency, apiKey)
        : buildFrankfurterUrl(endpoint, baseCurrency, targetCurrencies, apiKey);
    const response = await fetch(url, {
        headers: {
            Accept: "application/json",
        },
    });
    if (!response.ok) {
        throw new Error(`Exchange-rate provider ${provider} failed with status ${response.status}`);
    }
    const data = (await response.json());
    if (data.result && data.result !== "success") {
        throw new Error(`Exchange-rate provider ${provider} returned ${data.result}`);
    }
    const rates = {
        [baseCurrency]: 1,
    };
    targetCurrencies.forEach((currency) => {
        const rate = Number(data.rates?.[currency]);
        if (Number.isFinite(rate) && rate > 0) {
            rates[currency] = rate;
        }
    });
    return { rates, provider };
}
function getMissingCurrencies(rates, targetCurrencies) {
    return targetCurrencies.filter((currency) => !Number.isFinite(rates[currency]) || rates[currency] <= 0);
}
async function fetchFreshRates(baseCurrency, targetCurrencies) {
    const provider = getProvider();
    const endpoint = process.env.EXCHANGE_RATE_API_URL || "https://api.frankfurter.app/latest";
    const apiKey = process.env.EXCHANGE_RATE_API_KEY || "";
    const fallbackProvider = "open-er-api";
    const fallbackEndpoint = "https://open.er-api.com/v6/latest";
    let mergedRates = {
        [baseCurrency]: 1,
    };
    const usedProviders = [];
    let primaryError = null;
    try {
        const primary = await fetchProviderRates(provider, endpoint, apiKey, baseCurrency, targetCurrencies);
        mergedRates = {
            ...mergedRates,
            ...primary.rates,
        };
        usedProviders.push(primary.provider);
    }
    catch (error) {
        primaryError = error;
    }
    const missingAfterPrimary = getMissingCurrencies(mergedRates, targetCurrencies);
    if (missingAfterPrimary.length > 0) {
        try {
            const fallback = await fetchProviderRates(fallbackProvider, fallbackEndpoint, "", baseCurrency, missingAfterPrimary);
            mergedRates = {
                ...mergedRates,
                ...fallback.rates,
            };
            usedProviders.push(fallback.provider);
        }
        catch (fallbackError) {
            if (primaryError) {
                throw primaryError;
            }
            throw fallbackError;
        }
    }
    const missingCurrency = getMissingCurrencies(mergedRates, targetCurrencies)[0];
    if (missingCurrency) {
        throw new Error(`Exchange-rate providers returned incomplete rate for ${missingCurrency}`);
    }
    return {
        rates: mergedRates,
        provider: Array.from(new Set(usedProviders)).join("+") || provider,
    };
}
async function saveRates(baseCurrency, targetCurrencies, rates, provider) {
    const expiresAt = new Date(Date.now() + getCacheTtlMinutes() * 60_000);
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        for (const currency of targetCurrencies) {
            const rate = Number(rates[currency]);
            if (!Number.isFinite(rate) || rate <= 0) {
                continue;
            }
            await client.query(`
        INSERT INTO exchange_rate_cache (
          base_currency,
          target_currency,
          rate,
          provider,
          fetched_at,
          expires_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, NOW(), $5, NOW())
        ON CONFLICT (base_currency, target_currency)
        DO UPDATE SET
          rate = EXCLUDED.rate,
          provider = EXCLUDED.provider,
          fetched_at = EXCLUDED.fetched_at,
          expires_at = EXCLUDED.expires_at,
          updated_at = NOW();
        `, [baseCurrency, currency, rate, provider, expiresAt]);
        }
        await client.query("COMMIT");
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
    return expiresAt;
}
router.get("/", async (req, res) => {
    const baseCurrency = normalizeCurrency(req.query.base, "INR");
    const targetCurrencies = normalizeSymbols(req.query.symbols, baseCurrency);
    if (targetCurrencies.length === 0) {
        return res.json({
            base: baseCurrency,
            rates: { [baseCurrency]: 1 },
            source: "cache",
            provider: getProvider(),
            fetchedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + getCacheTtlMinutes() * 60_000).toISOString(),
        });
    }
    try {
        const cachedRows = await getCachedRows(baseCurrency, targetCurrencies);
        if (rowsCoverAllTargets(cachedRows, targetCurrencies)) {
            const metadata = getRowsMetadata(cachedRows);
            return res.json({
                base: baseCurrency,
                rates: rowsToRates(baseCurrency, targetCurrencies, cachedRows),
                source: "cache",
                ...metadata,
            });
        }
        const fresh = await fetchFreshRates(baseCurrency, targetCurrencies);
        const expiresAt = await saveRates(baseCurrency, targetCurrencies, fresh.rates, fresh.provider);
        return res.json({
            base: baseCurrency,
            rates: fresh.rates,
            source: "live",
            provider: fresh.provider,
            fetchedAt: new Date().toISOString(),
            expiresAt: expiresAt.toISOString(),
        });
    }
    catch (error) {
        console.error("Exchange-rate lookup failed:", error);
        try {
            const staleRows = await getCachedRows(baseCurrency, targetCurrencies, true);
            if (rowsCoverAllTargets(staleRows, targetCurrencies)) {
                const metadata = getRowsMetadata(staleRows);
                return res.json({
                    base: baseCurrency,
                    rates: rowsToRates(baseCurrency, targetCurrencies, staleRows),
                    source: "stale-cache",
                    ...metadata,
                });
            }
        }
        catch (staleError) {
            console.error("Stale exchange-rate lookup failed:", staleError);
        }
        return res.json(fallbackPayload(baseCurrency, targetCurrencies));
    }
});
export default router;
