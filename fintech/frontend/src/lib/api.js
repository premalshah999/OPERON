const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

async function fetchJson(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    ...options,
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const payload = await response.json();
      message = payload.detail ?? payload.message ?? message;
    } catch {
      // Ignore non-JSON error payloads.
    }
    throw new Error(message);
  }

  return response.json();
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export function getDashboardStats() {
  return fetchJson("/api/dashboard/stats");
}

export function getDashboardTrends(days = 14) {
  return fetchJson(`/api/dashboard/trends?days=${days}`);
}

export function getComplaints(limit = 20) {
  return fetchJson(`/api/complaints?limit=${limit}`);
}

export function getComplaint(complaintId) {
  return fetchJson(`/api/complaints/${complaintId}`);
}

export function getAuditTrail(complaintId) {
  return fetchJson(`/api/audit/${complaintId}`);
}

export function getSampleComplaints() {
  return fetchJson("/api/complaints/samples");
}

export function submitComplaint(payload) {
  return fetchJson("/api/complaints/analyze", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
