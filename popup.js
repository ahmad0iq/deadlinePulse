const STORAGE_KEY = "submissions";

// Determine urgency based on due date
function getUrgency(dueDateStr) {
    const now = new Date();
    const due = new Date(dueDateStr);
    const hoursLeft = (due - now) / (1000 * 60 * 60);

    if (hoursLeft < 0) return { label: "Overdue", class: "urgent" };
    if (hoursLeft < 24) return { label: "Due today", class: "urgent" };
    if (hoursLeft < 72) return { label: "Due soon", class: "soon" };
    return { label: "Upcoming", class: "safe" };
}

// Format date nicely
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

async function render() {
    const list = document.getElementById("list");
    const counter = document.getElementById("counter");
    list.innerHTML = "";

    // Read from chrome.storage.local instead of localStorage
    const result = await chrome.storage.local.get(STORAGE_KEY);
    let data = result[STORAGE_KEY] || [];

    // Clean expired
    const now = new Date();
    data = data.filter(item => new Date(item.dueDate) > now);

    // Update counter
    counter.textContent = data.length === 0
        ? "All clear!"
        : `${data.length} pending`;

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
            <button class="btn-done" data-index="${index}">
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
            const card = btn.closest(".card");

            // Animate out
            card.style.transition = "all 0.3s ease";
            card.style.opacity = "0";
            card.style.transform = "translateX(30px) scale(0.95)";

            setTimeout(async () => {
                const res = await chrome.storage.local.get(STORAGE_KEY);
                let data = res[STORAGE_KEY] || [];
                data.splice(index, 1);
                await chrome.storage.local.set({ [STORAGE_KEY]: data });
                render();
            }, 300);
        };
    });
}

render();