# Modern CSRF Protection in Node.js: Secure Alternatives to csurf

## Why `csurf` was Deprecated

The `csurf` library was deprecated on September 13, 2022, due to security vulnerabilities discovered by Fortbridge. The main vulnerability involves "cookie tossing" attacks where an attacker controlling a subdomain can bypass CSRF protection by overriding the CSRF cookie. However, there's debate about whether these vulnerabilities are actually flaws in the library itself or exploitations of inherent CSRF limitations.

## Modern Secure Alternatives

### 1. **`csrf-sync`** (Recommended for Session-Based Apps)
- **Pattern**: Synchronizer Token Pattern (stateful)
- **Downloads**: ~2k weekly downloads
- **Best for**: Applications using `express-session`
- **GitHub**: https://github.com/Psifi-Solutions/csrf-sync

This package provides server-side state-based CSRF protection using the Synchronizer Token Pattern, storing tokens in sessions.

```javascript
const { csrfSynchronisedProtection } = require('csrf-sync');

app.use(csrfSynchronisedProtection);

// Generate token for forms
app.get('/form', (req, res) => {
  res.render('form', { csrfToken: req.csrfToken() });
});

// Protected route
app.post('/transfer', csrfSynchronisedProtection, (req, res) => {
  // Process secure form submission
  res.json({ success: true });
});
```

### 2. **`csrf-csrf`** (Recommended for Stateless Apps)
- **Pattern**: Double Submit Cookie Pattern (stateless)
- **Downloads**: ~38k weekly downloads
- **Best for**: Stateless applications, APIs
- **GitHub**: https://github.com/Psifi-Solutions/csrf-csrf

This module implements stateless CSRF protection using the Double Submit Cookie Pattern with HMAC-based tokens.

```javascript
const { doubleCsrf } = require('csrf-csrf');

const { 
  generateCsrfToken, 
  validateCsrfToken, 
  doubleCsrfProtection 
} = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET,
  cookieName: '__HOST-psifi.x-csrf-token',
  cookieOptions: {
    sameSite: 'strict',
    secure: true,
    httpOnly: true
  }
});

app.use(doubleCsrfProtection);

// Generate token endpoint
app.get('/csrf-token', (req, res) => {
  res.json({ 
    csrfToken: generateCsrfToken(req, res) 
  });
});

// Protected route
app.post('/api/transfer', doubleCsrfProtection, (req, res) => {
  // Process secure API request
  res.json({ success: true });
});
```

### 3. **`@dr.pogodin/csurf`** (Fork of Original)
- **Pattern**: Multiple patterns supported
- **Approach**: A maintained fork of the original `csurf` package with updated dependencies and TypeScript support

The maintainer argues that the original deprecation was based on misunderstanding of the library's implementation and that it's actually secure when properly configured.

```javascript
const csrf = require('@dr.pogodin/csurf');
const csrfProtection = csrf({ cookie: true });

app.use(csrfProtection);

app.get('/form', csrfProtection, (req, res) => {
  res.render('form', { csrfToken: req.csrfToken() });
});

app.post('/process', csrfProtection, (req, res) => {
  res.send('Form processed securely');
});
```

## Modern Best Practices for CSRF Protection

### 1. **Use Proper Cookie Configuration**
```javascript
// Modern secure cookie settings
const cookieOptions = {
  sameSite: 'strict',      // Prevents cross-site sending
  secure: true,            // HTTPS only
  httpOnly: true,          // No JavaScript access
  path: '/',
  domain: undefined        // Don't set domain to prevent subdomain attacks
};

// Apply to session cookies
app.use(session({
  cookie: cookieOptions,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));
```

### 2. **Implement Cookie Prefixes**
Use `__Host-` prefix to prevent subdomain cookie tossing:
```javascript
const { doubleCsrf } = require('csrf-csrf');

const csrfConfig = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET,
  cookieName: '__HOST-csrf-token',  // Secure prefix
  cookieOptions: {
    sameSite: 'strict',
    secure: true,
    httpOnly: true
  }
});
```

### 3. **Use Custom Headers Instead of Form Fields**
```javascript
// Client-side JavaScript
async function makeSecureRequest(data) {
  // Get CSRF token first
  const tokenResponse = await fetch('/csrf-token');
  const { csrfToken } = await tokenResponse.json();
  
  // Make authenticated request with token in header
  const response = await fetch('/api/transfer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken  // Custom header (more secure than form fields)
    },
    credentials: 'same-origin',  // Include cookies
    body: JSON.stringify(data)
  });
  
  return response.json();
}
```

### 4. **Alternative: Custom Header Approach**
A simple approach is requiring a custom header on all state-changing requests:

```javascript
// Simple CSRF protection via custom headers
app.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    // Require custom header for state-changing operations
    if (!req.headers['x-requested-with']) {
      return res.status(403).json({ 
        error: 'Missing required header for CSRF protection' 
      });
    }
  }
  next();
});

// Client must include header
fetch('/api/data', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest'  // Required header
  },
  body: JSON.stringify(data)
});
```

### 5. **SameSite Cookies as Additional Protection**
Modern browsers support SameSite cookies as a defense mechanism, though older browsers have limited support:

```javascript
// Configure session with SameSite protection
app.use(session({
  secret: process.env.SESSION_SECRET,
  cookie: {
    sameSite: 'strict',  // or 'lax' for more compatibility
    secure: true,        // HTTPS only
    httpOnly: true,      // Prevent XSS access
    maxAge: 1000 * 60 * 60 * 24 // 24 hours
  },
  resave: false,
  saveUninitialized: false
}));
```

## Complete Implementation Examples

### Session-Based App with `csrf-sync`
```javascript
const express = require('express');
const session = require('express-session');
const { csrfSynchronisedProtection } = require('csrf-sync');

const app = express();

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict'
  }
}));

// CSRF protection
app.use(csrfSynchronisedProtection);

// Routes
app.get('/form', (req, res) => {
  res.render('form', { 
    csrfToken: req.csrfToken() 
  });
});

app.post('/submit', (req, res) => {
  // Automatically protected by csrf-sync
  res.json({ message: 'Form submitted successfully' });
});

app.listen(3000);
```

### Stateless API with `csrf-csrf`
```javascript
const express = require('express');
const cookieParser = require('cookie-parser');
const { doubleCsrf } = require('csrf-csrf');

const app = express();

app.use(cookieParser());
app.use(express.json());

// Configure CSRF protection
const {
  generateCsrfToken,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET,
  cookieName: '__HOST-csrf-token',
  cookieOptions: {
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true
  },
  getTokenFromRequest: (req) => {
    return req.headers['x-csrf-token'];
  }
});

// Token generation endpoint
app.get('/api/csrf-token', (req, res) => {
  const token = generateCsrfToken(req, res);
  res.json({ csrfToken: token });
});

// Protected API routes
app.use('/api', doubleCsrfProtection);

app.post('/api/users', (req, res) => {
  // Protected endpoint
  res.json({ message: 'User created successfully' });
});

app.listen(3000);
```

## Recommendations by Use Case

### 1. **Session-Based Web Applications**
- **Use**: `csrf-sync`
- **Why**: Leverages existing session infrastructure, follows synchronizer token pattern

### 2. **Stateless APIs/SPAs**
- **Use**: `csrf-csrf`
- **Why**: No server-side state required, works well with REST APIs

### 3. **Conservative/Legacy Applications**
- **Use**: `@dr.pogodin/csurf`
- **Why**: Drop-in replacement for original csurf with continued maintenance

### 4. **JWT/Bearer Token Authentication**
- **Use**: No CSRF protection needed
- **Why**: Tokens must be manually included in requests, making CSRF impossible

## Additional Security Measures

1. **Implement CORS properly**
```javascript
const cors = require('cors');

app.use(cors({
  origin: ['https://yourdomain.com'],  // Specific origins only
  credentials: true,                   // Allow cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE']
}));
```

2. **Use HTTPS Strict Transport Security**
```javascript
app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
```

3. **Validate referrer headers**
```javascript
app.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    const referer = req.get('Referer');
    if (!referer || !referer.startsWith('https://yourdomain.com')) {
      return res.status(403).json({ error: 'Invalid referer' });
    }
  }
  next();
});
```

## Conclusion

The key to modern CSRF protection is:
1. Choose the right pattern for your architecture (stateful vs stateless)
2. Implement proper cookie security measures
3. Use secure headers and prefixes
4. Layer multiple protection mechanisms
5. Keep dependencies updated

The deprecation of `csurf` led to better, more focused alternatives. Choose `csrf-sync` for session-based apps, `csrf-csrf` for stateless applications, or the maintained `@dr.pogodin/csurf` fork for a conservative approach.