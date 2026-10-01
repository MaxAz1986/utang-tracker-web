/* Utang Tracker website: accounts and cloud sync (Supabase).
   Figures stay usable without an account (saved in this browser). Signing in keeps
   them in a private database row that only the signed-in person can read or change. */
(() => {
  const SUPABASE_URL = 'https://lfomlrnwuajtsvxfeolb.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_M4McmczrkTNObaNlOg8iwA_9kXghFku';   // publishable key: safe to ship; row security protects the data
  const SITE = location.origin + location.pathname.replace(/index\.html$/, '');
  const App = window.UtangApp;
  const BASE = new URL('.', document.currentScript ? document.currentScript.src : location.href);   // site root (cloud.js lives there)
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register(new URL('sw.js', BASE)).catch(() => {});
  if (!App || !window.supabase) return;

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  let user = null, saveT = null, pending = null, lastPull = 0, pulling = false;

  /* ---------- small helpers ---------- */
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hash = str => { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return String(h); };
  const META = 'utang-sync-meta';
  const getMeta = () => { try { return JSON.parse(localStorage.getItem(META)) || {}; } catch { return {}; } };
  const setMeta = m => { try { localStorage.setItem(META, JSON.stringify(m)); } catch {} };
  const synced = json => setMeta({ uid: user?.id, h: hash(json) });
  const when = iso => { try { return new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return iso; } };

  /* ---------- styles for the account button and dialogs ---------- */
  const css = document.createElement('style');
  css.textContent = `
  .acct{position:relative}
  .acct-chip{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:12px;padding:6px 10px 6px 6px;font:600 14px var(--f-body);cursor:pointer;max-width:240px}
  .acct-chip .av{width:26px;height:26px;border-radius:8px;background:var(--accent);color:var(--accent-ink);display:grid;place-items:center;font-weight:800;flex:none}
  .acct-chip .em{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .acct-menu{position:absolute;right:0;top:calc(100% + 6px);background:var(--panel);border:1px solid var(--line);border-radius:14px;box-shadow:0 12px 32px rgba(20,16,50,.18);padding:6px;min-width:230px;z-index:30;display:flex;flex-direction:column}
  .acct-menu .who{padding:8px 10px;font-size:12.5px;color:var(--muted);border-bottom:1px solid var(--line);margin-bottom:4px;word-break:break-all}
  .acct-menu button{text-align:left;border:0;background:none;color:var(--ink);font:600 14px var(--f-body);padding:9px 10px;border-radius:9px;cursor:pointer}
  .acct-menu button:hover{background:var(--panel-2)} .acct-menu button.danger{color:var(--bad)}
  .ov{position:fixed;inset:0;background:rgba(10,8,30,.55);display:grid;place-items:center;z-index:50;padding:16px}
  .dlg{background:var(--panel);color:var(--ink);border-radius:20px;width:min(440px,100%);max-height:calc(100vh - 32px);overflow:auto;padding:22px;display:flex;flex-direction:column;gap:14px;box-shadow:0 24px 60px rgba(0,0,0,.35)}
  .dlg h2{font-size:22px} .dlg p{margin:0}
  .dlg .fld{display:flex;flex-direction:column;gap:5px} .dlg .fld label{font-size:12.5px;font-weight:700;color:var(--muted)}
  .dlg .actions{display:flex;flex-wrap:wrap;gap:8px} .dlg .actions .btn{flex:1;justify-content:center}
  .dlg .links{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;font-size:13.5px}
  .dlg .linkbtn{border:0;background:none;color:var(--accent);font:700 13.5px var(--f-body);cursor:pointer;padding:0}
  .dlg .msg{font-size:13.5px;border-radius:10px;padding:9px 12px}
  .dlg .msg.err{background:var(--bad-soft);color:var(--bad)} .dlg .msg.ok{background:var(--go-soft);color:var(--go)}
  .dlg .note{font-size:12.5px;color:var(--muted)}
  .dlg .cmp{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .dlg .cmp>div{background:var(--panel-2);border-radius:12px;padding:10px;font-size:13px;display:flex;flex-direction:column;gap:2px}
  .dlg .cmp b{font-family:var(--f-display);font-size:17px}
  .btn.danger{background:var(--bad);border-color:var(--bad);color:#fff}
  .ga-list{display:flex;flex-direction:column;gap:10px}
  .ga-card{border:1.5px solid var(--line);border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:10px}
  .ga-card.rec{border-color:var(--accent);background:var(--accent-soft)}
  .ga-top{display:flex;align-items:center;gap:10px}
  .ga-top>div{display:flex;flex-direction:column;flex:1;min-width:0}
  .ga-ic{width:36px;height:36px;border-radius:11px;background:var(--hero);color:#fff;display:grid;place-items:center;font:800 16px var(--f-display);flex:none}
  .ga-card .btn{justify-content:center;text-decoration:none}
  .ga-steps{margin:0;padding-left:20px;font-size:13px;color:var(--muted);display:flex;flex-direction:column;gap:3px}
  .ga-steps b{color:var(--ink)}
  .dlg{width:min(520px,100%)}
  .gbtn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;border:1.5px solid var(--line);background:#fff;color:#1f1f1f;border-radius:12px;padding:11px 14px;font:700 15px var(--f-body);cursor:pointer}
  .gbtn:hover{border-color:var(--accent)} .gbtn:disabled{opacity:.6;cursor:default} .gbtn svg{width:18px;height:18px;flex:none}
  .orline{display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--muted)} .orline::before,.orline::after{content:"";flex:1;height:1px;background:var(--line)}
  @media (max-width:520px){ .acct-chip .em{display:none} .appbar .iconbtn span{display:none} .appbar .iconbtn{padding:8px 10px} }`;
  document.head.appendChild(css);

  /* ---------- account button ---------- */
  const slot = $('#acctSlot');
  function renderAcct() {
    if (!slot) return;
    if (!user) { slot.innerHTML = `<button class="iconbtn" id="acctSignIn">Sign in to sync</button>`; return; }
    const em = user.email || 'Account';
    slot.innerHTML = `<span class="acct"><button class="acct-chip" id="acctChip" aria-haspopup="menu" aria-expanded="false"><span class="av">${esc(em[0].toUpperCase())}</span><span class="em">${esc(em)}</span></button></span>`;
  }
  function openMenu() {
    closeMenu();
    const m = document.createElement('div');
    m.className = 'acct-menu'; m.id = 'acctMenu'; m.setAttribute('role', 'menu');
    m.innerHTML = `<div class="who">Signed in as<br><b>${esc(user.email)}</b></div>
      <button data-a="sync" role="menuitem">Sync now</button>
      ${hasPw() ? '<button data-a="pw" role="menuitem">Change password</button>' : ''}
      <button data-a="out" role="menuitem">Sign out</button>
      <button data-a="del" class="danger" role="menuitem">Delete my figures…</button>`;
    $('.acct').appendChild(m);
    $('#acctChip').setAttribute('aria-expanded', 'true');
  }
  function hasPw() { const ids = user?.identities; return !Array.isArray(ids) || !ids.length || ids.some(i => i.provider === 'email'); }
  function closeMenu() { $('#acctMenu')?.remove(); $('#acctChip')?.setAttribute('aria-expanded', 'false'); }

  /* ---------- dialogs ---------- */
  function dialog(html, onMount) {
    closeDialog();
    const ov = document.createElement('div');
    ov.className = 'ov'; ov.id = 'acctOv';
    ov.innerHTML = `<div class="dlg" role="dialog" aria-modal="true">${html}</div>`;
    ov.addEventListener('mousedown', e => { if (e.target === ov) closeDialog(); });
    document.body.appendChild(ov);
    onMount?.(ov.querySelector('.dlg'));
    ov.querySelector('input, button.btn')?.focus();
  }
  function closeDialog() { $('#acctOv')?.remove(); }
  const msg = (dlg, text, kind = 'err') => { const el = dlg.querySelector('.msg-slot'); if (el) el.innerHTML = text ? `<div class="msg ${kind}">${text}</div>` : ''; };
  const busy = (btn, on, label) => { if (!btn) return; btn.disabled = on; if (label) btn.textContent = label; };
  const privacy = `<p class="note">Your figures are stored in a private database. Only you can read them when signed in. You can delete them any time from the account menu.</p>`;

  /* ---------- Google sign-in (shown only once it's switched on in Supabase) ---------- */
  let googleOn = null;
  const googleReady = fetch(SUPABASE_URL + '/auth/v1/settings', { headers: { apikey: SUPABASE_KEY } })
    .then(r => r.ok ? r.json() : null).then(j => { googleOn = !!j?.external?.google; return googleOn; }).catch(() => (googleOn = false));
  const G_LOGO = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
  const googleBlock = `<div class="g-slot" hidden><button type="button" class="gbtn">${G_LOGO}<span>Continue with Google</span></button><div class="orline" style="margin-top:14px">or use your email</div></div>`;
  function mountGoogle(dlg) {
    const slot = dlg.querySelector('.g-slot'); if (!slot) return;
    const show = () => { if (googleOn) slot.hidden = false; };
    googleOn === null ? googleReady.then(show) : show();
    const b = slot.querySelector('.gbtn');
    b.onclick = async () => {
      b.disabled = true; b.querySelector('span').textContent = 'Opening Google…';
      const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: SITE, queryParams: { prompt: 'select_account' } } });
      if (error) { b.disabled = false; b.querySelector('span').textContent = 'Continue with Google'; msg(dlg, esc(error.message)); }
    };
  }

  function showSignIn(prefill = '') {
    dialog(`<h2>Sign in</h2><p class="small muted">Keep your figures in sync on your phone, PC and any browser.</p>
      ${googleBlock}
      <form id="fSignIn" novalidate>
        <div style="display:flex;flex-direction:column;gap:10px">
          <div class="fld"><label for="siEmail">Email</label><input id="siEmail" type="email" autocomplete="email" required value="${esc(prefill)}"></div>
          <div class="fld"><label for="siPw">Password</label><input id="siPw" type="password" autocomplete="current-password" required></div>
          <div class="msg-slot"></div>
          <div class="actions"><button class="btn primary" type="submit" id="siGo">Sign in</button></div>
        </div>
      </form>
      <div class="links"><button class="linkbtn" id="toSignUp">Create an account</button><button class="linkbtn" id="toForgot">Forgot password?</button></div>
      ${privacy}`, dlg => {
      mountGoogle(dlg);
      dlg.querySelector('#toSignUp').onclick = () => showSignUp(dlg.querySelector('#siEmail').value);
      dlg.querySelector('#toForgot').onclick = () => showForgot(dlg.querySelector('#siEmail').value);
      dlg.querySelector('#fSignIn').onsubmit = async e => {
        e.preventDefault();
        const email = dlg.querySelector('#siEmail').value.trim(), password = dlg.querySelector('#siPw').value;
        if (!email || !password) return msg(dlg, 'Enter your email and password.');
        const b = dlg.querySelector('#siGo'); busy(b, true, 'Signing in…');
        const { error } = await sb.auth.signInWithPassword({ email, password });
        busy(b, false, 'Sign in');
        if (error) {
          if (/confirm/i.test(error.message)) return msg(dlg, 'Please confirm your email first. Open the link we sent you, then sign in.');
          if (/invalid/i.test(error.message)) return msg(dlg, 'That email and password don’t match. Check them, or reset your password.');
          return msg(dlg, esc(error.message));
        }
        closeDialog();
      };
    });
  }
  function showSignUp(prefill = '') {
    dialog(`<h2>Create an account</h2><p class="small muted">Free. Your figures sync across your devices.</p>
      ${googleBlock}
      <form id="fSignUp" novalidate>
        <div style="display:flex;flex-direction:column;gap:10px">
          <div class="fld"><label for="suEmail">Email</label><input id="suEmail" type="email" autocomplete="email" required value="${esc(prefill)}"></div>
          <div class="fld"><label for="suPw">Password (at least 8 characters)</label><input id="suPw" type="password" autocomplete="new-password" minlength="8" required></div>
          <div class="msg-slot"></div>
          <div class="actions"><button class="btn primary" type="submit" id="suGo">Create account</button></div>
        </div>
      </form>
      <div class="links"><button class="linkbtn" id="toSignIn">I already have an account</button></div>
      ${privacy}`, dlg => {
      mountGoogle(dlg);
      dlg.querySelector('#toSignIn').onclick = () => showSignIn(dlg.querySelector('#suEmail').value);
      dlg.querySelector('#fSignUp').onsubmit = async e => {
        e.preventDefault();
        const email = dlg.querySelector('#suEmail').value.trim(), password = dlg.querySelector('#suPw').value;
        if (!/^\S+@\S+\.\S+$/.test(email)) return msg(dlg, 'Enter a valid email address.');
        if (password.length < 8) return msg(dlg, 'Use at least 8 characters for your password.');
        const b = dlg.querySelector('#suGo'); busy(b, true, 'Creating…');
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: SITE } });
        busy(b, false, 'Create account');
        if (error) return msg(dlg, /registered|exists/i.test(error.message) ? 'There’s already an account with this email. Sign in instead.' : esc(error.message));
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return msg(dlg, 'There’s already an account with this email. Sign in instead.');
        if (!data.session) {
          dialog(`<h2>Check your email</h2><p>We sent a confirmation link to <b>${esc(email)}</b>. Open it on this device to finish creating your account. Your figures stay here in the meantime.</p>
            <p class="note">Can’t find it? Check your spam or promotions folder.</p>
            <div class="actions"><button class="btn primary" id="okBtn">OK</button></div>`, d => { d.querySelector('#okBtn').onclick = closeDialog; });
        } else closeDialog();
      };
    });
  }
  function showForgot(prefill = '') {
    dialog(`<h2>Reset your password</h2><p class="small muted">We’ll email you a link to set a new password.</p>
      <form id="fForgot" novalidate><div style="display:flex;flex-direction:column;gap:10px">
        <div class="fld"><label for="fpEmail">Email</label><input id="fpEmail" type="email" autocomplete="email" required value="${esc(prefill)}"></div>
        <div class="msg-slot"></div>
        <div class="actions"><button class="btn primary" type="submit" id="fpGo">Send reset link</button></div>
      </div></form>
      <div class="links"><button class="linkbtn" id="toSignIn">Back to sign in</button></div>`, dlg => {
      dlg.querySelector('#toSignIn').onclick = () => showSignIn(dlg.querySelector('#fpEmail').value);
      dlg.querySelector('#fForgot').onsubmit = async e => {
        e.preventDefault();
        const email = dlg.querySelector('#fpEmail').value.trim();
        if (!email) return msg(dlg, 'Enter your email.');
        const b = dlg.querySelector('#fpGo'); busy(b, true, 'Sending…');
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: SITE });
        busy(b, false, 'Send reset link');
        if (error) return msg(dlg, esc(error.message));
        msg(dlg, `If there’s an account for ${esc(email)}, a reset link is on its way.`, 'ok');
      };
    });
  }
  function showNewPassword(title = 'Set a new password') {
    dialog(`<h2>${title}</h2>
      <form id="fPw" novalidate><div style="display:flex;flex-direction:column;gap:10px">
        <div class="fld"><label for="npPw">New password (at least 8 characters)</label><input id="npPw" type="password" autocomplete="new-password" minlength="8" required></div>
        <div class="msg-slot"></div>
        <div class="actions"><button class="btn primary" type="submit" id="npGo">Save password</button></div>
      </div></form>`, dlg => {
      dlg.querySelector('#fPw').onsubmit = async e => {
        e.preventDefault();
        const password = dlg.querySelector('#npPw').value;
        if (password.length < 8) return msg(dlg, 'Use at least 8 characters.');
        const b = dlg.querySelector('#npGo'); busy(b, true, 'Saving…');
        const { error } = await sb.auth.updateUser({ password });
        busy(b, false, 'Save password');
        if (error) return msg(dlg, esc(error.message));
        msg(dlg, 'Password saved.', 'ok'); setTimeout(closeDialog, 1200);
      };
    });
  }
  function summary(o) {
    const debts = (o.debts || []).filter(d => +d.balance > 0);
    const owed = debts.reduce((a, d) => a + (+d.balance || 0), 0);
    return `<b>₱${Math.round(owed).toLocaleString('en-PH')}</b><span>${debts.length} debt${debts.length === 1 ? '' : 's'}</span>`;
  }
  function showConflict(local, cloud, cloudAt) {
    dialog(`<h2>Which figures should we keep?</h2>
      <p>This device has figures that are different from the ones saved in your account.</p>
      <div class="cmp"><div><span class="small muted">On this device</span>${summary(local)}</div><div><span class="small muted">In your account · ${esc(when(cloudAt))}</span>${summary(cloud)}</div></div>
      <div class="actions"><button class="btn" id="keepLocal">Keep this device’s</button><button class="btn primary" id="keepCloud">Use my account’s</button></div>
      <p class="note">The figures you don’t choose are replaced. Make a backup first if you’re not sure.</p>`, dlg => {
      dlg.querySelector('#keepCloud').onclick = () => { App.set(cloud); synced(JSON.stringify(cloud)); App.status('ok', 'Synced to your account'); closeDialog(); };
      dlg.querySelector('#keepLocal').onclick = () => { closeDialog(); push(JSON.stringify(local)); };
    });
  }
  function showSignOut() {
    dialog(`<h2>Sign out</h2><p>Your figures stay safe in your account. Do you also want to remove them from this device?</p>
      <p class="note">Remove them if this is a shared or public computer.</p>
      <div class="actions"><button class="btn" id="soKeep">Keep on this device</button><button class="btn primary" id="soRemove">Remove from this device</button></div>`, dlg => {
      const go = async remove => { await flush(); await sb.auth.signOut(); setMeta({}); if (remove) App.reset(); closeDialog(); };
      dlg.querySelector('#soKeep').onclick = () => go(false);
      dlg.querySelector('#soRemove').onclick = () => go(true);
    });
  }
  function showDelete() {
    dialog(`<h2>Delete my figures?</h2><p>This permanently deletes the figures saved in your account and on this device. It can’t be undone.</p>
      <div class="msg-slot"></div>
      <div class="actions"><button class="btn" id="dlNo">Cancel</button><button class="btn danger" id="dlYes">Delete permanently</button></div>
      <p class="note">Your sign-in stays so you can start again later.</p>`, dlg => {
      dlg.querySelector('#dlNo').onclick = closeDialog;
      dlg.querySelector('#dlYes').onclick = async () => {
        const b = dlg.querySelector('#dlYes'); busy(b, true, 'Deleting…');
        clearTimeout(saveT); pending = null;
        const { error } = await sb.from('ledgers').delete().eq('user_id', user.id);
        if (error) { busy(b, false, 'Delete permanently'); return msg(dlg, 'Couldn’t delete right now. Check your connection and try again.'); }
        setMeta({}); App.reset(); App.status('ok', 'Figures deleted');
        dialog(`<h2>Deleted</h2><p>Your figures were deleted from your account and this device.</p><div class="actions"><button class="btn primary" id="okBtn">OK</button></div>`, d => { d.querySelector('#okBtn').onclick = closeDialog; });
      };
    });
  }

  /* ---------- get the app ---------- */
  const DL = {
    pc: 'https://github.com/MaxAz1986/utang-tracker-web/releases/latest/download/Utang-Tracker-Setup.exe',
    android: new URL('downloads/UtangTracker.apk', BASE).href
  };
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
  const ua = navigator.userAgent;
  const isAndroid = /Android/i.test(ua), isIOS = /iPhone|iPad|iPod/i.test(ua), isWin = /Windows/i.test(ua);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  function showGetApp() {
    const card = (key, title, sub, body, rec) => `<div class="ga-card${rec ? ' rec' : ''}" data-k="${key}">
      <div class="ga-top"><span class="ga-ic">${title[0]}</span><div><b>${title}</b><span class="small muted">${sub}</span></div>${rec ? '<span class="pill good">For this device</span>' : ''}</div>${body}</div>`;
    const web = standalone ? '<p class="small muted">You’re already using the installed version.</p>'
      : installEvt ? `<button class="btn primary" id="gaInstall">Install Utang Tracker</button>`
      : isIOS ? '<p class="small">In Safari, tap <b>Share</b> then <b>Add to Home Screen</b>.</p>'
      : '<p class="small">In Chrome or Edge, open the browser menu and choose <b>Install Utang Tracker</b> (or <b>Add to Home screen</b> on Android).</p>';
    dialog(`<h2>Get the app</h2>
      <p class="small muted">Use Utang Tracker right here, install this website for sync on every device, or download an offline app.</p>
      <div class="ga-list">${[
        [!isWin && !isAndroid || isIOS, card('web', 'Install this website', 'Phone, tablet or PC · syncs with your account', web, !isWin && !isAndroid || isIOS)],
        [isWin, card('pc', 'Windows PC app', 'Windows 10 or 11 · about 80 MB', `<a class="btn primary" href="${DL.pc}" rel="noopener">Download for Windows</a>
          <ol class="ga-steps"><li>Open <b>Utang-Tracker-Setup.exe</b>.</li><li>If Windows SmartScreen appears, choose <b>More info → Run anyway</b>. The app isn’t code-signed.</li><li>Follow the setup. It adds a desktop and Start menu shortcut.</li></ol>`, isWin)],
        [isAndroid, card('android', 'Android app', 'Android 7 or newer · under 1 MB', `<a class="btn primary" href="${DL.android}" download="UtangTracker.apk">Download for Android</a>
          <ol class="ga-steps"><li>Open the downloaded <b>UtangTracker.apk</b>.</li><li>Allow installs from your browser or Files app when asked.</li><li>If Play Protect warns, choose <b>Install anyway</b>. The app isn’t from the Play Store.</li></ol>`, isAndroid)]
      ].sort((x, y) => (y[0] ? 1 : 0) - (x[0] ? 1 : 0)).map(x => x[1]).join('')}</div>
      <p class="note">The Windows and Android apps work fully offline and keep figures on that device only; they don’t sync with your account. Use <b>Backup</b> to move figures between them, or install this website to sync everywhere.</p>
      <div class="actions"><button class="btn" id="gaClose">Close</button></div>`, dlg => {
      dlg.querySelector('#gaClose').onclick = closeDialog;
      const ib = dlg.querySelector('#gaInstall');
      if (ib) ib.onclick = async () => { installEvt.prompt(); const r = await installEvt.userChoice.catch(() => null); installEvt = null; if (r?.outcome === 'accepted') closeDialog(); };
    });
  }
  const hb = document.querySelector('#backupBtn');
  if (hb) {
    const g = document.createElement('button');
    g.className = 'iconbtn'; g.id = 'getAppBtn';
    g.innerHTML = '<svg class="i" viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/></svg><span>Get app</span>';
    g.addEventListener('click', showGetApp);
    hb.parentNode.insertBefore(g, hb);
  }

  /* ---------- sync ---------- */
  async function push(json) {
    if (!user) return;
    pending = json;
    App.status('', 'Syncing…');
    const { error } = await sb.from('ledgers').upsert({ user_id: user.id, data: JSON.parse(json) }, { onConflict: 'user_id' });
    if (error) { App.status('local', navigator.onLine ? 'Saved on this device · sync failed, will retry' : 'Offline · saved on this device'); return false; }
    if (pending === json) pending = null;
    synced(json); lastPull = Date.now();
    App.status('ok', 'Synced to your account');
    return true;
  }
  async function flush() { clearTimeout(saveT); if (pending) await push(pending); }
  async function pull() {
    if (!user || pulling) return;
    pulling = true;
    try {
      const { data, error } = await sb.from('ledgers').select('data, updated_at').eq('user_id', user.id).maybeSingle();
      lastPull = Date.now();
      if (error) { App.status('local', 'Offline · saved on this device'); return; }
      const local = App.get(), localJson = JSON.stringify(local);
      if (!data) {
        if (!local.isExample) await push(localJson);
        else App.status('ok', 'Signed in · your figures will sync');
        return;
      }
      const cloud = data.data, cloudJson = JSON.stringify(cloud);
      if (cloudJson === localJson) { synced(localJson); App.status('ok', 'Synced to your account'); return; }
      const m = getMeta();
      const localChanged = !local.isExample && !(m.uid === user.id && m.h === hash(localJson));
      if (!localChanged) { App.set(cloud); synced(cloudJson); App.status('ok', 'Synced to your account'); return; }
      showConflict(local, cloud, data.updated_at);
    } finally { pulling = false; }
  }
  window.UtangCloud = {
    queueSave(json) {
      if (!user) { App.status('local', 'Saved in this browser · sign in to sync'); return; }
      pending = json; clearTimeout(saveT);
      App.status('', 'Syncing…');
      saveT = setTimeout(() => push(pending), 800);
    }
  };

  /* ---------- events ---------- */
  document.addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t) { if (!e.target.closest('.acct')) closeMenu(); return; }
    if (t.id === 'acctSignIn') return showSignIn();
    if (t.id === 'acctChip') return $('#acctMenu') ? closeMenu() : openMenu();
    const a = t.dataset.a;
    if (a) {
      closeMenu();
      if (a === 'sync') { flush().then(pull); }
      if (a === 'pw') showNewPassword('Change your password');
      if (a === 'out') showSignOut();
      if (a === 'del') showDelete();
      return;
    }
    if (!t.closest('.acct')) closeMenu();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenu(); closeDialog(); } });
  window.addEventListener('focus', () => { if (user && !pending && Date.now() - lastPull > 30000) pull(); });
  window.addEventListener('online', () => { if (pending) push(pending); });
  window.addEventListener('beforeunload', () => { if (pending) push(pending); });

  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') setTimeout(() => showNewPassword(), 0);
    const u = session?.user || null;
    if ((u?.id || null) !== (user?.id || null)) {
      user = u; renderAcct();
      if (user) setTimeout(pull, 0);
      else App.status(App.get().isExample ? '' : 'ok', App.get().isExample ? 'Example figures' : 'Saved in this browser · sign in to sync');
    }
  });
  renderAcct();
  // Arriving from the landing page's "Sign in" link: open the sign-in box once we know nobody is signed in.
  if (new URLSearchParams(location.search).has('signin')) {
    history.replaceState(null, '', location.pathname + location.hash);
    sb.auth.getSession().then(({ data }) => { if (!data?.session) showSignIn(); });
  }
  if (location.hash.includes('error_description')) {
    const p = new URLSearchParams(location.hash.slice(1));
    setTimeout(() => dialog(`<h2>That link didn’t work</h2><p>${esc(p.get('error_description') || 'The link has expired or was already used.')}</p><div class="actions"><button class="btn primary" id="okBtn">OK</button></div>`, d => { d.querySelector('#okBtn').onclick = closeDialog; }), 300);
    history.replaceState(null, '', location.pathname);
  }
})();
