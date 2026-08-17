/**
 * Reliable fetch utility with retry logic for handling intermittent timeouts
 * Browser-side implementation using native fetch API
 * 
 * This utility wraps fetch calls with automatic retry logic for specific error conditions,
 * particularly connection resets and timeouts that can occur with OpenID providers.
 */

const MAX_FETCH_ATTEMPTS = 2;
const DEFAULT_TIMEOUT = 30000; // 30 seconds

/**
 * Stringify exception for logging
 * @param error - The error to stringify
 * @returns String representation of the error
 */
function stringifyException(error: any): string {
  if (!error) return 'Unknown error';
  
  const parts: string[] = [];
  if (error.message) parts.push(error.message);
  if (error.name) parts.push(`Type: ${error.name}`);
  if (error.cause?.code) parts.push(`Cause: ${error.cause.code}`);
  
  return parts.length > 0 ? parts.join(' | ') : String(error);
}

/**
 * Determine if an error is retryable
 * @param error - The error to check
 * @returns True if the error should trigger a retry
 */
function isRetryableError(error: any): boolean {
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
  
  // Check for undici/fetch errors (UND_ERR_SOCKET, ETIMEDOUT, etc.)
  if (error.cause?.code === 'UND_ERR_SOCKET' || 
      error.cause?.code === 'ETIMEDOUT' ||
      error.cause?.code === 'ECONNRESET') {
    return true;
  }
  
  return false;
}

/**
 * Create a fetch request with timeout
 * @param url - The URL to fetch
 * @param options - Fetch options
 * @param timeout - Timeout in milliseconds
 * @returns Promise that resolves to Response
 */
async function fetchWithTimeout(
  url: string | URL | Request,
  options: RequestInit = {},
  timeout: number = DEFAULT_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Reliable fetch wrapper with automatic retry for connection issues
 * @param url - The URL to fetch
 * @param options - Fetch options
 * @param retryOptions - Retry configuration options
 * @returns Promise that resolves to Response
 */
export async function reliableFetch(
  url: string | URL | Request,
  options: RequestInit = {},
  retryOptions: {
    maxAttempts?: number;
    timeout?: number;
    onRetry?: (attempt: number, error: any) => void;
  } = {}
): Promise<Response> {
  const maxAttempts = retryOptions.maxAttempts || MAX_FETCH_ATTEMPTS;
  const timeout = retryOptions.timeout || DEFAULT_TIMEOUT;
  const onRetry = retryOptions.onRetry || ((attempt: number, error: any) => {
    // Silent retry - no console output
  });
  
  let lastException: any;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fetchWithTimeout(url, options, timeout);
    } catch (error: any) {
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
 * @param url - The URL to fetch
 * @param options - Fetch options
 * @param retryOptions - Retry configuration options
 * @returns Promise that resolves to parsed JSON
 */
export async function reliableFetchJson<T = any>(
  url: string | URL | Request,
  options: RequestInit = {},
  retryOptions: {
    maxAttempts?: number;
    timeout?: number;
    onRetry?: (attempt: number, error: any) => void;
  } = {}
): Promise<T> {
  const response = await reliableFetch(url, options, retryOptions);
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return await response.json();
}

/**
 * Reliable fetch wrapper for GET requests
 * @param url - The URL to fetch
 * @param options - Fetch options
 * @param retryOptions - Retry configuration options
 * @returns Promise that resolves to Response
 */
export async function reliableFetchGet(
  url: string | URL | Request,
  options: RequestInit = {},
  retryOptions: {
    maxAttempts?: number;
    timeout?: number;
    onRetry?: (attempt: number, error: any) => void;
  } = {}
): Promise<Response> {
  return reliableFetch(url, { ...options, method: 'GET' }, retryOptions);
}

/**
 * Reliable fetch wrapper for POST requests
 * @param url - The URL to fetch
 * @param body - Request body
 * @param options - Fetch options
 * @param retryOptions - Retry configuration options
 * @returns Promise that resolves to Response
 */
export async function reliableFetchPost(
  url: string | URL | Request,
  body?: BodyInit | null,
  options: RequestInit = {},
  retryOptions: {
    maxAttempts?: number;
    timeout?: number;
    onRetry?: (attempt: number, error: any) => void;
  } = {}
): Promise<Response> {
  return reliableFetch(url, { ...options, method: 'POST', body }, retryOptions);
}

export default {
  reliableFetch,
  reliableFetchJson,
  reliableFetchGet,
  reliableFetchPost,
  isRetryableError
};