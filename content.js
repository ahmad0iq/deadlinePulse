const STORAGE_KEY = "submissions";

// Remove expired submissions
function cleanExpired(data) {
    const now = new Date();
    return data.filter(item => new Date(item.dueDate) > now);
}

// Extract submissions from HTML
function extractSubmissions(htmlText, courseName) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, "text/html");

    const rows = doc.querySelectorAll("tr[submission_id]");
    const results = [];

    rows.forEach(row => {
        const title = row.querySelector(".rec_submission_title")?.textContent.trim();
        const dueDate = row.querySelector(".rec_submission_due_date")?.textContent.trim();

        if (title && dueDate) {
            results.push({
                title,
                dueDate,
                course: courseName,
                id: title + dueDate
            });
        }
    });

    return results;
}

// ─── Supabase Sync ────────────────────────────────────────

async function syncToCloud(submissions) {
    try {
        const result = await chrome.storage.local.get(TOKEN_STORAGE_KEY);
        const token = result[TOKEN_STORAGE_KEY];

        if (!token || !SUPABASE_CONFIG || SUPABASE_CONFIG.URL.includes("YOUR_PROJECT_ID")) {
            return; // No token or not configured
        }

        const response = await fetch(SUPABASE_FUNCTIONS.SYNC_SUBMISSIONS, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "apikey": SUPABASE_CONFIG.ANON_KEY,
                "Authorization": `Bearer ${SUPABASE_CONFIG.ANON_KEY}`,
            },
            body: JSON.stringify({ token, submissions }),
        });

        const data = await response.json();

        if (data.success && data.submissions) {
            // Update local storage with cloud data
            await chrome.storage.local.set({ [STORAGE_KEY]: data.submissions });
            return data.submissions;
        }
    } catch (err) {
        console.error("Cloud sync failed (offline mode):", err);
    }
    return null;
}

// Scan links and fetch submissions
async function processLinks() {
    const anchors = document.querySelectorAll("a[href*='/student/course/info/']");

    const result = await chrome.storage.local.get(STORAGE_KEY);
    let stored = cleanExpired(result[STORAGE_KEY] || []);

    for (let a of anchors) {
        const url = a.getAttribute("href");
        const courseName = a.innerText.trim().split("\n")[0].trim();
        const newUrl = url.replace("/info/", "/submission/");

        try {
            const res = await fetch(newUrl, { credentials: "include" });
            const html = await res.text();
            const submissions = extractSubmissions(html, courseName);

            submissions.forEach(sub => {
                if (!stored.find(s => s.id === sub.id)) {
                    stored.push(sub);
                }
            });
        } catch (err) {
            console.error("Error fetching:", newUrl, err);
        }
    }

    await chrome.storage.local.set({ [STORAGE_KEY]: stored });

    // Sync to cloud after local save
    const cloudData = await syncToCloud(stored);
    if (cloudData) {
        stored = cloudData;
    }

    return stored;
}

// ─── Floating Panel UI ────────────────────────────────────────

function getUrgency(dueDateStr) {
    const now = new Date();
    const due = new Date(dueDateStr);
    const hoursLeft = (due - now) / (1000 * 60 * 60);
    if (hoursLeft < 0) return { label: "Overdue", cls: "pst-badge-urgent" };
    if (hoursLeft < 24) return { label: "Due today", cls: "pst-badge-urgent" };
    if (hoursLeft < 72) return { label: "Due soon", cls: "pst-badge-soon" };
    return { label: "Upcoming", cls: "pst-badge-safe" };
}

function formatDate(dateStr) {
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch { return dateStr; }
}

function buildPanelHTML(data) {
    if (data.length === 0) {
        return `
            <div class="pst-empty">
                <span class="pst-emoji">🎉</span>
                <div class="pst-empty-title">You're all caught up</div>
                <div class="pst-empty-sub">No pending submissions right now</div>
            </div>`;
    }

    return data.map((item, i) => {
        const u = getUrgency(item.dueDate);
        const fd = formatDate(item.dueDate);
        const course = item.course || "Unknown";
        return `
        <div class="pst-card" style="animation-delay:${i * 0.06}s">
            <div class="pst-card-top">
                <div class="pst-card-title">${item.title}</div>
                <span class="pst-card-course" title="${course}">${course}</span>
            </div>
            <div class="pst-card-meta">
                <div class="pst-due-info">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    <span>${fd}</span>
                </div>
                <span class="pst-due-badge ${u.cls}">${u.label}</span>
            </div>
            <button class="pst-btn-done" data-index="${i}" data-id="${item.id || ''}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                Mark as Submitted
            </button>
        </div>`;
    }).join("");
}

function renderPanel(data) {
    const listEl = document.getElementById("pst-list");
    const subEl = document.getElementById("pst-counter");
    if (!listEl || !subEl) return;

    const now = new Date();
    data = data.filter(item => new Date(item.dueDate) > now);

    subEl.textContent = data.length === 0 ? "All clear!" : `${data.length} pending`;
    listEl.innerHTML = buildPanelHTML(data);

    // Update badge on toggle button
    const badge = document.getElementById("pst-toggle-badge");
    if (badge) {
        badge.textContent = data.length;
        badge.style.display = data.length > 0 ? "flex" : "none";
    }

    // Mark-done handlers
    listEl.querySelectorAll(".pst-btn-done").forEach(btn => {
        btn.onclick = async () => {
            const idx = parseInt(btn.getAttribute("data-index"));
            const submissionId = btn.getAttribute("data-id");
            const card = btn.closest(".pst-card");
            card.style.transition = "all 0.3s ease";
            card.style.opacity = "0";
            card.style.transform = "translateX(30px) scale(0.95)";

            setTimeout(async () => {
                // Mark in cloud
                try {
                    const tokenResult = await chrome.storage.local.get(TOKEN_STORAGE_KEY);
                    const token = tokenResult[TOKEN_STORAGE_KEY];
                    if (token && submissionId) {
                        await fetch(SUPABASE_FUNCTIONS.MARK_SUBMITTED, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "apikey": SUPABASE_CONFIG.ANON_KEY,
                                "Authorization": `Bearer ${SUPABASE_CONFIG.ANON_KEY}`,
                            },
                            body: JSON.stringify({ token, submission_key: submissionId }),
                        });
                    }
                } catch (err) {
                    console.error("Cloud mark-submitted failed:", err);
                }

                const res = await chrome.storage.local.get(STORAGE_KEY);
                let d = cleanExpired(res[STORAGE_KEY] || []);
                d.splice(idx, 1);
                await chrome.storage.local.set({ [STORAGE_KEY]: d });
                renderPanel(d);
            }, 300);
        };
    });
}

function injectPanel() {
    // Toggle button (FAB)
    const toggle = document.createElement("div");
    toggle.id = "pst-panel-toggle";
    toggle.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="url(#pst-g)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <defs><linearGradient id="pst-g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#a78bfa"/><stop offset="100%" style="stop-color:#6366f1"/></linearGradient></defs>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
        <span class="pst-badge" id="pst-toggle-badge" style="display:none">0</span>
    `;

    // Panel
    const panel = document.createElement("div");
    panel.id = "pst-panel";
    panel.classList.add("pst-hidden");
    panel.innerHTML = `
        <div class="pst-orb pst-orb-1"></div>
        <div class="pst-orb pst-orb-2"></div>
        <div id="pst-panel-inner">
            <div class="pst-header">
                <div class="pst-header-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="url(#pst-g2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <defs><linearGradient id="pst-g2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#a78bfa"/><stop offset="100%" style="stop-color:#6366f1"/></linearGradient></defs>
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                    </svg>
                </div>
                <div>
                    <h2>Submissions</h2>
                    <div class="pst-sub" id="pst-counter">Loading...</div>
                </div>
            </div>
            <div class="pst-list" id="pst-list"></div>
        </div>
    `;

    document.body.appendChild(panel);
    document.body.appendChild(toggle);

    // Toggle visibility
    toggle.addEventListener("click", () => {
        panel.classList.toggle("pst-hidden");
    });

    // Close when clicking outside
    document.addEventListener("click", (e) => {
        if (!panel.contains(e.target) && !toggle.contains(e.target)) {
            panel.classList.add("pst-hidden");
        }
    });
}

// ─── Dashboard auto-open logic ────────────────────────────────

const isDashboard = window.location.href.includes("/student/dashboard");

async function main() {
    // Always fetch submissions on any Horizon page with course links
    const data = await processLinks();

    // Only inject the floating panel on the dashboard
    if (isDashboard) {
        injectPanel();
        renderPanel(data);

        // Auto-open the panel after a short delay
        setTimeout(() => {
            const panel = document.getElementById("pst-panel");
            if (panel) panel.classList.remove("pst-hidden");
        }, 800);
    }
}

main();