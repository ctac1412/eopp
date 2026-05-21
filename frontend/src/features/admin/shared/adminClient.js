export function adminHeaders(token) {
  return { "Content-Type": "application/json", "X-Admin-Token": token };
}

export function adminHeadersJson(token) {
  return { "X-Admin-Token": token };
}
