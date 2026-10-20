#!/usr/bin/env python3
"""Export Pelagic trips joined to boat registration data, as one CSV.

Usage:
    export PELAGIC_TOKEN=...   PELAGIC_SECRET=...
    python3 trips_with_registration.py 2026-09-25 2026-10-02 trips.csv

Makes two GET requests: boats/info, then trips for the date range.
Requires Python 3.7+; no extra packages.
"""
import csv, datetime, io, json, os, sys, urllib.request

BASE = "https://analytics.pelagicdata.com/api/%s/v1" % os.environ["PELAGIC_TOKEN"]
HEADERS = {"X-API-SECRET": os.environ["PELAGIC_SECRET"]}
BOAT_FIELDS = ["registrationNumber", "registrationAuthority", "registrationExpiration", "flag", "ownerName"]


def get(path):
    req = urllib.request.Request(BASE + path, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read().decode("utf-8")


def main(date_from, date_to, out_path):
    boats = json.loads(get("/boats/info"))
    by_device = {b["deviceId"]: b for b in boats if b.get("deviceId")}

    trips = csv.DictReader(io.StringIO(get("/trips/%s/%s?deviceInfo=true" % (date_from, date_to))))
    unmatched = 0
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(trips.fieldnames + BOAT_FIELDS)
        for t in trips:
            b = by_device.get(t["Device Id"])
            if b is None:
                unmatched += 1
                b = {}
            exp = b.get("registrationExpiration")
            b = dict(b, registrationExpiration=datetime.datetime.utcfromtimestamp(exp / 1000).strftime("%Y-%m-%d") if exp else "")
            w.writerow([t[k] for k in trips.fieldnames] + ["" if b.get(k) is None else b[k] for k in BOAT_FIELDS])
    print("wrote %s; trips with no matching boat: %d" % (out_path, unmatched))


if __name__ == "__main__":
    main(*sys.argv[1:4])
