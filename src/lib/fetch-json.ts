// =============================================================
// NEXIROLE — Client HTTP frontend « jamais de crash JSON »
// Correctif de l'erreur :
// « Failed to execute 'json' on 'Response': Unexpected end of JSON input »
// =============================================================

export interface FetchResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<FetchResult<T>> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

    const raw = await response.text();
    let data: T | null = null;
    let error: string | null = null;

    if (raw.length > 0) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (response.ok) {
          data = parsed as T;
        } else if (isErrorPayload(parsed)) {
          error = parsed.error;
        } else {
          error = `Erreur ${response.status}.`;
        }
      } catch {
        error = `Réponse invalide du serveur (HTTP ${response.status}).`;
      }
    } else if (!response.ok) {
      error = `Erreur ${response.status} (réponse vide du serveur).`;
    }

    return { ok: response.ok && error === null, status: response.status, data, error };
  } catch (caught) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: caught instanceof Error ? caught.message : "Erreur réseau inconnue.",
    };
  }
}

function isErrorPayload(parsed: unknown): parsed is { error: string } {
  return (
    typeof parsed === "object" &&
    parsed !== null &&
    "error" in parsed &&
    typeof (parsed as { error?: unknown }).error === "string"
  );
}

export function postJson<T>(url: string, body: unknown): Promise<FetchResult<T>> {
  return fetchJson<T>(url, { method: "POST", body: JSON.stringify(body) });
}

export function patchJson<T>(url: string, body: unknown): Promise<FetchResult<T>> {
  return fetchJson<T>(url, { method: "PATCH", body: JSON.stringify(body) });
}

export function deleteJson<T>(url: string): Promise<FetchResult<T>> {
  return fetchJson<T>(url, { method: "DELETE" });
}