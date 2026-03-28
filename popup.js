const STORAGE_KEY = "submissions";

// ─── Token Management ───────────────────────────────────────

function generateTokenString() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let token = "";
    for (let i = 0; i < 8; i++) {
        token += chars[Math.floor(Math.random() * chars.length)];
    }
    return token;
}

async function getSyncToken() {
    const result = await chrome.storage.local.get(TOKEN_STORAGE_KEY);
    return result[TOKEN_STORAGE_KEY] || null;
}

async function saveSyncToken(token) {
    await chrome.storage.local.set({ [TOKEN_STORAGE_KEY]: token });
}

async function clearSyncToken() {
    await chrome.storage.local.remove(TOKEN_STORAGE_KEY);
}

// ─── Supabase API Helpers ───────────────────────────────────

async function supabaseCall(endpoint, options = {}) {
    const defaults = {
        headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_CONFIG.ANON_KEY,
            "Authorization": `Bearer ${SUPABASE_CONFIG.ANON_KEY}`,
        },
    };

    const response = await fetch(endpoint, {
        ...defaults,
        ...options,
        headers: { ...defaults.headers, ...options.headers },
    });

    return response.json();
}

async function createTokenInSupabase(token) {
    // Insert directly into the tokens table via REST API
    const response = await fetch(`${SUPABASE_CONFIG.URL}/rest/v1/tokens`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_CONFIG.ANON_KEY,
            "Authorization": `Bearer ${SUPABASE_CONFIG.ANON_KEY}`,
            "Prefer": "return=representation",
        },
        body: JSON.stringify({ token }),
    });

    if (!response.ok) {
        throw new Error("Failed to create token");
    }

    return response.json();
}

async function validateTokenInSupabase(token) {
    const response = await fetch(
        `${SUPABASE_CONFIG.URL}/rest/v1/tokens?token=eq.${encodeURIComponent(token)}&select=id,token`,
        {
            headers: {
                "apikey": SUPABASE_CONFIG.ANON_KEY,
                "Authorization": `Bearer ${SUPABASE_CONFIG.ANON_KEY}`,
            },
        }
    );

    const data = await response.json();
    return data && data.length > 0;
}

async function fetchSubmissionsFromCloud(token) {
    try {
        const data = await supabaseCall(SUPABASE_FUNCTIONS.GET_SUBMISSIONS, {
            method: "GET",
            headers: { "x-sync-token": token },
        });

        if (data.success && data.submissions) {
            return data.submissions;
        }
    } catch (err) {
        console.error("Cloud fetch failed:", err);
    }
    return null;
}

async function markSubmittedInCloud(token, submissionKey) {
    try {
        await supabaseCall(SUPABASE_FUNCTIONS.MARK_SUBMITTED, {
            method: "POST",
            body: JSON.stringify({ token, submission_key: submissionKey }),
        });
    } catch (err) {
        console.error("Cloud mark-submitted failed:", err);
    }
}

// ─── Urgency & Formatting ───────────────────────────────────

function getUrgency(dueDateStr) {
    const now = new Date();
    const due = new Date(dueDateStr);
    const hoursLeft = (due - now) / (1000 * 60 * 60);

    if (hoursLeft < 0) return { label: "Overdue", class: "urgent" };
    if (hoursLeft < 24) return { label: "Due today", class: "urgent" };
    if (hoursLeft < 72) return { label: "Due soon", class: "soon" };
    return { label: "Upcoming", class: "safe" };
}

function formatDate(dateStr) {
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return dateStr;
    }
}

// ─── UI State Management ────────────────────────────────────

function showTokenSetup() {
    document.getElementById("token-section").style.display = "block";
    document.getElementById("token-display").style.display = "none";
}

function showTokenDisplay(token) {
    document.getElementById("token-section").style.display = "none";
    document.getElementById("token-display").style.display = "block";
    document.getElementById("token-value").textContent = token;
}

function showStatus(message, type = "info") {
    const counter = document.getElementById("counter");
    counter.textContent = message;
    if (type === "error") counter.style.color = "#f87171";
    else if (type === "success") counter.style.color = "#34d399";
    else counter.style.color = "";
}

// ─── Render Submissions ─────────────────────────────────────

async function render() {
    const list = document.getElementById("list");
    const counter = document.getElementById("counter");
    list.innerHTML = "";

    const token = await getSyncToken();

    if (!token) {
        showTokenSetup();
        counter.textContent = "Setup required";
        list.innerHTML = `
            <div class="empty-state">
                <span class="emoji">🔗</span>
                <div class="empty-title">No token linked</div>
                <div class="empty-sub">Generate or enter a sync token to get started</div>
            </div>
        `;
        return;
    }

    showTokenDisplay(token);

    // Try to fetch from cloud first
    let data = await fetchSubmissionsFromCloud(token);

    if (data === null) {
        // Fallback to local storage
        const result = await chrome.storage.local.get(STORAGE_KEY);
        data = result[STORAGE_KEY] || [];
        showStatus("Offline mode", "info");
    }

    // Filter expired
    const now = new Date();
    data = data.filter(item => new Date(item.dueDate) > now);

    // Also save to local for offline fallback
    await chrome.storage.local.set({ [STORAGE_KEY]: data });

    // Update counter
    counter.textContent = data.length === 0
        ? "All clear!"
        : `${data.length} pending`;
    counter.style.color = "";

    if (data.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <span class="emoji">🎉</span>
                <div class="empty-title">You're all caught up</div>
                <div class="empty-sub">No pending submissions right now</div>
            </div>
        `;
        return;
    }

    data.forEach((item, index) => {
        const urgency = getUrgency(item.dueDate);
        const formattedDate = formatDate(item.dueDate);
        const courseName = item.course || "Unknown Course";

        const card = document.createElement("div");
        card.className = "card";

        card.innerHTML = `
            <div class="card-top">
                <div class="card-title">${item.title}</div>
                <span class="card-course" title="${courseName}">${courseName}</span>
            </div>
            <div class="card-meta">
                <div class="due-info">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <span>${formattedDate}</span>
                </div>
                <span class="due-badge ${urgency.class}">${urgency.label}</span>
            </div>
            <button class="btn-done" data-index="${index}" data-id="${item.id || ''}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
                Mark as Submitted
            </button>
        `;

        list.appendChild(card);
    });

    // Attach click handlers
    document.querySelectorAll(".btn-done").forEach(btn => {
        btn.onclick = async () => {
            const index = parseInt(btn.getAttribute("data-index"));
            const submissionId = btn.getAttribute("data-id");
            const card = btn.closest(".card");

            // Animate out
            card.style.transition = "all 0.3s ease";
            card.style.opacity = "0";
            card.style.transform = "translateX(30px) scale(0.95)";

            setTimeout(async () => {
                // Mark in cloud
                const tkn = await getSyncToken();
                if (tkn && submissionId) {
                    await markSubmittedInCloud(tkn, submissionId);
                }

                // Also update local storage
                const res = await chrome.storage.local.get(STORAGE_KEY);
                let localData = res[STORAGE_KEY] || [];
                localData.splice(index, 1);
                await chrome.storage.local.set({ [STORAGE_KEY]: localData });

                render();
            }, 300);
        };
    });
}

// ─── Event Listeners ────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
    // Generate Token
    document.getElementById("btn-generate").addEventListener("click", async () => {
        const btn = document.getElementById("btn-generate");
        btn.disabled = true;
        btn.textContent = "Generating...";

        try {
            const token = generateTokenString();
            await createTokenInSupabase(token);
            await saveSyncToken(token);
            showStatus("Token created!", "success");
            render();
        } catch (err) {
            showStatus("Failed to generate token", "error");
            console.error(err);
        } finally {
            btn.disabled = false;
            btn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Generate New Token
            `;
        }
    });

    // Link Existing Token
    document.getElementById("btn-link").addEventListener("click", async () => {
        const input = document.getElementById("token-input");
        const token = input.value.trim().toUpperCase();

        if (token.length < 4) {
            showStatus("Token too short", "error");
            return;
        }

        const btn = document.getElementById("btn-link");
        btn.disabled = true;
        btn.textContent = "...";

        try {
            const valid = await validateTokenInSupabase(token);
            if (valid) {
                await saveSyncToken(token);
                showStatus("Token linked!", "success");
                render();
            } else {
                showStatus("Invalid token", "error");
            }
        } catch (err) {
            showStatus("Connection error", "error");
            console.error(err);
        } finally {
            btn.disabled = false;
            btn.textContent = "Link";
        }
    });

    // Enter key in token input
    document.getElementById("token-input").addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            document.getElementById("btn-link").click();
        }
    });

    // Copy Token
    document.getElementById("btn-copy").addEventListener("click", async () => {
        const token = document.getElementById("token-value").textContent;
        try {
            await navigator.clipboard.writeText(token);
            const btn = document.getElementById("btn-copy");
            btn.innerHTML = `
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
            `;
            setTimeout(() => {
                btn.innerHTML = `
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                `;
            }, 1500);
        } catch (err) {
            console.error("Copy failed:", err);
        }
    });

    // Disconnect Token
    document.getElementById("btn-disconnect").addEventListener("click", async () => {
        if (confirm("Disconnect this token? You can re-link it later.")) {
            await clearSyncToken();
            render();
        }
    });

    // Sync Button
    document.getElementById("btn-sync").addEventListener("click", async () => {
        const btn = document.getElementById("btn-sync");
        btn.classList.add("spinning");
        showStatus("Syncing...", "info");
        await render();
        btn.classList.remove("spinning");
    });
});

// Initial render
render();