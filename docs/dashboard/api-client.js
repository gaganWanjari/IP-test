/**
 * Trinity Dashboard API Client
 * Provides retry with exponential backoff for data fetching.
 * Works with any HTTP endpoint (data.json, internal proxy, etc.).
 */

/* ── Retry Configuration ── */
const DEFAULT_RETRY_OPTIONS = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  retryableStatuses: [429, 500, 502, 503, 504],
};

/**
 * Calculate delay with exponential backoff and jitter.
 * @param {number} attempt - Zero-based attempt number.
 * @param {number} baseDelayMs - Base delay in milliseconds.
 * @param {number} maxDelayMs - Maximum delay cap.
 * @returns {number} Delay in milliseconds.
 */
function calculateBackoff(attempt, baseDelayMs, maxDelayMs) {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * baseDelayMs * 0.5;
  return Math.min(exponentialDelay + jitter, maxDelayMs);
}

/**
 * Determine if an HTTP response status is retryable.
 * @param {number} status - HTTP status code.
 * @param {number[]} retryableStatuses - List of retryable status codes.
 * @returns {boolean}
 */
function isRetryableStatus(status, retryableStatuses) {
  return retryableStatuses.includes(status);
}

/**
 * Sleep for a given number of milliseconds.
 * @param {number} ms - Milliseconds to wait.
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch with bounded retry and exponential backoff.
 * Works with any URL — data.json, internal proxy, etc.
 * @param {string} url - URL to fetch.
 * @param {RequestInit} [options] - Fetch options.
 * @param {object} [retryOptions] - Retry configuration overrides.
 * @param {function} [onRetry] - Callback before each retry: (attempt, delayMs, status) => void.
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options, retryOptions, onRetry) {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...retryOptions };
  let lastError = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const resp = await fetch(url, options);

      if (isRetryableStatus(resp.status, config.retryableStatuses)) {
        if (attempt < config.maxRetries) {
          const delayMs = calculateBackoff(attempt, config.baseDelayMs, config.maxDelayMs);
          if (onRetry) onRetry(attempt + 1, delayMs, resp.status);
          await sleep(delayMs);
          continue;
        }
        const err = new Error(`Server error ${resp.status} after ${config.maxRetries} retries`);
        err.status = resp.status;
        err.retriesExhausted = true;
        throw err;
      }

      return resp;
    } catch (err) {
      // Network errors (fetch rejects) are retryable
      if (err.name === 'TypeError' && attempt < config.maxRetries) {
        const delayMs = calculateBackoff(attempt, config.baseDelayMs, config.maxDelayMs);
        if (onRetry) onRetry(attempt + 1, delayMs, 0);
        lastError = err;
        await sleep(delayMs);
        continue;
      }

      if (err.retriesExhausted) throw err;

      if (lastError && err.name === 'TypeError') {
        const wrapped = new Error(`Network error after ${config.maxRetries} retries: ${err.message}`);
        wrapped.retriesExhausted = true;
        throw wrapped;
      }
      throw err;
    }
  }

  throw lastError || new Error('Unexpected retry loop exit');
}

/**
 * Build a user-friendly error message for dashboard display.
 * @param {Error} error - The error that occurred.
 * @returns {string} HTML guidance string.
 */
function buildErrorGuidance(error) {
  if (error.retriesExhausted) {
    return `<strong>Request failed after multiple retries.</strong><br>` +
      `<strong>Options:</strong><ul>` +
      `<li>Check your network connection and try again.</li>` +
      `<li>Verify the <b>data.json</b> file exists — run the "Contribution Dashboard - Export Data" workflow.</li>` +
      `</ul>`;
  }

  if (/not found|404/i.test(error.message)) {
    return `<strong>Data file not found.</strong><br>` +
      `<strong>Options:</strong><ul>` +
      `<li>Run the <b>"Contribution Dashboard - Export Data"</b> workflow to generate data.json.</li>` +
      `<li>Check that the file is deployed alongside the dashboard.</li>` +
      `</ul>`;
  }

  return `<strong>Failed to load data:</strong> ${error.message}<br>` +
    `<strong>Options:</strong><ul>` +
    `<li>Check your network connection and try again.</li>` +
    `<li>Run the <b>"Contribution Dashboard - Export Data"</b> workflow to refresh data.</li>` +
    `</ul>`;
}

// Export for testing (CommonJS / Node.js) or make available globally (browser)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calculateBackoff,
    isRetryableStatus,
    fetchWithRetry,
    buildErrorGuidance,
    sleep,
    DEFAULT_RETRY_OPTIONS,
  };
}
