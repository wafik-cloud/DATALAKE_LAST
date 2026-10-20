# Exporting trips with boat registration data

This produces one CSV with one row per trip. Each row carries that boat's registration
number, registration authority and registration expiration.

## What you need

- Your Pelagic API **token** and **secret**, issued by Pelagic. They return the boats and
  trips of the account the token belongs to.
- Python 3.7 or later. No extra packages are needed.
- The script `trips_with_registration.py`, sent with this note.

## Running it

```bash
export PELAGIC_TOKEN=your-token
export PELAGIC_SECRET=your-secret
python3 trips_with_registration.py 2026-09-25 2026-10-02 trips.csv
```

The two dates are the date range, in `YYYY-MM-DD` format (UTC). The last argument is the
output file.

## What the script does

It makes two requests:

1. `GET https://analytics.pelagicdata.com/api/{token}/v1/boats/info` returns your boats and
   their registration data, as JSON.
2. `GET https://analytics.pelagicdata.com/api/{token}/v1/trips/{from}/{to}?deviceInfo=true`
   returns the trips in the range, as CSV. `deviceInfo=true` adds the `IMEI` and
   `Device Id` columns.

Both requests send the secret in the header `X-API-SECRET: {secret}`.

Each trip is matched to a boat where the trip's `Device Id` equals the boat's `deviceId`.

This match has known limits:

- A trip's `Device Id` is the device that recorded the trip. A boat's `deviceId` is the
  device on the boat now.
- A trip whose device has since been removed from its boat matches no boat. Its boat
  columns are empty, and the script prints the count of these trips.
- A trip whose device has since moved to another boat matches that other boat. Nothing in
  the output marks these rows. A difference between the trip's `Boat Name` and the boat it
  was matched to is one sign of this.
- Boat names and registration numbers are not unique, so matching on them can join a trip
  to the wrong boat.

## Output columns

- **Trip columns:** `Trip, Started, Ended, Boat, Boat Name, Boat Gear, Community,
  Duration (Seconds), Range (Meters), Distance (Meters), Created, Updated, IMEI, Device Id`
- **Boat columns:** `registrationNumber, registrationAuthority, registrationExpiration, flag,
  ownerName`

Timestamps are UTC. `registrationExpiration` is written as `YYYY-MM-DD`.

## Things to know

- **The range is applied to trip end times.** Trips that began before the start date can be
  included. For 2026-09-25 to 2026-10-02, 21 of 289 trips started before 2026-09-25.
- **Up to 10,000 trips per request.** For long periods, run the script one month at a time.
- **Errors.** A wrong token or secret returns `401 Unauthorized`. An expired subscription
  returns a subscription error, not an empty file.
