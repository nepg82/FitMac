// github-api.js — Minimal GitHub REST API helper for backup/restore.
// Auth happens via a Personal Access Token entered locally by the user —
// no backend server involved.

const GitHubAPI = (() => {
    const API_BASE = "https://api.github.com";
    const REQUEST_TIMEOUT_MS = 15000;

    function unicodeToBase64(str) {
        const bytes = new TextEncoder().encode(str);
        let binary = "";
        bytes.forEach(b => { binary += String.fromCharCode(b); });
        return btoa(binary);
    }

    function base64ToUnicode(b64) {
        const binary = atob(b64.replace(/\n/g, ""));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    }

    async function request(path, { method = "GET", token, body } = {}) {

        // Live data calls (unlike the service worker's cached static assets)
        // have no stale copy to fall back to, so on a dead/laggy connection
        // the right move is to fail fast with a clear message rather than
        // hang on the browser's own (much longer) default timeout — that's
        // what left callers like the "Backing up…" button looking frozen.
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        let res;
        try {
            res = await fetch(`${API_BASE}${path}`, {
                method,
                signal: controller.signal,
                headers: {
                    "Accept": "application/vnd.github+json",
                    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
                    ...(body ? { "Content-Type": "application/json" } : {})
                },
                body: body ? JSON.stringify(body) : undefined
            });
        } catch (e) {
            if (e.name === "AbortError") {
                throw new Error("GitHub request timed out — check your connection and try again.");
            }
            throw e;
        } finally {
            clearTimeout(timer);
        }

        if (!res.ok) {
            let detail = "";
            try { detail = (await res.json()).message; } catch (_) {}
            throw new Error(`GitHub API ${res.status}${detail ? ": " + detail : ""}`);
        }

        return res.status === 204 ? null : res.json();
    }

    // Fetch a repo file. Returns { json, sha } for JSON files, or null if missing.
    async function getJsonFile({ owner, repo, path, token, branch }) {
        try {
            const data = await request(
                `/repos/${owner}/${repo}/contents/${path}${branch ? `?ref=${branch}` : ""}`,
                { token }
            );
            const text = base64ToUnicode(data.content);
            return { json: JSON.parse(text), sha: data.sha };
        } catch (e) {
            if (String(e.message).includes("404")) return null;
            throw e;
        }
    }

    // Write (create or update) a JSON file.
    async function putJsonFile({ owner, repo, path, token, branch, json, sha, message }) {
        const content = unicodeToBase64(JSON.stringify(json, null, 2));
        return request(`/repos/${owner}/${repo}/contents/${path}`, {
            method: "PUT",
            token,
            body: {
                message: message || `Update ${path}`,
                content,
                sha: sha || undefined,
                branch: branch || undefined
            }
        });
    }

    // Quick credential/repo check — confirms the token can see the repo.
    async function verifyAccess({ owner, repo, token }) {
        return request(`/repos/${owner}/${repo}`, { token });
    }

    // List files in a directory (e.g. "data") — used for the multi-user admin view.
    // Returns [] if the directory doesn't exist yet (no backups pushed yet).
    async function listDirectory({ owner, repo, path, token, branch }) {
        try {
            const data = await request(
                `/repos/${owner}/${repo}/contents/${path}${branch ? `?ref=${branch}` : ""}`,
                { token }
            );
            // GitHub returns an array for directories, an object for single files
            return Array.isArray(data) ? data : [data];
        } catch (e) {
            if (String(e.message).includes("404")) return [];
            throw e;
        }
    }

    return { getJsonFile, putJsonFile, verifyAccess, listDirectory };
})();