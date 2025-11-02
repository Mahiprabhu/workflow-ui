const BASE = ''; // with Vite proxy, '' means same origin → /api is proxied

export async function fetchItems() {
  const res = await fetch('/api/items');
  if (!res.ok) throw new Error('Failed to load items');
  return res.json();
}

export async function patchItem(id, patch) {
  const res = await fetch(`/api/items/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  });
  if (!res.ok) throw new Error('Failed to update item');
  return res.json();
}

export async function addComment(id, { ts, author, text }) {
  const res = await fetch(`/api/items/${id}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ts, author, text })
  });
  if (!res.ok) throw new Error('Failed to add comment');
  return res.json();
}

export async function transitionItem(id, payload) {
  const res = await fetch(`/api/items/${id}/transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Failed to transition item');
  return res.json();
}
