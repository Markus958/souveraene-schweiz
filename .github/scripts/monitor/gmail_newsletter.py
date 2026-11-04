from __future__ import annotations

import base64
import hashlib
import html
import json
import os
import re
import tempfile
import urllib.parse
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Iterable

GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
STATE_SCHEMA_VERSION = 1
FEED_SCHEMA_VERSION = 1

_REJECT_TEXT = (
    "abmelden", "unsubscribe", "newsletter verwalten", "einstellungen", "datenschutz",
    "impressum", "online ansehen", "view in browser", "facebook", "instagram",
    "linkedin", "youtube", "twitter", "x.com", "weiterleiten", "teilen",
)
_TRACKING_PARAMS = {
    "url", "u", "target", "dest", "destination", "redirect", "redirect_url", "r",
}


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _atomic_json(path: Path, payload: dict[str, Any], mode: int = 0o600) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def _decode_websafe(value: str) -> str:
    if not value:
        return ""
    padding = "=" * (-len(value) % 4)
    raw = base64.urlsafe_b64decode(value + padding)
    return raw.decode("utf-8", errors="replace")


def _message_parts(payload: dict[str, Any]) -> tuple[list[str], list[str]]:
    plain: list[str] = []
    rich: list[str] = []

    def visit(part: dict[str, Any]) -> None:
        mime = str(part.get("mimeType") or "").casefold()
        body = part.get("body") if isinstance(part.get("body"), dict) else {}
        data = str(body.get("data") or "")
        if data and mime == "text/plain":
            plain.append(_decode_websafe(data))
        elif data and mime == "text/html":
            rich.append(_decode_websafe(data))
        for child in part.get("parts") or []:
            if isinstance(child, dict):
                visit(child)

    visit(payload)
    return plain, rich


def _clean_text(value: str) -> str:
    return html.unescape(re.sub(r"\s+", " ", value or "")).strip()


def _unwrap_url(value: str) -> str:
    value = html.unescape(value or "").strip()
    try:
        parsed = urllib.parse.urlparse(value)
    except ValueError:
        return value
    query = urllib.parse.parse_qs(parsed.query)
    for key in _TRACKING_PARAMS:
        for candidate in query.get(key, []):
            decoded = urllib.parse.unquote(candidate)
            if decoded.startswith(("https://", "http://")):
                return decoded
    return value


def _valid_article(title: str, url: str) -> bool:
    title = _clean_text(title)
    if len(title) < 18 or len(title) > 300:
        return False
    if any(term in title.casefold() for term in _REJECT_TEXT):
        return False
    try:
        parsed = urllib.parse.urlparse(url)
    except ValueError:
        return False
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return False
    if any(host in parsed.netloc.casefold() for host in ("mail.google.com", "accounts.google.com")):
        return False
    return True


class _NewsletterHtmlParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: list[tuple[str, str]] = []
        self._href: str | None = None
        self._parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.casefold() == "a":
            values = dict(attrs)
            href = values.get("href")
            if href:
                self._href = href
                self._parts = [str(values.get("aria-label") or values.get("title") or "")]
        elif tag.casefold() == "img" and self._href is not None:
            alt = dict(attrs).get("alt")
            if alt:
                self._parts.append(alt)

    def handle_data(self, data: str) -> None:
        if self._href is not None:
            value = _clean_text(data)
            if value:
                self._parts.append(value)

    def handle_endtag(self, tag: str) -> None:
        if tag.casefold() == "a" and self._href is not None:
            self.links.append((self._href, _clean_text(" ".join(self._parts))))
            self._href = None
            self._parts = []


@dataclass(frozen=True)
class NewsletterArticle:
    title: str
    url: str
    summary: str | None = None


def extract_articles(plain_parts: Iterable[str], html_parts: Iterable[str]) -> list[NewsletterArticle]:
    candidates: list[NewsletterArticle] = []
    for markup in html_parts:
        parser = _NewsletterHtmlParser()
        parser.feed(markup)
        for raw_url, raw_title in parser.links:
            url = _unwrap_url(raw_url)
            title = _clean_text(raw_title)
            if _valid_article(title, url):
                candidates.append(NewsletterArticle(title=title, url=url))

    url_pattern = re.compile(r"https?://[^\s<>\]\)\"']+")
    for text in plain_parts:
        lines = [line.strip() for line in text.splitlines()]
        for index, line in enumerate(lines):
            for match in url_pattern.finditer(line):
                url = _unwrap_url(match.group(0).rstrip(".,;:"))
                title = ""
                prefix = line[:match.start()].strip(" -–—:|")
                if prefix:
                    title = prefix
                elif index:
                    title = lines[index - 1].strip(" -–—:|")
                if _valid_article(title, url):
                    candidates.append(NewsletterArticle(title=_clean_text(title), url=url))

    unique: list[NewsletterArticle] = []
    seen: set[tuple[str, str]] = set()
    for item in candidates:
        key = (item.title.casefold(), item.url.split("#", 1)[0])
        if key not in seen:
            seen.add(key)
            unique.append(item)
    return unique


def message_to_findings(message: dict[str, Any], fetched_at: str | None = None) -> list[dict[str, Any]]:
    payload = message.get("payload") if isinstance(message.get("payload"), dict) else {}
    plain, rich = _message_parts(payload)
    articles = extract_articles(plain, rich)
    observed = fetched_at or _utcnow()
    internal_date = str(message.get("internalDate") or "")
    published_at = None
    if internal_date.isdigit():
        published_at = datetime.fromtimestamp(int(internal_date) / 1000, timezone.utc).isoformat()
    message_hash = hashlib.sha256(str(message.get("id") or "").encode("utf-8")).hexdigest()[:20]
    findings: list[dict[str, Any]] = []
    for article in articles:
        fingerprint = hashlib.sha256(
            f"gmail-newsletters|{article.title.casefold()}|{article.url}".encode("utf-8")
        ).hexdigest()
        findings.append({
            "source_id": "gmail-newsletters",
            "source_name": "Gmail Newsletter",
            "source_class": "C",
            "priority": "P2",
            "title": article.title,
            "url": article.url,
            "fingerprint": fingerprint,
            "fetched_at": observed,
            "published_at": published_at,
            "updated_at": None,
            "subtitle": None,
            "topics": [],
            "source_role": "newsletter_lead",
            "source_stage": "Newsletter-Hinweis",
            "newsletter_message_hash": message_hash,
        })
    return findings


def load_state(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict) and data.get("schema_version") == STATE_SCHEMA_VERSION:
            return data
    except (OSError, ValueError, TypeError):
        pass
    return {"schema_version": STATE_SCHEMA_VERSION, "history_id": None, "processed_message_ids": []}


def save_state(path: Path, state: dict[str, Any]) -> None:
    clean = {
        "schema_version": STATE_SCHEMA_VERSION,
        "history_id": str(state.get("history_id") or "") or None,
        "processed_message_ids": list(dict.fromkeys(state.get("processed_message_ids") or []))[-5000:],
        "updated_at": _utcnow(),
    }
    _atomic_json(path, clean)


def load_credentials(client_secret_path: Path, token_path: Path, oauth_port: int = 8766) -> Any:
    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
    except ImportError as exc:
        raise RuntimeError("Google OAuth dependencies missing; install requirements-gmail.txt") from exc

    credentials = None
    if token_path.is_file():
        credentials = Credentials.from_authorized_user_file(str(token_path), [GMAIL_READONLY_SCOPE])
    if credentials and credentials.expired and credentials.refresh_token:
        credentials.refresh(Request())
    if not credentials or not credentials.valid:
        flow = InstalledAppFlow.from_client_secrets_file(str(client_secret_path), [GMAIL_READONLY_SCOPE])
        credentials = flow.run_local_server(host="127.0.0.1", port=oauth_port, open_browser=False)
    _atomic_json(token_path, json.loads(credentials.to_json()))
    return credentials


def collect(service: Any, state: dict[str, Any], initial_query: str = "newer_than:7d") -> tuple[list[dict[str, Any]], dict[str, Any]]:
    users = service.users()
    processed = set(str(value) for value in state.get("processed_message_ids") or [])
    message_ids: list[str] = []
    history_id = state.get("history_id")

    if history_id:
        try:
            request = users.history().list(userId="me", startHistoryId=str(history_id), historyTypes=["messageAdded"])
            while request is not None:
                response = request.execute()
                for entry in response.get("history", []):
                    for added in entry.get("messagesAdded", []):
                        mid = str((added.get("message") or {}).get("id") or "")
                        if mid:
                            message_ids.append(mid)
                history_id = response.get("historyId") or history_id
                request = users.history().list_next(request, response)
        except Exception as exc:
            # Gmail returns HTTP 404 when an old historyId has expired. Recover
            # with the same bounded query used for the first synchronisation.
            status = getattr(getattr(exc, "resp", None), "status", None)
            if status != 404:
                raise
            history_id = None

    if not history_id:
        # Deliberately no sender or label filter: this dedicated mailbox is a
        # newsletter inbox and every newly added message is considered.
        request = users.messages().list(userId="me", q=initial_query, includeSpamTrash=True)
        while request is not None:
            response = request.execute()
            message_ids.extend(str(item.get("id") or "") for item in response.get("messages", []))
            request = users.messages().list_next(request, response)

    findings: list[dict[str, Any]] = []
    successfully_processed: list[str] = []
    for message_id in dict.fromkeys(message_ids):
        if not message_id or message_id in processed:
            continue
        message = users.messages().get(userId="me", id=message_id, format="full").execute()
        findings.extend(message_to_findings(message))
        successfully_processed.append(message_id)

    profile = users.getProfile(userId="me").execute()
    next_state = dict(state)
    next_state["history_id"] = str(profile.get("historyId") or history_id or "") or None
    next_state["processed_message_ids"] = list(processed) + successfully_processed
    return findings, next_state


def write_feed(path: Path, findings: list[dict[str, Any]], retention_days: int = 14) -> None:
    existing: list[dict[str, Any]] = []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(payload, dict) and isinstance(payload.get("findings"), list):
            existing = [item for item in payload["findings"] if isinstance(item, dict)]
    except (OSError, ValueError, TypeError):
        pass
    cutoff = datetime.now(timezone.utc) - timedelta(days=max(1, retention_days))
    merged: dict[str, dict[str, Any]] = {}
    for item in existing + findings:
        fingerprint = str(item.get("fingerprint") or "")
        if not fingerprint:
            continue
        raw_date = str(item.get("fetched_at") or "")
        try:
            observed = datetime.fromisoformat(raw_date.replace("Z", "+00:00"))
            if observed.tzinfo is None:
                observed = observed.replace(tzinfo=timezone.utc)
            if observed < cutoff:
                continue
        except ValueError:
            if item not in findings:
                continue
        merged[fingerprint] = item
    ordered = sorted(merged.values(), key=lambda item: str(item.get("fetched_at") or ""), reverse=True)[:1000]
    _atomic_json(path, {
        "schema_version": FEED_SCHEMA_VERSION,
        "generated_at": _utcnow(),
        "findings": ordered,
    })


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Read Gmail newsletters and write a sanitised monitor feed.")
    parser.add_argument("--client-secret", type=Path, required=True)
    parser.add_argument("--token", type=Path, required=True)
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--feed", type=Path, required=True)
    parser.add_argument("--initial-query", default="newer_than:7d")
    parser.add_argument("--oauth-port", type=int, default=8766)
    args = parser.parse_args()

    credentials = load_credentials(args.client_secret, args.token, oauth_port=args.oauth_port)
    try:
        from googleapiclient.discovery import build
    except ImportError as exc:
        raise RuntimeError("Google API client missing; install requirements-gmail.txt") from exc
    service = build("gmail", "v1", credentials=credentials, cache_discovery=False)
    state = load_state(args.state)
    findings, next_state = collect(service, state, initial_query=args.initial_query)
    write_feed(args.feed, findings)
    save_state(args.state, next_state)
    print(json.dumps({"messages_considered": len(set(next_state.get("processed_message_ids", []))) - len(set(state.get("processed_message_ids", []))), "findings": len(findings)}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
