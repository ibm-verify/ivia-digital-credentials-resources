import { reliableFetch } from '../reliableFetch';

class DiagencyApiService {
  private processRequestBody(body: any, headers?: Record<string, string>): any {
    if (body instanceof URLSearchParams) {
      return body;
    }

    if (typeof body === 'string') {
      const contentType = headers?.['Content-Type'] || '';
      if (contentType.includes('application/json')) {
        JSON.parse(body);
      }
      return body;
    }

    return JSON.stringify(body);
  }

  async request<T = any>(path: string, options: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
  } = {}): Promise<T> {
    const url = path.startsWith('/') ? path : `/${path}`;
    const fetchOptions: RequestInit = {
      method: options.method || 'GET',
      headers: options.headers || {},
      redirect: 'follow',
      credentials: 'include',
    };

    if (options.body) {
      fetchOptions.body = this.processRequestBody(options.body, options.headers);
    }

    const response = await reliableFetch(url, fetchOptions);
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  async authenticatedRequest<T = any>(path: string, options: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
  } = {}): Promise<T> {
    return this.request<T>(path, options);
  }

  async authenticatedRawRequest(path: string, options: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
  } = {}): Promise<Response> {
    const url = path.startsWith('/') ? path : `/${path}`;
    const fetchOptions: RequestInit = {
      method: options.method || 'GET',
      headers: options.headers || {},
      redirect: 'follow',
      credentials: 'include',
    };

    if (options.body) {
      fetchOptions.body = this.processRequestBody(options.body, options.headers);
    }

    const response = await reliableFetch(url, fetchOptions);
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return response;
  }
}

const diagencyApiService = new DiagencyApiService();

export default diagencyApiService;