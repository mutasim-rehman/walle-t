import argparse
import csv
import datetime as dt
import json
import time
from typing import Dict, Iterable, List, Optional

import requests
from bs4 import BeautifulSoup


BASE_URL = "https://dps.psx.com.pk/historical"
DEFAULT_TIMEOUT = 30


def five_years_ago(today: dt.date) -> dt.date:
    """Return same month/day 5 years earlier (or Feb-28 fallback)."""
    try:
        return today.replace(year=today.year - 5)
    except ValueError:
        # Handles leap-day.
        return today.replace(year=today.year - 5, day=28)


def iter_dates(start: dt.date, end: dt.date) -> Iterable[dt.date]:
    current = start
    while current <= end:
        yield current
        current += dt.timedelta(days=1)


def normalize_headers(headers: List[str]) -> List[str]:
    normalized = []
    for h in headers:
        key = h.strip().lower()
        key = key.replace("%", "pct")
        key = key.replace("(", "").replace(")", "")
        key = key.replace("-", "_")
        key = "_".join(key.split())
        normalized.append(key)
    return normalized


def parse_table(html: str) -> List[Dict[str, str]]:
    soup = BeautifulSoup(html, "html.parser")
    table = soup.select_one("#historicalTable")
    if not table:
        return []

    headers = [th.get_text(" ", strip=True) for th in table.select("thead th")]
    if not headers:
        return []

    keys = normalize_headers(headers)
    rows: List[Dict[str, str]] = []

    for tr in table.select("tbody tr"):
        cells = [td.get_text(" ", strip=True) for td in tr.select("td")]
        if not cells:
            continue
        row = {keys[i]: cells[i] if i < len(cells) else "" for i in range(len(keys))}
        rows.append(row)
    return rows


def fetch_one_date(session: requests.Session, date_str: str, retries: int = 3) -> Optional[str]:
    for attempt in range(1, retries + 1):
        try:
            response = session.post(
                BASE_URL,
                data={"date": date_str},
                timeout=DEFAULT_TIMEOUT,
            )
            response.raise_for_status()
            return response.text
        except requests.RequestException:
            if attempt == retries:
                return None
            time.sleep(1.5 * attempt)
    return None


def run_scrape(start_date: dt.date, end_date: dt.date, out_csv: str, out_jsonl: Optional[str], sleep_seconds: float) -> None:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) PSXHistoricalScraper/1.0",
            "Referer": "https://dps.psx.com.pk/historical",
        }
    )

    total_dates = (end_date - start_date).days + 1
    print(f"Date range: {start_date} -> {end_date} ({total_dates} dates)")

    csv_file = open(out_csv, "w", newline="", encoding="utf-8")
    jsonl_file = open(out_jsonl, "w", encoding="utf-8") if out_jsonl else None
    writer: Optional[csv.DictWriter] = None

    try:
        ok_dates = 0
        empty_dates = 0
        failed_dates = 0
        total_rows = 0

        for idx, d in enumerate(iter_dates(start_date, end_date), start=1):
            date_str = d.isoformat()
            html = fetch_one_date(session, date_str)
            if html is None:
                failed_dates += 1
                print(f"[{idx}/{total_dates}] {date_str} -> request failed")
                continue

            rows = parse_table(html)
            if not rows:
                empty_dates += 1
                print(f"[{idx}/{total_dates}] {date_str} -> no rows")
                if sleep_seconds > 0:
                    time.sleep(sleep_seconds)
                continue

            # Add query date to every row because this endpoint is date-based.
            for row in rows:
                row["query_date"] = date_str

            if writer is None:
                fieldnames = list(rows[0].keys())
                writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
                writer.writeheader()

            writer.writerows(rows)
            if jsonl_file:
                for row in rows:
                    jsonl_file.write(json.dumps(row, ensure_ascii=True) + "\n")

            ok_dates += 1
            total_rows += len(rows)
            print(f"[{idx}/{total_dates}] {date_str} -> {len(rows)} rows")

            if sleep_seconds > 0:
                time.sleep(sleep_seconds)

        print("\nDone.")
        print(f"Successful dates: {ok_dates}")
        print(f"Empty dates: {empty_dates}")
        print(f"Failed dates: {failed_dates}")
        print(f"Total rows written: {total_rows}")
        print(f"CSV output: {out_csv}")
        if out_jsonl:
            print(f"JSONL output: {out_jsonl}")
    finally:
        csv_file.close()
        if jsonl_file:
            jsonl_file.close()


def parse_args() -> argparse.Namespace:
    today = dt.date.today()
    default_start = five_years_ago(today)

    parser = argparse.ArgumentParser(
        description="Scrape PSX historical data for all dates in a range."
    )
    parser.add_argument(
        "--start-date",
        default=default_start.isoformat(),
        help="Start date (YYYY-MM-DD). Default: 5 years ago from today.",
    )
    parser.add_argument(
        "--end-date",
        default=today.isoformat(),
        help="End date (YYYY-MM-DD). Default: today.",
    )
    parser.add_argument(
        "--out-csv",
        default="psx_historical_5y.csv",
        help="Output CSV file path.",
    )
    parser.add_argument(
        "--out-jsonl",
        default=None,
        help="Optional output JSONL file path.",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=0.15,
        help="Sleep seconds between requests.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    start_date = dt.date.fromisoformat(args.start_date)
    end_date = dt.date.fromisoformat(args.end_date)

    if start_date > end_date:
        raise ValueError("start-date must be <= end-date")

    run_scrape(
        start_date=start_date,
        end_date=end_date,
        out_csv=args.out_csv,
        out_jsonl=args.out_jsonl,
        sleep_seconds=args.sleep,
    )


if __name__ == "__main__":
    main()
