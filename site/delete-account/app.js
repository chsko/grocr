// Sign in (Google or Apple) and delete the Grocr account, using the same backend calls as the
// app: Convex Auth's `auth:signIn` and `account:deleteAccount` over Convex's HTTP API. Tokens
// live in sessionStorage only for this tab.
(function () {
  var config = window.GROCR_CONFIG;
  var main = document.querySelector('main');
  var errorBox = document.querySelector('.error');
  var KEY_TOKEN = 'grocr.delete.token';
  var KEY_VERIFIER = 'grocr.delete.verifier';
  var apple = null; // { nonce, hashedNonce } prepared ahead so the popup opens on the click

  function store(key, value) {
    try {
      if (value === null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, value);
    } catch (e) {}
  }
  function load(key) {
    try {
      return sessionStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function setState(state) {
    main.dataset.state = state;
  }
  function busy(on) {
    main.classList.toggle('busy', on);
  }
  function fail(error) {
    if (error) console.error(error);
    busy(false);
    errorBox.hidden = false;
  }

  async function call(kind, path, args, token) {
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    var response = await fetch(config.convexUrl + '/api/' + kind, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ path: path, args: args || {}, format: 'json' }),
    });
    var body = await response.json();
    if (body.status !== 'success') {
      var error = new Error(body.errorMessage || 'Request failed');
      error.data = body.errorData;
      throw error;
    }
    return body.value;
  }

  function hex(buffer) {
    return Array.from(new Uint8Array(buffer), function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  }
  async function prepareApple() {
    var nonce = hex(crypto.getRandomValues(new Uint8Array(32)));
    var hashed = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce)));
    apple = { nonce: nonce, hashedNonce: hashed };
  }
  function loadAppleScript() {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src =
        'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function finishSignIn(result) {
    if (!result || !result.tokens) throw new Error('No tokens');
    store(KEY_TOKEN, result.tokens.token);
    await showAccount();
  }

  async function showAccount() {
    var token = load(KEY_TOKEN);
    if (!token) return setState('signed-out');
    var me = null;
    try {
      me = await call('query', 'users:me', {}, token);
    } catch (e) {}
    if (!me) {
      store(KEY_TOKEN, null);
      return setState('signed-out');
    }
    document.querySelectorAll('[data-field="who"]').forEach(function (el) {
      el.textContent = me.user.email || me.user.name || '';
    });
    document.querySelectorAll('[data-field="family"]').forEach(function (el) {
      el.textContent = me.family ? me.family.name : '';
    });
    document.querySelector('[data-show-if="family"]').hidden = !me.family;
    document.querySelector('[data-show-if="no-family"]').hidden = Boolean(me.family);
    setState('signed-in');
  }

  async function signInWithGoogle() {
    var result = await call('action', 'auth:signIn', {
      provider: 'google',
      params: { redirectTo: config.redirectUrl },
    });
    store(KEY_VERIFIER, result.verifier);
    window.location.href = result.redirect;
  }

  async function finishGoogle(code) {
    var verifier = load(KEY_VERIFIER);
    store(KEY_VERIFIER, null);
    var result = await call('action', 'auth:signIn', {
      params: { code: code },
      verifier: verifier,
    });
    await finishSignIn(result);
  }

  async function signInWithApple() {
    var prepared = apple;
    if (!window.AppleID || !prepared) throw new Error('Apple sign-in is not ready');
    window.AppleID.auth.init({
      clientId: config.appleServicesId,
      scope: 'name email',
      redirectURI: config.redirectUrl,
      nonce: prepared.hashedNonce,
      usePopup: true,
    });
    var response;
    try {
      response = await window.AppleID.auth.signIn();
    } catch (error) {
      void prepareApple();
      if (error && error.error === 'popup_closed_by_user') return busy(false);
      throw error;
    }
    void prepareApple();
    var user = response.user && response.user.name;
    var name = user ? [user.firstName, user.lastName].filter(Boolean).join(' ') : '';
    var params = {
      identityToken: response.authorization.id_token,
      nonce: prepared.nonce,
      // Lets the backend keep a token to revoke at Apple when the account is deleted.
      authorizationCode: response.authorization.code,
      redirectUri: config.redirectUrl,
    };
    if (name) params.name = name;
    var result = await call('action', 'auth:signIn', { provider: 'apple', params: params });
    await finishSignIn(result);
  }

  async function deleteAccount() {
    var token = load(KEY_TOKEN);
    await call('mutation', 'account:deleteAccount', {}, token);
    store(KEY_TOKEN, null);
    setState('deleted');
  }

  async function signOut() {
    var token = load(KEY_TOKEN);
    store(KEY_TOKEN, null);
    try {
      await call('action', 'auth:signOut', {}, token);
    } catch (e) {}
    setState('signed-out');
  }

  var actions = {
    google: signInWithGoogle,
    apple: signInWithApple,
    delete: deleteAccount,
    'sign-out': signOut,
  };
  document.addEventListener('click', function (event) {
    var button = event.target.closest && event.target.closest('[data-action]');
    if (!button || main.classList.contains('busy')) return;
    errorBox.hidden = true;
    busy(true);
    actions[button.dataset.action]().then(function () {
      busy(false);
    }, fail);
  });
  var confirmBox = document.querySelector('[data-field="confirm"]');
  confirmBox.addEventListener('change', function () {
    document.querySelector('[data-action="delete"]').disabled = !confirmBox.checked;
  });

  void loadAppleScript().catch(function () {});
  void prepareApple();

  var query = new URLSearchParams(window.location.search);
  var code = query.get('code');
  if (code) {
    // Drop the one-time code from the address bar and history.
    window.history.replaceState(null, '', window.location.pathname);
    finishGoogle(code).catch(function (error) {
      setState('signed-out');
      fail(error);
    });
  } else {
    showAccount().catch(function (error) {
      setState('signed-out');
      fail(error);
    });
  }
})();
