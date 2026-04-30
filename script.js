const repos = [
  {
    name: "open-interpreter",
    owner: "KillianLucas",
    desc: "A natural language interface for computers. Runs locally on your machine.",
    source: "github",
    stars: "57.2k",
    language: "Python",
    tags: ["ai", "money", "hot"],
    aiSummary: "Lets LLMs run code on your computer — think local ChatGPT Code Interpreter. Massive opportunity: wrap into a paid hosted service for non-technical users.",
    scores: { trend: 92, learn: 85, money: 88 },
    type: "monetizable",
    savedId: null
  },
  {
    name: "Flowise",
    owner: "FlowiseAI",
    desc: "Drag & drop UI to build your customized LLM flow using LangchainJS",
    source: "hn",
    stars: "31.1k",
    language: "TypeScript",
    tags: ["ai", "saas", "money"],
    aiSummary: "Open-core no-code LLM builder. The company already offers a paid cloud version — you could host your own white-label instance and sell to SMBs at $49/mo.",
    scores: { trend: 88, learn: 79, money: 95 },
    type: "monetizable",
    savedId: null
  },
  {
    name: "Ghostty",
    owner: "mitchellh",
    desc: "Fast, feature-rich, and cross-platform terminal emulator using platform-native UI",
    source: "reddit",
    stars: "23.8k",
    language: "Zig",
    tags: ["hot", "cli"],
    aiSummary: "GPU-accelerated terminal built in Zig. Insanely fast. The Zig ecosystem is exploding — great repo to study systems programming patterns.",
    scores: { trend: 97, learn: 91, money: 40 },
    type: "hot",
    savedId: null
  },
  {
    name: "pocketbase",
    owner: "pocketbase",
    desc: "Open Source backend for your next SaaS and mobile app in 1 file",
    source: "ph",
    stars: "42.6k",
    language: "Go",
    tags: ["saas", "money"],
    aiSummary: "Single-file Firebase replacement. Competitors charge $25+/mo for what this gives you free. Fork it, add a managed hosting layer, charge $15/mo — similar to PocketHost.",
    scores: { trend: 84, learn: 88, money: 97 },
    type: "monetizable",
    savedId: null
  },
  {
    name: "screenpipe",
    owner: "mediar-ai",
    desc: "24/7 screen, mic, audio capture + AI that understands your life",
    source: "hn",
    stars: "11.3k",
    language: "Rust",
    tags: ["ai", "hot", "money"],
    aiSummary: "Local Rewind.ai alternative. Records everything happening on your screen and lets LLMs query it. Massive privacy-first angle — sell to devs who won't trust the cloud.",
    scores: { trend: 90, learn: 82, money: 86 },
    type: "hot",
    savedId: null
  },
  {
    name: "trigger.dev",
    owner: "triggerdotdev",
    desc: "Open source background jobs platform with built-in AI tooling",
    source: "github",
    stars: "8.9k",
    language: "TypeScript",
    tags: ["saas", "money"],
    aiSummary: "Self-hosted Temporal/Inngest alternative. Every SaaS needs background jobs. Deploy this for a client at $500+, or build a hosted version for non-technical founders.",
    scores: { trend: 78, learn: 90, money: 89 },
    type: null,
    savedId: null
  }
];

const trending = [
  { name: "open-interpreter", stars: "+2.3k today" },
  { name: "Ghostty", stars: "+1.8k today" },
  { name: "pocketbase", stars: "+1.2k today" },
  { name: "screenpipe", stars: "+980 today" },
  { name: "trigger.dev", stars: "+740 today" },
];

const sourceLabels = { github: 'GitHub', reddit: 'Reddit', hn: 'Hacker News', ph: 'Product Hunt' };

let saved = new Set();

function renderRepos(list) {
  const grid = document.getElementById('repoGrid');
  grid.innerHTML = list.map((r, i) => {
    const tagHtml = [
      r.language ? `<span class="tag tag-lang">${r.language}</span>` : '',
      r.tags.includes('money') ? `<span class="tag tag-money"><i data-lucide="dollar-sign"></i> monetizable</span>` : '',
      r.tags.includes('ai') ? `<span class="tag tag-ai"><i data-lucide="bot"></i> AI</span>` : '',
      r.tags.includes('hot') ? `<span class="tag tag-hot"><i data-lucide="flame"></i> viral</span>` : '',
      r.tags.includes('saas') ? `<span class="tag tag-saas"><i data-lucide="cloud"></i> SaaS</span>` : '',
    ].join('');

    const isSaved = saved.has(r.name);

    return `
    <div class="repo-card ${r.type || ''}" style="animation:fadeIn 0.3s ease ${i*0.05}s both">
      <div class="repo-top">
        <div class="repo-source">
          <div class="source-dot src-${r.source}"></div>
          ${sourceLabels[r.source]}
        </div>
        <div class="monetize-score">
          ${r.scores.money >= 85 ? '<i data-lucide="dollar-sign"></i> ' + r.scores.money + '% monetize score' : ''}
        </div>
      </div>
      <div class="repo-name">${r.name}</div>
      <div class="repo-owner">by ${r.owner}</div>
      <div class="repo-tags">${tagHtml}</div>
      <div class="repo-desc">${r.desc}</div>
      <div class="ai-summary">
        <span class="ai-label"><i data-lucide="zap"></i> AI▸</span>
        <span>${r.aiSummary}</span>
      </div>
      <div class="score-bar">
        <div class="score-item">
          <div class="score-name">TREND</div>
          <div class="score-track"><div class="score-fill" style="width:${r.scores.trend}%;background:var(--accent4)"></div></div>
        </div>
        <div class="score-item">
          <div class="score-name">LEARN</div>
          <div class="score-track"><div class="score-fill" style="width:${r.scores.learn}%;background:var(--accent)"></div></div>
        </div>
        <div class="score-item">
          <div class="score-name">MONEY</div>
          <div class="score-track"><div class="score-fill" style="width:${r.scores.money}%;background:var(--accent3)"></div></div>
        </div>
      </div>
      <div class="repo-meta">
        <span class="meta-item"><i data-lucide="star"></i> ${r.stars}</span>
        <span class="meta-item" style="margin-left:auto;color:var(--muted);font-size:10px">Updated 2h ago</span>
      </div>
      <div class="repo-actions">
        <button class="action-btn ${isSaved?'saved':''}" onclick="toggleSave('${r.name}',this)">
          <i data-lucide="${isSaved?'check':'plus'}"></i> ${isSaved?'Saved':'Save'}
        </button>
        <button class="action-btn" onclick="openRepo('${r.owner}','${r.name}')">
          <i data-lucide="external-link"></i> GitHub
        </button>
        <button class="action-btn" onclick="addToQueue('${r.name}',this)">
          <i data-lucide="list-plus"></i> Queue
        </button>
        <button class="action-btn" onclick="analyzeMore('${r.name}')">
          <i data-lucide="bot"></i> Analyze
        </button>
      </div>
    </div>`;
  }).join('');
  lucide.createIcons();
}

function renderTrending() {
  document.getElementById('trendingList').innerHTML = trending.map((t, i) => `
    <div class="trending-item">
      <div class="trending-rank">${String(i+1).padStart(2,'0')}</div>
      <div>
        <div class="trending-name">${t.name}</div>
        <div class="trending-stars"><i data-lucide="star"></i> ${t.stars}</div>
      </div>
    </div>
  `).join('');
  lucide.createIcons();
}

function toggleSave(name, btn) {
  if (saved.has(name)) {
    saved.delete(name);
    btn.innerHTML = '<i data-lucide="plus"></i> Save';
    btn.classList.remove('saved');
  } else {
    saved.add(name);
    btn.innerHTML = '<i data-lucide="check"></i> Saved';
    btn.classList.add('saved');
  }
  document.getElementById('savedCount').textContent = saved.size;
  lucide.createIcons();
}

function openRepo(owner, name) {
  window.open(`https://github.com/${owner}/${name}`, '_blank');
}

function addToQueue(name, btn) {
  btn.innerHTML = '<i data-lucide="check"></i> Queued';
  btn.style.color = 'var(--accent2)';
  lucide.createIcons();
}

function analyzeMore(name) {
  alert(`Deep analysis triggered for ${name}. (In a real app, this would send a prompt to the AI)`);
}

function toggleFilter(el) {
  el.classList.toggle('on');
}

function setView(type, el) {
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
  el.classList.add('active');
  let filtered = repos;
  if (type === 'monetize') filtered = repos.filter(r => r.scores.money >= 85);
  else if (type === 'ai') filtered = repos.filter(r => r.tags.includes('ai'));
  else if (type === 'saas') filtered = repos.filter(r => r.tags.includes('saas'));
  else if (type === 'hot') filtered = repos.filter(r => r.type === 'hot');
  else if (type === 'github') filtered = repos.filter(r => r.source === 'github');
  else if (type === 'reddit') filtered = repos.filter(r => r.source === 'reddit');
  else if (type === 'hn') filtered = repos.filter(r => r.source === 'hn');
  else if (type === 'ph') filtered = repos.filter(r => r.source === 'ph');
  else if (type === 'saved') filtered = repos.filter(r => saved.has(r.name));
  renderRepos(filtered);
}

function toggleConfig() {
  const el = document.getElementById('configArea');
  el.classList.toggle('show');
}

function saveKey() {
  const k = document.getElementById('groqKey').value;
  if (k) { localStorage.setItem('groqKey', k); alert('API key saved locally ✓'); }
}

function triggerRefresh() {
  const btn = document.querySelector('.btn-accent');
  btn.innerHTML = '<span class="refresh-spin"><i data-lucide="refresh-cw"></i></span> Fetching...';
  lucide.createIcons();
  setTimeout(() => {
    btn.innerHTML = '<i data-lucide="refresh-cw"></i> Refresh';
    document.querySelector('.stat-val').textContent = '2,851';
    lucide.createIcons();
  }, 2000);
}

// Initial Render
document.addEventListener('DOMContentLoaded', () => {
  renderRepos(repos);
  renderTrending();
  lucide.createIcons();
});
