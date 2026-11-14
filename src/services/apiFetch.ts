/** Retries a frontend `/api/...` fetch once when a pooled local connector disconnects transiently. */
export async function fetchApi(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (init?.signal?.aborted || !(error instanceof TypeError)) throw error;
    await new Promise(resolve => setTimeout(resolve, 250));
    if (init?.signal?.aborted) throw error;
    return fetch(input, init);
  }
}
