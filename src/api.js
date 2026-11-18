export async function api(path, options = {}) {
  const { body, ...rest } = options;
  const isForm = body instanceof FormData;
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin', ...rest,
    ...(body !== undefined ? { body: isForm ? body : JSON.stringify(body), headers: isForm ? {} : { 'Content-Type': 'application/json' } } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.');
  return result;
}
