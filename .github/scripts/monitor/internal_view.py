from __future__ import annotations

import html
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from config import REPO_ROOT
from storage import write_json

STATE_DIR = REPO_ROOT / "data" / "monitor" / "state"


def _load(name: str, default: Any) -> Any:
    path = STATE_DIR / name
    if not path.is_file():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _source_rows(event_id: str, event: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for src in event.get("sources", []) or []:
        rows.append({
            "type": "source",
            "event_id": event_id,
            "date": src.get("first_seen") or src.get("last_seen"),
            "title": src.get("title"),
            "status": event.get("current_status"),
            "source": src.get("source_name") or src.get("source_id"),
            "institution": src.get("source_name") or src.get("source_id"),
            "url": src.get("url"),
            "risk": ", ".join(event.get("risk_dossiers", []) or event.get("risk_ids", []) or []),
            "score": event.get("current_score"),
            "stage": src.get("source_stage") or event.get("current_source_stage"),
        })
    return rows


def build_index() -> dict[str, Any]:
    news = _load("news_state.json", {})
    risks = _load("risk_state.json", {})
    procedures = _load("procedure_state.json", {})
    reminders = _load("reminders.json", {"items": {}})
    runs = _load("run_history.json", {"runs": []})

    rows: list[dict[str, Any]] = []

    for event_id, event in (news.get("events", {}) or {}).items():
        if not isinstance(event, dict):
            continue
        risk_ids = event.get("risk_dossiers", []) or event.get("risk_ids", []) or []
        rows.append({
            "type": "event",
            "event_id": event_id,
            "date": event.get("first_seen"),
            "updated": event.get("last_seen"),
            "title": event.get("current_title"),
            "status": event.get("current_status"),
            "source": ", ".join(sorted({str(s.get('source_name') or s.get('source_id') or '') for s in event.get('sources', []) if isinstance(s, dict)})),
            "institution": ", ".join(sorted({str(s.get('source_name') or '') for s in event.get('sources', []) if isinstance(s, dict) and s.get('source_name')})),
            "risk": ", ".join(risk_ids),
            "score": event.get("current_score"),
            "stage": event.get("current_source_stage"),
            "reasons": ", ".join(str(v) for v in event.get("current_reasons", []) or []),
            "baseline_confirmed": event.get("baseline_confirmed"),
        })
        rows.extend(_source_rows(event_id, event))
        for hist in event.get("history", []) or []:
            rows.append({
                "type": "event-history",
                "event_id": event_id,
                "date": hist.get("observed_at"),
                "title": hist.get("title") or event.get("current_title"),
                "status": hist.get("classification"),
                "risk": ", ".join(risk_ids),
                "score": hist.get("score"),
                "stage": hist.get("source_stage"),
                "reasons": ", ".join(str(v) for v in hist.get("reasons", []) or []),
            })

    for risk_id, risk in (risks.get("risks", {}) or {}).items():
        if not isinstance(risk, dict):
            continue
        for hist in risk.get("history", []) or []:
            rows.append({
                "type": "risk-history",
                "date": hist.get("checked_at"),
                "title": risk.get("title") or risk_id,
                "status": hist.get("status"),
                "risk": risk_id,
                "source": ", ".join(str(s.get("source_name") or s.get("source_id") or "") for s in hist.get("sources", []) or []),
                "institution": ", ".join(str(s.get("source_name") or "") for s in hist.get("sources", []) or [] if s.get("source_name")),
                "details": f"new_items={hist.get('new_items', 0)}; baseline_advanced={hist.get('baseline_advanced')}"
            })

    for key, page in (procedures.get("pages", {}) or {}).items():
        if not isinstance(page, dict):
            continue
        for hist in page.get("history", []) or []:
            rows.append({
                "type": "procedure-history",
                "date": hist.get("checked_at"),
                "title": f"{page.get('watch_id', '')} / {page.get('page', '')}",
                "status": hist.get("status"),
                "source": "Europäisches Parlament / OEIL",
                "institution": "Europäisches Parlament",
                "url": page.get("url"),
                "details": hist.get("error") or "",
            })

    reminder_items = []
    for reminder_id, item in (reminders.get("items", {}) or {}).items():
        if not isinstance(item, dict):
            continue
        row = {
            "type": "reminder",
            "reminder_id": reminder_id,
            "date": item.get("created_at"),
            "updated": item.get("updated_at"),
            "title": item.get("title"),
            "status": item.get("status"),
            "risk": item.get("risk_id") or ", ".join(item.get("risk_ids", []) or []),
            "source": ", ".join(item.get("failed_sources", []) or item.get("missing_sources", []) or []),
            "details": item.get("reason"),
            "url": item.get("url"),
            "reminder_type": item.get("type"),
        }
        rows.append(row)
        reminder_items.append(row)

    for run in runs.get("runs", []) or []:
        rows.append({
            "type": "run",
            "date": run.get("started_at"),
            "updated": run.get("finished_at"),
            "title": f"Monitor run: {run.get('mode', '')}",
            "status": run.get("status"),
            "details": f"reliability={run.get('run_reliability')}; new={run.get('new_findings')}; selected={run.get('selected_events')}; reminders={run.get('open_reminders')}",
        })

    rows.sort(key=lambda r: str(r.get("date") or r.get("updated") or ""), reverse=True)
    reminder_items.sort(key=lambda r: (r.get("status") != "open", str(r.get("updated") or "")), reverse=False)
    return {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "rows": rows,
        "reminders": reminder_items,
        "counts": {
            "rows": len(rows),
            "open_reminders": sum(1 for r in reminder_items if r.get("status") == "open"),
            "events": len(news.get("events", {}) or {}),
            "runs": len(runs.get("runs", []) or []),
        },
    }


def _html(payload: dict[str, Any]) -> str:
    data = json.dumps(payload, ensure_ascii=False).replace("</", "<\\/")
    return f'''<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Interner Monitor</title>
<style>
body{{font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:24px;background:#f6f7f8;color:#111}}h1{{margin:0 0 6px}}.muted{{color:#666}}.toolbar{{display:grid;grid-template-columns:2fr repeat(4,1fr);gap:8px;margin:18px 0}}input,select{{padding:9px;border:1px solid #bbb;border-radius:6px;background:white}}.metrics{{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0}}.metric{{background:white;padding:10px 14px;border-radius:7px;border:1px solid #ddd}}table{{width:100%;border-collapse:collapse;background:white;font-size:14px}}th,td{{padding:8px;border-bottom:1px solid #eee;text-align:left;vertical-align:top}}th{{position:sticky;top:0;background:#fafafa}}.open{{font-weight:700}}a{{color:#0645ad}}@media(max-width:900px){{.toolbar{{grid-template-columns:1fr 1fr}}table{{display:block;overflow:auto}}}}
</style></head><body>
<h1>Interner Monitor</h1><div class="muted">Nicht für GitHub Pages bestimmt. Durchsucht Historie, Quellen und Reminder.</div>
<div id="metrics" class="metrics"></div>
<div class="toolbar"><input id="q" placeholder="Suche: Person, Institution, Thema, Quelle, Keyword"><select id="type"><option value="">Alle Typen</option></select><select id="status"><option value="">Alle Status</option></select><select id="risk"><option value="">Alle Risiken</option></select><select id="score"><option value="">Post-Score alle</option><option value="8">≥ 8</option><option value="12">≥ 12</option><option value="16">≥ 16</option></select></div>
<table><thead><tr><th>Datum</th><th>Typ</th><th>Status</th><th>Titel</th><th>Risiko</th><th>Quelle / Institution</th><th>Score</th></tr></thead><tbody id="rows"></tbody></table>
<script id="payload" type="application/json">{data}</script><script>
const D=JSON.parse(document.getElementById('payload').textContent), $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>\"]/g,c=>({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}}[c]));
function opt(id,vals){{const e=$(id); [...new Set(vals.filter(Boolean))].sort().forEach(v=>e.insertAdjacentHTML('beforeend',`<option>${{esc(v)}}</option>`));}}
opt('type',D.rows.map(r=>r.type)); opt('status',D.rows.map(r=>r.status)); opt('risk',D.rows.flatMap(r=>String(r.risk||'').split(',').map(x=>x.trim())));
function render(){{const q=$('q').value.toLowerCase(), typ=$('type').value, st=$('status').value, risk=$('risk').value, min=Number($('score').value||0); const rows=D.rows.filter(r=>{{const hay=Object.values(r).join(' ').toLowerCase(); return (!q||hay.includes(q))&&(!typ||r.type===typ)&&(!st||r.status===st)&&(!risk||String(r.risk||'').split(',').map(x=>x.trim()).includes(risk))&&(!min||Number(r.score||0)>=min)}}); $('rows').innerHTML=rows.slice(0,1000).map(r=>`<tr><td>${{esc((r.date||'').slice(0,19))}}</td><td>${{esc(r.type)}}</td><td class="${{r.status==='open'?'open':''}}">${{esc(r.status)}}</td><td>${{r.url?`<a href="${{esc(r.url)}}" target="_blank" rel="noopener">${{esc(r.title)}}</a>`:esc(r.title)}}</td><td>${{esc(r.risk)}}</td><td>${{esc([r.source,r.institution].filter(Boolean).join(' / '))}}</td><td>${{esc(r.score)}}</td></tr>`).join(''); $('metrics').innerHTML=`<div class=metric>Treffer <b>${{rows.length}}</b></div><div class=metric>Events <b>${{D.counts.events}}</b></div><div class=metric>Offene Reminder <b>${{D.counts.open_reminders}}</b></div><div class=metric>Runs <b>${{D.counts.runs}}</b></div>`}}
['q','type','status','risk','score'].forEach(id=>$(id).addEventListener(id==='q'?'input':'change',render)); render();
</script></body></html>'''


def main() -> int:
    output_dir = Path(os.getenv("MONITOR_OUTPUT_DIR", "monitor-out"))
    output_dir.mkdir(parents=True, exist_ok=True)
    payload = build_index()
    write_json(output_dir / "internal-monitor-index.json", payload)
    (output_dir / "internal-monitor.html").write_text(_html(payload), encoding="utf-8")
    print(f"Internal monitor view: rows={payload['counts']['rows']}; open_reminders={payload['counts']['open_reminders']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
