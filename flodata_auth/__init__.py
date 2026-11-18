"""FloData single sign-on and role checks for FastAPI tools.

    from flodata_auth import FloDataAuth, User

    auth = FloDataAuth.from_env()          # FLODATA_ISSUER, FLODATA_CLIENT_ID, FLODATA_CLIENT_SECRET, FLODATA_APP_URL
    auth.install(app)                      # adds /auth/login, /auth/callback, /auth/logout + silent token refresh

    @app.get("/invoices")
    def invoices(user: User = Depends(auth.user)): ...                        # any role in this tool
    @app.delete("/invoices/{id}")
    def delete(id: int, user: User = Depends(auth.require("finance:approver"))): ...

Browsers: tokens live in httpOnly cookies set by this tool's backend (never in JavaScript).
APIs / scripts: send `Authorization: Bearer <access token>` instead; the same dependencies work.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from urllib.parse import quote, urlencode, urlsplit

import jwt
from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.responses import PlainTextResponse, RedirectResponse
from starlette.concurrency import run_in_threadpool

__all__ = ["FloDataAuth", "User"]

REFRESH_COOKIE_MAX_AGE = 7 * 24 * 3600  # the auth server decides real validity (12 h idle, 7 days max)


@dataclass(frozen=True)
class User:
    id: str
    email: str
    name: str
    department: str | None
    roles: frozenset[str]  # only this tool's roles, e.g. {"crm:viewer"}
    amr: tuple[str, ...]  # how they signed in, e.g. ("pwd", "mfa") or ("google",)
    claims: dict = field(repr=False, compare=False)

    def has(self, *roles: str) -> bool:
        return bool(self.roles & set(roles))

    @property
    def mfa(self) -> bool:
        return "mfa" in self.amr


def _b64(data: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(data).encode()).decode()


def _unb64(value: str | None) -> dict | None:
    try:
        return json.loads(base64.urlsafe_b64decode(value.encode())) if value else None
    except ValueError:
        return None


def _safe_next(nxt: str | None) -> str:
    return nxt if nxt and nxt.startswith("/") and not nxt.startswith("//") and "\\" not in nxt else "/"


class FloDataAuth:
    def __init__(self, issuer: str, client_id: str, client_secret: str, app_url: str, *,
                 server_url: str | None = None, prefix: str = "/auth", post_logout_url: str | None = None,
                 http_timeout: float = 10):
        """
        issuer       public URL of the auth service, e.g. https://auth.flodataanalytics.com
        app_url      public URL of this tool, e.g. https://crm.flodataanalytics.com
        server_url   optional URL this server uses to reach the auth service (e.g. inside docker); default issuer
        """
        self.issuer = issuer.rstrip("/")
        self.client_id = client_id
        self.client_secret = client_secret
        self.app_url = app_url.rstrip("/")
        self.server_url = (server_url or issuer).rstrip("/")
        self.prefix = prefix
        self.redirect_uri = f"{self.app_url}{prefix}/callback"
        self.post_logout_url = post_logout_url or f"{self.app_url}/"
        self.account_url = f"{self.issuer}/account"  # link this from your profile menu
        self.http_timeout = http_timeout
        base = f"flodata_{client_id}"
        self.access_cookie, self.refresh_cookie, self.state_cookie = f"{base}_at", f"{base}_rt", f"{base}_login"
        self.secure = self.app_url.startswith("https://")
        self.origin = "{0.scheme}://{0.netloc}".format(urlsplit(self.app_url))
        self._meta: dict | None = None
        self._keys: dict | None = None
        self._keys_at = 0.0
        self.user = self.require()  # Depends(auth.user): signed in with any role in this tool
        self.router = self._build_router()

    @classmethod
    def from_env(cls, **kwargs) -> "FloDataAuth":
        return cls(os.environ["FLODATA_ISSUER"], os.environ["FLODATA_CLIENT_ID"], os.environ["FLODATA_CLIENT_SECRET"],
                   os.environ["FLODATA_APP_URL"], server_url=os.environ.get("FLODATA_SERVER_URL") or None, **kwargs)

    def install(self, app: FastAPI) -> None:
        app.include_router(self.router)
        app.middleware("http")(self._refresh_middleware)

    # --- dependencies -----------------------------------------------------------------------------

    def require(self, *roles: str):
        """Dependency: signed in and holding at least one of `roles` (or any role of this tool if none given)."""
        def dependency(request: Request) -> User:
            user = self._authenticate(request)
            if roles and not user.has(*roles):
                raise HTTPException(403, f"Requires one of: {', '.join(roles)}")
            return user
        return dependency

    def _authenticate(self, request: Request) -> User:
        header = request.headers.get("authorization", "")
        token = (header[7:] if header.lower().startswith("bearer ")
                 else request.scope.get("flodata.access_token") or request.cookies.get(self.access_cookie))
        try:
            user = self.verify(token) if token else None
        except OSError:
            raise HTTPException(503, "Sign-in service unavailable") from None
        if user is None:
            if request.method == "GET" and "text/html" in request.headers.get("accept", ""):
                here = request.url.path + (f"?{request.url.query}" if request.url.query else "")
                raise HTTPException(303, headers={"Location": f"{self.prefix}/login?{urlencode({'next': here})}"})
            raise HTTPException(401, "Not signed in", headers={"WWW-Authenticate": "Bearer"})
        if not user.roles:
            raise HTTPException(403, "You don't have access to this tool")
        return user

    def verify(self, token: str) -> User | None:
        """Validates an access token locally (signature via cached JWKS, issuer, audience, expiry)."""
        try:
            header = jwt.get_unverified_header(token)
            if header.get("typ") != "at+jwt":  # refuse ID tokens and anything else
                return None
            claims = jwt.decode(token, self._signing_key(header.get("kid")), algorithms=["RS256"],
                                audience=self.client_id, issuer=self.issuer, leeway=30,
                                options={"require": ["exp", "iss", "aud", "sub"]})
        except jwt.PyJWTError:
            return None
        return User(id=claims["sub"], email=claims.get("email", ""), name=claims.get("name", ""),
                    department=claims.get("department"), roles=frozenset(claims.get("roles", [])),
                    amr=tuple(claims.get("amr", [])), claims=claims)

    # --- talking to the auth service (the two methods tests override) -------------------------------

    def _get_json(self, url: str) -> dict:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=self.http_timeout) as resp:
            return json.load(resp)

    def _post_form(self, url: str, data: dict) -> tuple[int, dict]:
        basic = base64.b64encode(f"{quote(self.client_id, safe='')}:{quote(self.client_secret, safe='')}".encode())
        req = urllib.request.Request(url, data=urlencode(data).encode(), headers={
            "Authorization": f"Basic {basic.decode()}", "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded"})
        try:
            with urllib.request.urlopen(req, timeout=self.http_timeout) as resp:
                status, body = resp.status, resp.read()
        except urllib.error.HTTPError as err:
            status, body = err.code, err.read()
        try:
            return status, json.loads(body) if body else {}
        except ValueError:
            return status, {}

    def _metadata(self) -> dict:
        if self._meta is None:
            meta = self._get_json(f"{self.server_url}/.well-known/openid-configuration")
            if meta.get("issuer") != self.issuer:
                raise RuntimeError(f"FLODATA_ISSUER is {self.issuer!r} but the server says {meta.get('issuer')!r}")
            self._meta = meta
        return self._meta

    def _backchannel(self, name: str) -> str:
        """Endpoint URL for server-to-server calls (public issuer swapped for server_url)."""
        url = self._metadata()[name]
        return self.server_url + url[len(self.issuer):] if url.startswith(self.issuer) else url

    def _signing_key(self, kid: str | None):
        stale = time.monotonic() - self._keys_at
        if self._keys is None or stale > 3600 or (kid not in self._keys and stale > 30):
            jwks = self._get_json(self._backchannel("jwks_uri"))
            self._keys = {k["kid"]: jwt.PyJWK(k).key for k in jwks["keys"]}
            self._keys_at = time.monotonic()
        if kid not in self._keys:
            raise jwt.InvalidTokenError("unknown signing key")
        return self._keys[kid]

    # --- cookies & silent refresh ------------------------------------------------------------------

    def _set_tokens(self, response, tokens: dict) -> None:
        opts = dict(httponly=True, secure=self.secure, samesite="lax", path="/")
        response.set_cookie(self.access_cookie, tokens["access_token"], max_age=int(tokens.get("expires_in", 600)), **opts)
        response.set_cookie(self.refresh_cookie, tokens["refresh_token"], max_age=REFRESH_COOKIE_MAX_AGE, **opts)

    def _clear_tokens(self, response) -> None:
        for name in (self.access_cookie, self.refresh_cookie):
            response.delete_cookie(name, path="/")

    @staticmethod
    def _expiring(access_token: str | None) -> bool:
        if not access_token:
            return True
        try:
            exp = jwt.decode(access_token, options={"verify_signature": False}).get("exp", 0)
        except jwt.PyJWTError:
            return True
        return exp - time.time() < 30

    def _refresh(self, refresh_token: str) -> dict | bool | None:
        """New tokens, False if the refresh token is dead (sign-out), None if the server is unreachable."""
        try:
            status, body = self._post_form(self._backchannel("token_endpoint"),
                                           {"grant_type": "refresh_token", "refresh_token": refresh_token})
        except OSError:
            return None
        return body if status == 200 and "access_token" in body else False

    def _cross_site_write(self, request: Request) -> bool:
        """CSRF: all FloData tools share one site (*.flodataanalytics.com), so SameSite cookies still ride along on
        requests from a sibling subdomain. A write that carries our cookies must come from this tool's own origin.
        (Browsers always send Origin on cross-origin writes; Bearer requests carry no cookies to abuse.)"""
        origin = request.headers.get("origin")
        return (request.method in ("POST", "PUT", "PATCH", "DELETE") and origin is not None and origin != self.origin
                and not request.headers.get("authorization")
                and (self.access_cookie in request.cookies or self.refresh_cookie in request.cookies))

    async def _refresh_middleware(self, request: Request, call_next):
        if self._cross_site_write(request):
            return PlainTextResponse("Cross-origin request blocked", 403)
        result = None
        refresh_token = request.cookies.get(self.refresh_cookie)
        if (refresh_token and not request.headers.get("authorization")
                and not request.url.path.startswith(self.prefix + "/")
                and self._expiring(request.cookies.get(self.access_cookie))):
            result = await run_in_threadpool(self._refresh, refresh_token)
            if result:
                request.scope["flodata.access_token"] = result["access_token"]
        response = await call_next(request)
        if result:
            self._set_tokens(response, result)
        elif result is False:
            self._clear_tokens(response)
        return response

    # --- /auth/login, /auth/callback, /auth/logout ------------------------------------------------

    def _build_router(self) -> APIRouter:
        router = APIRouter(prefix=self.prefix, include_in_schema=False)

        @router.get("/login")
        def login(next: str = "/"):
            state, nonce, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(32), secrets.token_urlsafe(64)
            challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
            url = self._metadata()["authorization_endpoint"] + "?" + urlencode({
                "client_id": self.client_id, "redirect_uri": self.redirect_uri, "response_type": "code",
                "scope": "openid email profile", "state": state, "nonce": nonce,
                "code_challenge": challenge, "code_challenge_method": "S256"})
            response = RedirectResponse(url, 302)
            response.set_cookie(self.state_cookie, _b64({"state": state, "nonce": nonce, "verifier": verifier,
                                                         "next": _safe_next(next)}),
                                max_age=600, httponly=True, secure=self.secure, samesite="lax", path=self.prefix)
            return response

        @router.get("/callback")
        def callback(request: Request, code: str = "", state: str = "", error: str = ""):
            saved = _unb64(request.cookies.get(self.state_cookie))
            if error:
                return PlainTextResponse(f"Sign-in did not complete ({error}).", 400)
            if not saved or not code or not secrets.compare_digest(state, saved.get("state", "")):
                return PlainTextResponse("Sign-in expired or was started elsewhere. Go back and try again.", 400)
            status, tokens = self._post_form(self._backchannel("token_endpoint"), {
                "grant_type": "authorization_code", "code": code, "redirect_uri": self.redirect_uri,
                "code_verifier": saved["verifier"]})
            if status != 200 or not self.verify(tokens.get("access_token", "")):
                return PlainTextResponse("Sign-in failed. Try again.", 400)
            try:
                id_claims = jwt.decode(tokens["id_token"], self._signing_key(jwt.get_unverified_header(
                    tokens["id_token"]).get("kid")), algorithms=["RS256"], audience=self.client_id,
                    issuer=self.issuer, leeway=30)
            except (jwt.PyJWTError, KeyError):
                return PlainTextResponse("Sign-in failed. Try again.", 400)
            if not secrets.compare_digest(str(id_claims.get("nonce", "")), saved["nonce"]):
                return PlainTextResponse("Sign-in failed. Try again.", 400)
            response = RedirectResponse(_safe_next(saved.get("next")), 303)
            self._set_tokens(response, tokens)
            response.delete_cookie(self.state_cookie, path=self.prefix)
            return response

        @router.get("/logout")
        def logout(request: Request):
            """Signs out of this tool and the central session (= every FloData tool)."""
            refresh_token = request.cookies.get(self.refresh_cookie)
            if refresh_token:
                try:
                    self._post_form(self._backchannel("revocation_endpoint"), {"token": refresh_token})
                except OSError:
                    pass
            response = RedirectResponse(self._metadata()["end_session_endpoint"] + "?" + urlencode({
                "client_id": self.client_id, "post_logout_redirect_uri": self.post_logout_url}), 303)
            self._clear_tokens(response)
            return response

        return router
