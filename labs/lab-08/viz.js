/* ============================================================
 * Lab 04 — viz.js
 *
 * Widgets:
 *   1. #viz-try-it     — two-source OSINT search (canned per target)
 *   2. #glossary-panel — inline glossary (shared pattern)
 * ============================================================ */

(function () {
  'use strict';

  // ============================================================
  // Widget 1 · two-source OSINT search
  // ============================================================
  (function initOsint() {
    const root = document.getElementById('viz-try-it');
    if (!root) return;
    const runBtn = document.getElementById('osint-run');
    const radios = document.querySelectorAll('input[name="target"]');

    const hibpEl   = document.getElementById('osint-hibp');
    const shodanEl = document.getElementById('osint-shodan');

    // Canned realistic responses — these are the kind of thing each source
    // actually returns. Not live API calls.
    const RESULTS = {
      email: {
        hibp: [
          { section: 'breached_accounts' },
          { k: 'Adobe',           v: '2013-10-04 · 152M accounts · passwords, emails, hints' },
          { k: 'LinkedIn',        v: '2012-05-05 · 164M accounts · SHA-1 unsalted hashes' },
          { k: 'Collection #1',   v: '2019-01-07 · aggregated · 773M emails + passwords', hl: true },
          { k: 'Dropbox',         v: '2012-07-01 · 68M accounts · bcrypt + SHA-1' },
          { k: 'pwned_passwords', v: 'one of the leaked passwords was seen 2,397,140 times', hl: true },
          { note: 'Pivot · check whether any of those services accept the same email + password today (don\'t actually do that — credential reuse is what makes these breaches dangerous).' },
        ],
        shodan: [
          { empty: '(Shodan doesn\'t index email addresses. Try an IP or hostname instead.)' },
        ],
      },
      ip: {
        hibp: [
          { empty: '(HIBP is keyed by email/password/domain, not by IP.)' },
        ],
        shodan: [
          { section: 'host · 128.143.22.150' },
          { k: 'org',          v: 'University of Virginia' },
          { k: 'asn',          v: 'AS1313' },
          { k: 'country',      v: 'United States' },
          { k: 'hostnames',    v: 'lab.cs.virginia.edu' },
          { section: 'open ports' },
          { k: '22/tcp',       v: 'ssh · OpenSSH 7.4 · password auth allowed', hl: true },
          { k: '80/tcp',       v: 'http · Apache 2.4.6 (CentOS 7)' },
          { k: '443/tcp',      v: 'https · TLS 1.0 + 1.1 enabled · cert expires in 14 days', hl: true },
          { k: '3306/tcp',     v: 'mysql · MariaDB 5.5.68 · NOT firewalled', hl: true },
          { k: '8080/tcp',     v: 'http · "Tomcat manager / Welcome page" · default app deployed' },
          { note: 'Pivot · mysql exposed on the internet + outdated Apache → start by trying default-credentialed mysql, then check Apache CVE list for 2.4.6.' },
        ],
      },
      tech: {
        hibp: [
          { empty: '(HIBP doesn\'t index by technology. Use Shodan for technology-level recon.)' },
        ],
        shodan: [
          { section: 'count · vsftpd 2.3.4 worldwide' },
          { k: 'hosts found',  v: '47,832' },
          { k: 'top country',  v: 'United States (8,116)' },
          { k: 'top asn',      v: 'AS4837 (China Unicom)' },
          { k: 'top product',  v: 'vsftpd 2.3.4' },
          { section: 'sample hosts' },
          { k: '203.0.113.42', v: 'banner: 220 (vsFTPd 2.3.4) · last seen 2026-05-08', hl: true },
          { k: '198.51.100.7', v: 'banner: 220 (vsFTPd 2.3.4) · last seen 2026-05-12' },
          { k: '192.0.2.100',  v: 'banner: 220 (vsFTPd 2.3.4) · last seen 2026-05-19' },
          { note: 'Pivot · all of these have the well-known 2011 backdoor (Lab 01 walked the exact exploit). Defensive read: how many of these hosts are in your organization\'s ASN?' },
        ],
      },
    };

    function renderCard(cardEl, rows) {
      cardEl.innerHTML = '';
      if (!rows || rows.length === 0) return;
      rows.forEach(r => {
        if (r.section) {
          const d = document.createElement('div');
          d.className = 'osint-section';
          d.textContent = r.section;
          cardEl.appendChild(d);
        } else if (r.empty) {
          const d = document.createElement('div');
          d.className = 'osint-empty';
          d.textContent = r.empty;
          cardEl.appendChild(d);
        } else if (r.note) {
          const d = document.createElement('div');
          d.className = 'osint-note';
          d.textContent = r.note;
          cardEl.appendChild(d);
        } else {
          const row = document.createElement('div');
          row.className = 'osint-row';
          const key = document.createElement('span');
          key.className = 'osint-key';
          key.textContent = r.k + ':';
          const val = document.createElement('span');
          val.className = 'osint-val' + (r.hl ? ' osint-hl' : '');
          val.textContent = ' ' + r.v;
          row.appendChild(key);
          row.appendChild(val);
          cardEl.appendChild(row);
        }
      });
    }

    function currentTarget() {
      const checked = document.querySelector('input[name="target"]:checked');
      return checked ? checked.value : 'email';
    }

    function clearAll() {
      [hibpEl, shodanEl].forEach(el => {
        el.innerHTML = '<div class="osint-empty">(press ▶ Search to populate)</div>';
      });
    }

    function run() {
      const t = currentTarget();
      const r = RESULTS[t];
      if (!r) return;
      // Light staggered render so the user sees the cards populate
      renderCard(hibpEl,   r.hibp);
      setTimeout(() => renderCard(shodanEl, r.shodan), 220);
    }

    runBtn.addEventListener('click', run);
    radios.forEach(r => r.addEventListener('change', clearAll));
    clearAll();
  })();

  // ============================================================
  // Widget · k-anonymity in the browser (Pwned Passwords)
  // ============================================================
  (function initKAnon() {
    const root = document.getElementById('viz-kanon');
    if (!root) return;

    const input    = document.getElementById('kanon-input');
    const runBtn   = document.getElementById('kanon-run');
    const hashEl   = document.getElementById('kanon-hash');
    const reqEl    = document.getElementById('kanon-request');
    const anonEl   = document.getElementById('kanon-anon');
    const respEl   = document.getElementById('kanon-response');
    const verdict  = document.getElementById('kanon-verdict');
    const presets  = document.querySelectorAll('.kanon-preset');

    // Canonical real-world counts (rounded to nearest 1k) so the demo
    // produces plausible numbers without making live API calls.
    // Verified against haveibeenpwned.com/Passwords in 2025.
    const KNOWN = {
      'password':                     10434004,
      'p@ssw0rd':                       210000,
      'hunter2':                         29000,
      '123456':                       37359195,
      'qwerty':                       10025000,
      'correct horse battery staple':     1230,
      'admin':                         3320000,
    };

    async function sha1Hex(str) {
      const buf = new TextEncoder().encode(str);
      const out = await crypto.subtle.digest('SHA-1', buf);
      return Array.from(new Uint8Array(out))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
    }

    // Deterministic PRNG seeded by the prefix, so each prefix shows
    // the same fake "response group" every time the user runs it.
    function rngFromString(s) {
      let h = 2166136261 >>> 0;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
      }
      return () => {
        h ^= h << 13; h >>>= 0;
        h ^= h >>> 17;
        h ^= h << 5;  h >>>= 0;
        return (h >>> 0) / 4294967296;
      };
    }

    function randomSuffix(rng) {
      const chars = '0123456789ABCDEF';
      let out = '';
      for (let i = 0; i < 35; i++) out += chars[Math.floor(rng() * 16)];
      return out;
    }

    function fakeResponseGroup(prefix, realSuffix, realCount) {
      // ~500 entries with deterministic pseudo-random content.
      const rng = rngFromString(prefix);
      const n = 460 + Math.floor(rng() * 200);  // 460–660 entries
      const out = [];
      // place the real match somewhere in the middle if there is one
      const matchAt = realSuffix ? Math.floor(n / 2) + Math.floor(rng() * 40) : -1;
      for (let i = 0; i < n; i++) {
        if (i === matchAt) {
          out.push({ suffix: realSuffix, count: realCount, match: true });
        } else {
          const cnt = 1 + Math.floor(rng() * 50000);
          out.push({ suffix: randomSuffix(rng), count: cnt, match: false });
        }
      }
      return out;
    }

    function renderHash(hash) {
      const pre = hash.slice(0, 5);
      const suf = hash.slice(5);
      hashEl.innerHTML =
        '<span class="kanon-pre">' + pre + '</span>' +
        '<span class="kanon-suf">' + suf + '</span>';
    }

    function renderRequest(prefix, groupSize) {
      reqEl.innerHTML =
        '<span class="kanon-method">GET</span> ' +
        '<span class="kanon-host">https://api.pwnedpasswords.com/range/</span>' +
        '<span class="kanon-pre">' + prefix + '</span>';
      anonEl.innerHTML =
        'HIBP sees: <em>"someone asked about a password whose hash starts with <code>' + prefix + '</code>."</em> ' +
        'That maps to <strong>~' + groupSize + ' possible passwords</strong> — your password is k-anonymous with <strong>k ≈ ' + groupSize + '</strong>.';
    }

    function renderResponse(group, matchSuffix) {
      const lines = group.map(g => {
        if (g.match) {
          return '<span class="kanon-line"><span class="kanon-match">' + g.suffix + ':' + g.count.toLocaleString() + '</span></span>';
        }
        return '<span class="kanon-line kanon-fade">' + g.suffix + ':' + g.count + '</span>';
      });
      respEl.innerHTML = lines.join('');
      // scroll match into view
      const m = respEl.querySelector('.kanon-match');
      if (m) {
        const top = m.offsetTop - respEl.offsetTop - 40;
        respEl.scrollTop = Math.max(0, top);
      }
    }

    async function run() {
      const raw = (input.value || '').trim();
      if (!raw) return;
      const hash = await sha1Hex(raw);
      const prefix = hash.slice(0, 5);
      const suffix = hash.slice(5);

      renderHash(hash);

      // Decide if it's "in the breach corpus" — known list, otherwise no.
      const lower = raw.toLowerCase();
      const breachCount = KNOWN[lower] || 0;
      const inBreach = breachCount > 0;
      const realSuffix = inBreach ? suffix : null;

      const group = fakeResponseGroup(prefix, realSuffix, breachCount);
      renderRequest(prefix, group.length);
      renderResponse(group, realSuffix);

      verdict.classList.remove('kanon-match-found', 'kanon-no-match', 'kanon-empty-verdict');
      if (inBreach) {
        verdict.classList.add('kanon-match-found');
        verdict.innerHTML =
          '✗ Your suffix appeared in the returned group · this password has been seen in <strong>' +
          breachCount.toLocaleString() + '</strong> breached corpora. Rotate it everywhere.';
      } else {
        verdict.classList.add('kanon-no-match');
        verdict.innerHTML =
          '✓ Your suffix did <em>not</em> appear in the returned group · this password is not in HIBP\'s current corpus. (Still: salting + a slow KDF is what matters when an attacker has your hash offline.)';
      }
    }

    runBtn.addEventListener('click', run);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
    presets.forEach(b => b.addEventListener('click', () => {
      input.value = b.dataset.pw;
      run();
    }));
  })();

  // ============================================================
  // Widget · OSINT × ML pipeline (clickable stages)
  // ============================================================
  (function initOsintPipeline() {
    const stagesEl = document.getElementById('osint-pipeline-stages');
    const detailEl = document.getElementById('osint-pipeline-detail');
    if (!stagesEl || !detailEl) return;

    const STAGES = [
      {
        key: 'ingest', tag: 'collect',
        name: 'Ingest',
        ml: 'Data loading',
        osint: 'AIS feeds, ADS-B, Shodan API, breach corpora, RSS, Telegram channels, satellite imagery tiles.',
        algos: 'API clients, rate-limit handlers, queue (Kafka / Redis Streams). No ML yet.',
        gotcha: 'Most OSINT bugs start here — a feed changed its schema and nothing downstream noticed.',
      },
      {
        key: 'normalize', tag: 'clean',
        name: 'Normalize',
        ml: 'Feature engineering · ETL',
        osint: 'Convert AIS MMSI codes, ADS-B ICAO hex, IPv4/IPv6, ASN, lat/lon precision, timestamps to a single coordinate system.',
        algos: 'Parsers, schema enforcement (Pydantic, dataclasses), geohashing, time bucketing. Still mostly deterministic.',
        gotcha: 'Lat/lon mixed up · timezones · units. The unglamorous step that breaks every system.',
      },
      {
        key: 'enrich', tag: 'augment',
        name: 'Enrich',
        ml: 'Featurization · embedding lookup',
        osint: 'Geocode → country/city. IP → ASN/org/cert. Hash → vendor classification. Text → sentence embeddings.',
        algos: 'MaxMind GeoLite, RDAP, BERT/Sentence-BERT, fastText, JA3 fingerprints. First place ML enters the pipeline.',
        gotcha: 'Enrichment APIs lie. Cache aggressively and version your enrichments — the same IP yesterday and today may return different orgs.',
      },
      {
        key: 'link', tag: 'fuse',
        name: 'Link',
        ml: 'Entity resolution · clustering · graph',
        osint: 'Same ship across AIS + visual? Same actor across two breaches? Same campaign across N C2 domains?',
        algos: 'Blocking + pairwise classifier, Fellegi-Sunter, siamese networks, k-means/DBSCAN, PageRank, Louvain.',
        gotcha: 'Precision-vs-recall trade-off lives here. Over-linking creates false super-entities; under-linking misses the story.',
      },
      {
        key: 'score', tag: 'rank',
        name: 'Score',
        ml: 'Inference · ranking',
        osint: 'Anomaly score per AIS track. Risk score per Shodan host. Priority per pivot lead.',
        algos: 'Isolation Forest, XGBoost, learned-to-rank, threshold calibration, conformal prediction.',
        gotcha: 'Score distributions drift. Set thresholds against a held-out recent slice, not the training set.',
      },
      {
        key: 'present', tag: 'serve',
        name: 'Present',
        ml: 'Model serving · UI',
        osint: 'Map markers, alert feed, dashboard, REST API back to analysts and to downstream automation.',
        algos: 'WebSocket push, tile rendering (Leaflet/MapLibre), search index (Elasticsearch, Meilisearch).',
        gotcha: 'A scored entity nobody sees is the same as no scoring at all. Latency budget on the alert pipeline matters as much as model quality.',
      },
    ];

    let active = 0;
    function render() {
      stagesEl.innerHTML = '';
      STAGES.forEach((s, i) => {
        const el = document.createElement('div');
        el.className = 'pipeline-stage' + (i === active ? ' active' : '');
        el.innerHTML =
          '<div class="pipeline-stage-num">stage ' + (i + 1) + ' · ' + s.tag + '</div>' +
          '<div class="pipeline-stage-name">' + s.name + '</div>' +
          '<div class="pipeline-stage-tag">' + s.ml + '</div>';
        el.addEventListener('click', () => { active = i; render(); });
        stagesEl.appendChild(el);
      });
      const s = STAGES[active];
      detailEl.innerHTML =
        '<div class="pipeline-detail-title">Stage ' + (active + 1) + ' of ' + STAGES.length + ' · ' + s.tag + '</div>' +
        '<div class="pipeline-detail-name">' + s.name + ' <span style="font-family: var(--mono); font-size: 13px; color: var(--ink-mute); font-weight: 400;">≈ ' + s.ml + '</span></div>' +
        '<div class="pipeline-detail-row"><strong>OSINT</strong>' + s.osint + '</div>' +
        '<div class="pipeline-detail-row"><strong>Algorithms</strong>' + s.algos + '</div>' +
        '<div class="pipeline-detail-row"><strong>Gotcha</strong>' + s.gotcha + '</div>';
    }
    render();
  })();

  // ============================================================
  // Widget · Break — from finding to attack to fix
  // ============================================================
  (function initBreak() {
    const picker = document.getElementById('break-picker');
    const stage = document.getElementById('break-stage');
    if (!picker || !stage) return;

    const FINDINGS = [
      {
        key: 'spf',
        label: 'No SPF record',
        found: 'Web Check (§5.5) flags "No SPF record found" for the target domain.',
        chain: [
          ['Recon', 'Attacker confirms the domain publishes no SPF — any server may send mail "as" it, unchallenged.'],
          ['Pretext', 'Crafts an email from <code>it-help@target.edu</code> — a real-looking address on the real domain, not a lookalike.'],
          ['Deliver', 'Because SPF/DMARC don\'t reject it, the message lands in the inbox, not spam. The "from" passes a casual glance.'],
          ['Harvest', 'The mail links to a cloned login page; a handful of recipients enter credentials.'],
          ['Impact', 'Working credentials for the real org — the start of account takeover, with no exploit and no malware.'],
        ],
        fix: 'Publish an SPF record (<code>v=spf1 ...</code>) plus DKIM and a DMARC policy of <code>p=reject</code>. One DNS change makes the spoofed "from" un-deliverable.',
      },
      {
        key: 'creds',
        label: 'Breached credential (HIBP)',
        found: 'HIBP (§5.1) shows a staff email in a third-party breach that exposed passwords.',
        chain: [
          ['Recon', 'Attacker pulls the breached email + password from the leaked corpus (free to download).'],
          ['Hypothesis', 'People reuse passwords. The leaked password for a hobby site is probably the work password too.'],
          ['Stuff', 'Tries that one email+password against the org\'s VPN / webmail / SSO — a single, low-noise login attempt.'],
          ['Pivot', 'If MFA is off, it just works. If MFA is on, the attacker pivots to MFA-fatigue or phishing the second factor.'],
          ['Impact', 'Authenticated access as a real employee — indistinguishable from them in the logs.'],
        ],
        fix: 'Enforce MFA everywhere, and screen new passwords against the HIBP Pwned-Passwords list at signup (§2) so a known-breached password can never be set in the first place.',
      },
      {
        key: 'bucket',
        label: 'Public storage bucket',
        found: 'GrayHat Warfare (§5.6) returns a public bucket whose name references the org.',
        chain: [
          ['Recon', 'Attacker searches the org name and finds a world-readable bucket in the index.'],
          ['List', 'Lists the objects — anonymously, over plain HTTPS. No exploit, no login, nothing to defeat.'],
          ['Download', 'Pulls <code>backup.sql</code>, a <code>.env</code> file, and a customer-export CSV directly by URL.'],
          ['Escalate', 'The <code>.env</code> holds an API key and a DB password — now the attacker has live credentials, not just stale files.'],
          ['Impact', 'Data exfiltration plus working secrets — and your logs may show nothing, because the read was on the cloud provider\'s side.'],
        ],
        fix: 'Set the bucket to private (block public access at the account level), rotate every secret the exposed files contained, and add a CI check that fails any commit/deploy that would make a bucket public.',
      },
    ];

    let active = 0;

    function render() {
      // picker buttons
      picker.innerHTML = '';
      FINDINGS.forEach((f, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'break-pick' + (i === active ? ' active' : '');
        b.textContent = f.label;
        b.addEventListener('click', () => { active = i; render(); });
        picker.appendChild(b);
      });

      const f = FINDINGS[active];
      let html = '<div class="break-found"><span class="break-tag found">Build · the finding</span>' + f.found + '</div>';
      html += '<ol class="break-chain">';
      f.chain.forEach((step, i) => {
        const last = i === f.chain.length - 1;
        html += '<li class="break-step' + (last ? ' impact' : '') + '">' +
                '<span class="break-step-tag">' + step[0] + '</span>' +
                '<span class="break-step-body">' + step[1] + '</span></li>';
      });
      html += '</ol>';
      html += '<div class="break-fix"><span class="break-tag fix">Secure · break one link</span>' + f.fix + '</div>';
      stage.innerHTML = html;
    }

    render();
  })();

  // ============================================================
  // Widget 2 · Inline glossary
  // ============================================================
  (function initGlossary() {
    const panel = document.getElementById('glossary-panel');
    if (!panel) return;
    const content = document.getElementById('glossary-content');
    const closeBtn = document.getElementById('glossary-close');
    const terms = document.querySelectorAll('.gloss[data-gloss]');

    const GLOSSARY = {
      'osint': {
        title: 'OSINT · open-source intelligence',
        body:
          '<p>The discipline of producing actionable intelligence from publicly available information. <em>Open-source</em> in the intelligence sense — public, not classified — not the software-license sense. Sources include search engines, social media, public records, breach databases, certificate transparency, internet-wide scan data, GitHub, the Wayback Machine, and many more.</p>' +
          '<p>For security: OSINT is the reconnaissance phase that happens <em>before</em> any packet hits the target. Done by attackers, done by defenders, done by journalists, done by lawyers. The skills transfer across all four.</p>',
      },
      'breach': {
        title: 'data breach',
        body:
          '<p>An incident in which information held by an organization is exposed to or accessed by unauthorized parties. The data may include credentials (the most useful to attackers downstream), personal information (PII), financial details, medical records, or internal documents.</p>' +
          '<p>Breach data <em>leaks</em> into the public domain when one of three things happens: the attacker publishes it to extort payment ("ransomware leak sites"), the attacker sells it on forums and copies leak more broadly, or a researcher finds an unprotected backup and publishes the existence (and sometimes contents) of the breach. <a href="https://haveibeenpwned.com">Have I Been Pwned</a> is the standard index of which breaches contain which addresses.</p>',
      },
      'pwned': {
        title: 'pwned',
        body:
          '<p>Mid-2000s gaming slang ("owned" with a typo) repurposed by security culture. To say an account is "pwned" is to say it appears in a public breach corpus; to say a host is "pwned" is to say an attacker has unauthorized control. Has graduated from slang to the formal name of the most-used breach-checking service (<em>Have I Been Pwned</em>) and an Anthropic-supported API.</p>' +
          '<p>Etymologically silly; functionally precise. Defenders use it the same way attackers do.</p>',
      },
      'attack-surface': {
        title: 'attack surface',
        body:
          '<p>The sum of every point where an attacker can attempt to interact with your systems — every exposed port, every authentication endpoint, every public form, every dependency you pull. Closely related: <em>exposure</em> (what is actually visible from outside), <em>blast radius</em> (what an attacker reaches if one component is compromised).</p>' +
          '<p>OSINT is largely the practice of <em>mapping</em> an attack surface from the outside without permission. Shodan, certificate transparency, ASN data — these are all attack-surface-mapping tools. The defender uses the same tools on their own organization, regularly.</p>',
      },
      'pivoting': {
        title: 'pivoting (in OSINT)',
        body:
          '<p>The technique of taking what one source told you and using it to ask a better question of the next. Different from "pivoting" in post-exploitation (which means moving laterally inside a compromised network) — the OSINT sense is purely about <em>information flow</em>.</p>' +
          '<p>Example: HIBP tells you alice@example.com appears in the LinkedIn breach. Pivot 1: search GitHub for "alice" + "example.com" — does she commit secrets? Pivot 2: look up example.com on Shodan — what does the org expose? Pivot 3: certificate transparency on example.com — what subdomains has it had?</p>',
      },
      'asn': {
        title: 'ASN · autonomous system number',
        body:
          '<p>The unit of routing on the public internet. Every block of contiguous IP addresses controlled by a single organization is assigned an <em>autonomous system number</em> — a small integer that BGP (the internet\'s routing protocol) uses to track who owns which block.</p>' +
          '<p>For OSINT: an ASN is the easiest way to list every IP address that belongs to an organization. UVA owns AS1313, which covers the public IP blocks issued to the university. Shodan, BGP-tools, and BGPHE.NET let you query "what does AS1313 own and expose?" in seconds.</p>',
      },
      'k-anonymity': {
        title: 'k-anonymity',
        body:
          '<p>A privacy model invented by Latanya Sweeney (2002) and now ubiquitous in production privacy systems. The definition: a record is <em>k-anonymous</em> if it is indistinguishable from at least <em>k−1</em> other records in the same release. Said the other way: any single query reveals a <em>group</em> of at least k records, not an individual.</p>' +
          '<p>HIBP\'s Pwned Passwords API is the canonical deployment. You send only the first 5 hex characters of your password\'s SHA-1; HIBP returns ~500 distinct breached suffixes that share that prefix; you match locally. HIBP learns the prefix and the time but cannot pick which of those ~500 candidate passwords you actually had — your password is k-anonymous with k ≈ 500.</p>' +
          '<p>The same pattern shows up in private set intersection, Apple\'s CSAM detection, Google\'s Private Aggregation, and any other "did we see this token?" system that wants to hide the query from the server. Worth recognizing in the wild.</p>',
      },
      'dorking': {
        title: 'dorking',
        body:
          '<p>The technique of crafting precise search queries to extract intelligence a casual search would miss. Originally <em>Google dorking</em> — using Google\'s advanced operators (<code>filetype:</code>, <code>site:</code>, <code>intitle:</code>, <code>inurl:</code>) to find exposed pages, leaked credentials, sensitive documents on misconfigured servers.</p>' +
          '<p>Extended to other indexes: <em>Shodan dorking</em> (<code>asn:</code>, <code>port:</code>, <code>ssl.cert.subject.cn:</code>), <em>GitHub dorking</em> (<code>filename:.env path:/ AWS_SECRET</code>), <em>Censys dorking</em>. The <a href="https://www.exploit-db.com/google-hacking-database">Google Hacking Database</a> catalogs thousands of these. Worth knowing every primitive on the search platforms you use most.</p>',
      },
      'agpl': {
        title: 'AGPL-3.0 · Affero General Public License',
        body:
          '<p>The copyleft variant of the GPL specifically designed for <em>network-served</em> software. Standard GPL\'s "you must publish your source if you distribute the software" loophole — that running the software on a server and exposing it over HTTP isn\'t "distribution" — is closed by AGPL: serving modified software over a network counts as distribution, and you owe the source.</p>' +
          '<p>Why it matters here: <a href="https://github.com/BigBodyCobain/Shadowbroker">Shadowbroker</a> is AGPL-3.0. Modifying it for the lab and running locally is fine (you\'re not distributing). Modifying it and putting it on a public URL, even just for your team, triggers the source-publication requirement. Many companies have an internal "no AGPL" policy specifically to avoid that obligation; in academia and personal projects it\'s less of an issue, but read the license once before you ship.</p>',
      },
      'security-headers': {
        title: 'HTTP security headers',
        body:
          '<p>Extra lines a web server can send in its HTTP response that tell the browser how to behave more safely. The browser already works without them; the headers <em>opt in</em> to stricter rules. Common ones: <code>Content-Security-Policy</code> (restricts which scripts/styles may run, the main defence against cross-site scripting), <code>X-Frame-Options</code> (stops other sites from embedding yours in a hidden frame — anti-clickjacking), <code>X-Content-Type-Options: nosniff</code> (stops the browser from guessing file types), and <code>Strict-Transport-Security</code> (HSTS — forces HTTPS).</p>' +
          '<p>They are cheap to add (a few lines of server config) and missing ones are the most common finding on any external scan — which is exactly why a recon tool lists them first. Each missing header isn\'t a breach, but it removes a guardrail an attacker would otherwise have to defeat.</p>',
      },
      'hsts': {
        title: 'HSTS · HTTP Strict-Transport-Security',
        body:
          '<p>A response header (<code>Strict-Transport-Security</code>) that tells the browser: "for the next N seconds, only ever talk to this site over HTTPS — never plain HTTP, even if the user types <code>http://</code> or clicks an old link." Once the browser has seen it, it upgrades every request itself before anything leaves the machine.</p>' +
          '<p>Why it matters: without HSTS, the very first request can go out over plaintext HTTP and be intercepted and downgraded (an "SSL-strip" man-in-the-middle attack) before the redirect to HTTPS happens. HSTS closes that first-request window. Missing HSTS is a routine finding; adding it is one config line.</p>',
      },
      'spf': {
        title: 'SPF · Sender Policy Framework',
        body:
          '<p>A DNS record that lists which mail servers are allowed to send email <em>as</em> your domain. A receiving mail server looks up your SPF record and rejects (or flags) mail claiming to be from you that comes from a server not on the list. It\'s one of the three anti-spoofing email standards, alongside DKIM (signs the message) and DMARC (says what to do when SPF/DKIM fail).</p>' +
          '<p>No SPF record means anyone can send mail that appears to come from your domain — the foundation of a convincing phishing campaign against your own users or partners. Publishing <code>v=spf1 ...</code> is a single DNS entry and is the first email-hardening step a defender takes.</p>',
      },
      'ari': {
        title: 'ARI · Adjusted Rand Index',
        body:
          '<p>A score for comparing two clusterings of the same items — here, your predicted campaign groups versus the hidden ground truth. It counts how often pairs of items are grouped <em>the same way</em> in both (together-together or apart-apart), then adjusts for the agreement you\'d expect by random chance.</p>' +
          '<p>Range: <strong>1.0</strong> = identical grouping, <strong>0.0</strong> = no better than random, negative = worse than random. It is <em>label-permutation invariant</em> — calling a cluster "3" vs "0" doesn\'t matter, only which items share a label — which is exactly why it\'s the right metric to grade clustering where the integer labels are arbitrary.</p>',
      },
      'nat': {
        title: 'NAT · network address translation',
        body:
          '<p>The trick that lets many devices share one public internet address. Your home router has a single public IP from your ISP; your laptop, phone, and TV each get a <em>private</em> address behind it, and the router rewrites the addresses as traffic passes through. So from the outside internet, everything on your home network looks like it\'s coming from that one router.</p>' +
          '<p>Why it matters here: when you look up "your" public IP, you\'re really seeing the router. A scan of that IP shows what the <em>router</em> exposes — which is why home routers and IoT gadgets (often with default passwords) are what turn up, not your laptop.</p>',
      },
      'cidr': {
        title: 'CIDR · a block of IP addresses',
        body:
          '<p>A compact way to write a whole range of IP addresses. The notation is <code>base/prefix</code> — e.g. <code>128.143.0.0/16</code>. The number after the slash says how many leading bits are fixed: <code>/16</code> fixes the first 16 bits (<code>128.143</code>), leaving the last 16 free, so the block is <code>128.143.0.0</code> through <code>128.143.255.255</code> — 65,536 addresses. A bigger number = a smaller block (<code>/24</code> = 256 addresses, <code>/32</code> = a single host).</p>' +
          '<p>For OSINT: organizations are allocated one or more CIDR blocks, so "what does this org expose?" often starts with "search its CIDR ranges." You can look up an org\'s blocks via its <a href="#" onclick="return false">ASN</a> in WHOIS/BGP data.</p>',
      },
      'cvss': {
        title: 'CVSS · severity score for a vulnerability',
        body:
          '<p>The Common Vulnerability Scoring System rates how bad a vulnerability is on a <strong>0 to 10</strong> scale, from factors like how easy it is to exploit, whether it needs authentication, and the impact if it lands. Rough bands: 0.1–3.9 low, 4.0–6.9 medium, 7.0–8.9 high, 9.0–10.0 critical.</p>' +
          '<p>So "CVSS 9.4" means near-worst-case: easy to exploit, severe impact, fix it now. It\'s a quick triage signal, not the whole story — a "medium" bug in a critical system can still be the one that gets you.</p>',
      },
      'c2': {
        title: 'C2 · command-and-control',
        body:
          '<p>The channel a piece of malware uses to "phone home" to the attacker who deployed it — to fetch instructions, receive new payloads, or exfiltrate stolen data. Short for <em>command-and-control</em> (also written C&amp;C). Detecting and blocking C2 traffic is a core defensive goal, because malware that can\'t reach its operator is far less useful.</p>' +
          '<p>For data collection: because C2 destinations are known-bad, sensors like DNS sinkholes and spam traps capture C2 attempts as clean, pre-labelled malicious signal — useful both for blocklists and for training detectors.</p>',
      },
      'ddos': {
        title: 'DDoS · distributed denial-of-service',
        body:
          '<p>An attack that overwhelms a service with traffic so legitimate users can\'t reach it. <em>Distributed</em> means the flood comes from many machines at once — usually a botnet of compromised devices — which makes it hard to block by source. Measured in requests-per-second (application-layer, e.g. flooding a login page) or bits-per-second (network-layer, e.g. raw packet floods).</p>' +
          '<p>It\'s a denial of <em>availability</em>, not a breach of confidentiality — nothing is stolen, the site just goes dark. It shows up on dashboards like Cloudflare Radar because a CDN sitting in front of millions of sites sees these floods directly and absorbs them.</p>',
      },
      'mcp': {
        title: 'MCP · Model Context Protocol',
        body:
          '<p>An open protocol (introduced by Anthropic in late 2024) that standardises how an LLM application talks to external tools, data sources, and services. An <em>MCP server</em> wraps some capability — a database, a filesystem, an API, a dev tool — and exposes it so an MCP-aware client (an AI assistant) can call it. Think "USB-C for LLM tools."</p>' +
          '<p>Security relevance: MCP servers are usually meant to run locally (bound to <code>localhost</code>), but the 2025 rush to adopt them put many on public IPs, sometimes unauthenticated. They\'re a fresh, fast-growing attack surface — which is why they make a good Shodan target for a defender auditing their own AI tooling. See <a href="https://www.oligo.security/blog/critical-rce-vulnerability-in-anthropic-mcp-inspector-cve-2025-49596">CVE-2025-49596</a> for a concrete example.</p>',
      },
      'canary-token': {
        title: 'canary token (honeytoken)',
        body:
          '<p>A piece of fake data planted to be stolen, wired to alert you the instant it\'s used. A canary token can be a bogus AWS key, a tracking URL hidden in a document, a fake DB connection string, a decoy login — anything an attacker would try. Legitimate users never touch it, so a trip is essentially a zero-false-positive intrusion alert, complete with the snooper\'s IP and timestamp.</p>' +
          '<p>It\'s the inexpensive cousin of a honeypot: instead of standing up a whole decoy system, you scatter individual decoy <em>artifacts</em>. Defenders drop them in the exact places attackers search — public buckets, GitHub, file shares — so the token fires during the reconnaissance stage, long before real damage. <a href="https://canarytokens.org">canarytokens.org</a> is the standard free generator.</p>',
      },
      'honeypot': {
        title: 'honeypot',
        body:
          '<p>A system deliberately set up to be attacked, instrumented to record everything an intruder does. It has no real users and no production role, so <em>any</em> interaction with it is unauthorised by definition — which makes its logs an unusually clean source of attack data (no benign traffic to filter out).</p>' +
          '<p>Two depths: <em>low-interaction</em> honeypots emulate just enough of a service to capture the first moves (cheap, but detectable); <em>high-interaction</em> ones are real, sacrificial systems that capture a full intrusion (richer, riskier). A network of them is a <em>honeynet</em>. For ML: honeypots are a free source of pre-labelled malicious examples — the expensive positive class — though biased toward opportunistic, internet-wide attackers rather than targeted ones.</p>',
      },
      'bucket': {
        title: 'storage bucket (object storage)',
        body:
          '<p>A "bucket" is the top-level container in a cloud <em>object store</em> — Amazon S3, Azure Blob Storage, Google Cloud Storage, DigitalOcean Spaces. Instead of a filesystem with folders, you put named <em>objects</em> (files) into a bucket and address each by a URL. It\'s how most modern apps store uploads, backups, logs, and static assets.</p>' +
          '<p>The security catch: each bucket has an access policy, and the historically easy mistake is setting it to <em>public</em> — anyone with the URL (or a tool that guesses bucket names) can list and download every object. Misconfigured-public buckets have leaked voter rolls, medical records, and source code for over a decade. Tools like <a href="https://grayhatwarfare.com">GrayHat Warfare</a> exist precisely because so many buckets are left open, and the default first audit on any cloud account is "is anything public that shouldn\'t be?"</p>',
      },
      'bellingcat': {
        title: 'Bellingcat',
        body:
          '<p>A Dutch-registered investigative-journalism collective, founded 2014, that produces investigations entirely from open-source data — flight tracks, satellite imagery, social-media posts, leaked databases, anything anyone can access. Famous investigations: the MH17 shoot-down attribution, the Skripal poisoning suspects, the Wagner Group documentation. They publish their methodology as carefully as their findings, which is why they\'re cited heavily in this lab.</p>' +
          '<p>Their <a href="https://bellingcat.gitbook.io/toolkit">Online Investigations Toolkit</a> is the most-maintained OSINT tool catalog on the public web. Organized by the question you\'re trying to answer (where was this photo taken? who owns this domain? what flights were over this location?) rather than by tool name. Updated continuously; supersedes most static OSINT-tool lists.</p>',
      },
    };

    function clearActive() {
      document.querySelectorAll('.gloss.active').forEach(t => t.classList.remove('active'));
    }
    function findInsertTarget(termEl) {
      if (!termEl || !termEl.parentElement) return null;
      let node = termEl.parentElement;
      while (node) {
        const tag = (node.tagName || '').toLowerCase();
        if (['p','h1','h2','h3','h4','h5','blockquote','pre','figure','div'].includes(tag)) {
          if (node.id === 'glossary-panel' || node === panel) { node = node.parentElement; continue; }
          return node;
        }
        if (tag === 'li') {
          const list = node.parentElement;
          if (list && (list.tagName === 'OL' || list.tagName === 'UL')) return list;
          return node;
        }
        if (tag === 'td' || tag === 'th') {
          let t = node;
          while (t && t.tagName !== 'TABLE') t = t.parentElement;
          return t || node;
        }
        if (tag === 'main' || tag === 'body') return null;
        node = node.parentElement;
      }
      return null;
    }
    function show(termId, el) {
      const entry = GLOSSARY[termId];
      if (!entry) return;
      clearActive();
      if (el) el.classList.add('active');
      content.innerHTML =
        '<div class="glossary-panel-title">' + entry.title + '</div>' + entry.body;
      const target = el ? findInsertTarget(el) : null;
      if (target && target.parentNode && target.nextSibling !== panel) {
        target.parentNode.insertBefore(panel, target.nextSibling);
      }
      panel.hidden = false;
      panel.style.animation = 'none';
      void panel.offsetWidth;
      panel.style.animation = '';
    }
    function hide() { clearActive(); panel.hidden = true; }

    terms.forEach(t => {
      t.setAttribute('tabindex', '0');
      t.setAttribute('role', 'button');
      const id = t.getAttribute('data-gloss');
      t.addEventListener('mouseenter', () => show(id, t));
      t.addEventListener('focus',      () => show(id, t));
      t.addEventListener('click',      (e) => { e.preventDefault(); show(id, t); });
      t.addEventListener('keydown',    (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(id, t); }
      });
    });
    closeBtn.addEventListener('click', hide);
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (panel.hidden) return;
      if (e.target && e.target.matches && e.target.matches('input, textarea, [contenteditable]')) return;
      hide();
    });
  })();

})();
