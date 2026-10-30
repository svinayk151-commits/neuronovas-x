# Food Safety and Limitations

GoodPlate is a prototype for coordinating surplus-food listings and pickups. It does **not** certify food safety, inspect food, or guarantee that a listing or pickup is safe.

## Food-safety assumptions and responsibilities

- Donors are responsible for accurate preparation, handling, storage, quantity, and use-by information and for following all applicable local food-safety rules.
- The donor's safety attestation is an acknowledgement only. It is not evidence that the platform validated the food or its handling.
- Recipients should inspect food before accepting it, transport and store it appropriately, and follow their own safety procedures. Recipients may decline food that does not meet their requirements.
- Use-by and pickup-window checks are user-provided timestamps. They are workflow controls, not safety measurements.
- The prototype does not monitor food temperature, cold-chain conditions, kitchen practices, or transport.

## Operational limitations

- No real identity verification or verification of donor/recipient credentials, registrations, or eligibility documents.
- No legal or regulatory compliance guarantees.
- No payment processing, email/SMS delivery, or real-time external notifications. Notifications are in-app only.
- Supabase PostgreSQL stores application data. The prototype does not define a production backups, monitoring, or disaster-recovery policy.
- No map, GPS, or independently verified distance/location data.
- Data and credentials are demo-only. Names, organization details, addresses, phone numbers, and listings are fictional. Do not enter real personal or sensitive information.

## Platform framing

The platform is a coordination tool, not a food-safety certification system. Donors remain responsible for their food and recipients remain responsible for inspection and safe handling. The platform cannot verify either party's identity or food-safety practices.
