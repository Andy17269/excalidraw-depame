export async function fetchDeepSeek(url: string, options: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try { return await globalThis.fetch(url, options); }
    catch (error) {
      if (attempt >= 3 || options.signal?.aborted || !(error instanceof TypeError)) throw error;
      await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
}
