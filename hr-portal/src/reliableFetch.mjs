/**
 * Reliable fetch utility with retry logic for handling intermittent timeouts
 * Server-side implementation using native Node.js fetch (Node 18+)
 *
 * This utility wraps fetch calls with automatic retry logic for specific error conditions,
 * particularly connection resets and timeouts that can occur with OpenID providers.
 */
import https from 'https';
import http from 'http';
import fs from 'fs';

const MAX_FETCH_ATTEMPTS = 2;
const DEFAULT_TIMEOUT = 30000; // 30 seconds

/**
 * Create a secure and reliable HTTPS agent with proper CA trust
 * Automatically trusts custom CA if CUSTOM_CA_PATH or NODE_EXTRA_CA_CERTS is set
 * (for localhost with self-signed certs). Otherwise uses system CA bundle (for production).
 * NEVER disables certificate validation.
 *
 * This is an internal function - all fetch calls automatically use this secure agent.
 *
 * @param {Object} options - Additional agent options
 * @returns {https.Agent} Configured HTTPS agent with proper certificate validation
 */
function createReliableHttpsAgent(options = {}) {
  const agentOptions = {
    keepAlive: true,
    keepAliveMsecs: 30000,
    timeout: DEFAULT_TIMEOUT,
    ...options
  };
  
  // Trust custom CA if provided (for localhost with self-signed certs)
  const customCaPath = process.env.CUSTOM_CA_PATH || process.env.NODE_EXTRA_CA_CERTS;
  if (customCaPath && !agentOptions.ca) {
    try {
      if (fs.existsSync(customCaPath)) {
        const caContent = fs.readFileSync(customCaPath);
        agentOptions.ca = caContent;
        console.log(`[HTTPS-AGENT] Using custom CA certificate from: ${customCaPath} (${caContent.length} bytes)`);
      } else {
        console.warn(`[HTTPS-AGENT] Custom CA path specified but file not found: ${customCaPath}`);
      }
    } catch (error) {
      console.error(`[HTTPS-AGENT] Error reading custom CA certificate: ${error.message}`);
    }
  }
  
  // rejectUnauthorized defaults to true - we NEVER set it to false
  return new https.Agent(agentOptions);
}

/**
 * Create an HTTP agent with extended timeout and keepAlive
 * This is an internal function - all fetch calls automatically use this agent for HTTP.
 *
 * @param {Object} options - Additional agent options
 * @returns {http.Agent} Configured HTTP agent
 */
function createReliableHttpAgent(options = {}) {
  return new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    timeout: DEFAULT_TIMEOUT,
    ...options
  });
}

/**
 * Stringify exception for logging
 * @param {Error} error - The error to stringify
 * @returns {string} String representation of the error
 */
function stringifyException(error) {
  if (!error) return 'Unknown error';
  
  const parts = [];
  if (error.message) parts.push(error.message);
  if (error.code) parts.push(`Code: ${error.code}`);
  if (error.cause?.code) parts.push(`Cause: ${error.cause.code}`);
  
  return parts.length > 0 ? parts.join(' | ') : String(error);
}

/**
 * Determine if an error is retryable
 * @param {Error} error - The error to check
 * @returns {boolean} True if the error should trigger a retry
 */
function isRetryableError(error) {
  // Check for fetch timeout or network errors
  if (error.name === 'AbortError' || error.name === 'TimeoutError') {
    return true;
  }
  
  // Check for TypeError which often indicates network issues
  if (error.name === 'TypeError' && error.message) {
    const msg = error.message.toLowerCase();
    if (msg.includes('fetch') ||
        msg.includes('network') ||
        msg.includes('failed') ||
        msg.includes('timeout')) {
      return true;
    }
  }
  
  // Check for Node.js error codes
  if (error.code) {
    if (error.code === 'ETIMEDOUT' ||
        error.code === 'ECONNRESET' ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ENOTFOUND') {
      return true;
    }
  }
  
  // Check for undici/fetch errors (UND_ERR_SOCKET, etc.)
  if (error.cause?.code === 'UND_ERR_SOCKET' ||
      error.cause?.code === 'ETIMEDOUT' ||
      error.cause?.code === 'ECONNRESET') {
    return true;
  }
  
  return false;
}

/**
 * Create a fetch request with timeout and secure HTTPS agent
 * @param {string|URL|Request} url - The URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} timeout - Timeout in milliseconds
 * @param {https.Agent} [httpsAgent] - Optional HTTPS agent (defaults to secure agent)
 * @returns {Promise<Response>} Promise that resolves to Response
 */
async function fetchWithTimeout(url, options = {}, timeout = DEFAULT_TIMEOUT, httpsAgent = null) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const fetchOptions = {
      ...options,
      signal: controller.signal
    };
    
    // Always use a secure agent for HTTPS requests
    // Handle string URLs, URL objects, and Request objects
    let urlString;
    if (typeof url === 'string') {
      urlString = url;
    } else if (url instanceof URL) {
      urlString = url.href;
    } else if (url instanceof Request) {
      urlString = url.url;
    } else {
      urlString = String(url);
    }
    
    if (urlString.startsWith('https:')) {
      fetchOptions.agent = httpsAgent || createReliableHttpsAgent();
    } else if (urlString.startsWith('http:')) {
      fetchOptions.agent = createReliableHttpAgent();
    }
    
    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    // Add more detailed error information for TLS issues
    if (error.cause) {
      console.error(`[FETCH-ERROR] ${error.message}, Cause: ${error.cause.code || error.cause.message}`);
    }
    throw error;
  }
}

/**
 * Reliable fetch wrapper with automatic retry for connection issues
 * Automatically uses secure HTTPS agent with proper certificate validation
 * @param {string|URL|Request} url - The URL to fetch
 * @param {Object} options - Fetch options
 * @param {Object} retryOptions - Retry configuration options
 * @param {number} retryOptions.maxAttempts - Maximum number of attempts (default: 2)
 * @param {number} retryOptions.timeout - Timeout in milliseconds (default: 30000)
 * @param {Function} retryOptions.onRetry - Callback function called before retry
 * @param {https.Agent} retryOptions.httpsAgent - Optional HTTPS agent override (uses secure agent by default)
 * @returns {Promise<Response>} Promise that resolves to Response
 */
export async function reliableFetch(url, options = {}, retryOptions = {}) {
  const maxAttempts = retryOptions.maxAttempts || MAX_FETCH_ATTEMPTS;
  const timeout = retryOptions.timeout || DEFAULT_TIMEOUT;
  // Use provided agent or let fetchWithTimeout create the default secure agent
  const httpsAgent = retryOptions.httpsAgent || null;
  const onRetry = retryOptions.onRetry || ((attempt, error) => {
    // Silent retry - no console output
  });
  
  let lastException;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fetchWithTimeout(url, options, timeout, httpsAgent);
    } catch (error) {
      lastException = error;
      
      // Log the attempt
      if (attempt < maxAttempts) {
        onRetry(attempt, error);
      }
      
      // Check if we should retry
      if (attempt < maxAttempts && isRetryableError(error)) {
        // Add a small delay before retry (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // Don't retry for other errors or if we've exhausted attempts
      break;
    }
  }
  
  // If we get here, all attempts failed
  throw lastException;
}

/**
 * Reliable fetch wrapper that returns JSON
 * @param {string|URL|Request} url - The URL to fetch
 * @param {Object} options - Fetch options
 * @param {Object} retryOptions - Retry configuration options
 * @returns {Promise<any>} Promise that resolves to parsed JSON
 */
export async function reliableFetchJson(url, options = {}, retryOptions = {}) {
  const response = await reliableFetch(url, options, retryOptions);
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return await response.json();
}

/**
 * Reliable fetch wrapper for GET requests
 * @param {string|URL|Request} url - The URL to fetch
 * @param {Object} options - Fetch options
 * @param {Object} retryOptions - Retry configuration options
 * @returns {Promise<Response>} Promise that resolves to Response
 */
export async function reliableFetchGet(url, options = {}, retryOptions = {}) {
  return reliableFetch(url, { ...options, method: 'GET' }, retryOptions);
}

/**
 * Reliable fetch wrapper for POST requests
 * @param {string|URL|Request} url - The URL to fetch
 * @param {any} body - Request body
 * @param {Object} options - Fetch options
 * @param {Object} retryOptions - Retry configuration options
 * @returns {Promise<Response>} Promise that resolves to Response
 */
export async function reliableFetchPost(url, body, options = {}, retryOptions = {}) {
  return reliableFetch(url, { ...options, method: 'POST', body }, retryOptions);
}

export default {
  reliableFetch,
  reliableFetchJson,
  reliableFetchGet,
  reliableFetchPost
};